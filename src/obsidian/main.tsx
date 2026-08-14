import { Plugin, TextFileView, TFile, type WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import App, { type ProjectSaveHandle } from "../App";
import { ensureLibraryReturnTarget } from "../library/library-return-target";
import type { ProjectSnapshot } from "../project/project-storage";
import "../styles.css";
import { installLaserPointerAlignment } from "./laser-pointer-alignment";
import { createObsidianLibraryAdapter } from "./library-storage";
import {
  createObsidianProjectStorage,
  type ObsidianProjectStorage,
} from "./project-storage";
import {
  EXCALICAP_EXTENSION,
  EXCALICAP_VIEW_TYPE,
  registerExcalicapView,
} from "./registration";
import { flushBeforeViewSave } from "./view-lifecycle";

export class ExcalicapView extends TextFileView {
  private root: Root | null = null;
  private removeLaserPointerAlignment: (() => void) | null = null;
  private projectSaveHandle: ProjectSaveHandle | null = null;
  private projectStorage: ObsidianProjectStorage | null = null;
  private pendingViewData: {
    readonly data: string;
    readonly waitForActivation: boolean;
  } | null = null;
  private readonly setProjectSaveHandle = (handle: ProjectSaveHandle | null) => {
    this.projectSaveHandle = handle;
    if (
      handle &&
      this.pendingViewData &&
      (!this.pendingViewData.waitForActivation || this.isActiveView())
    ) {
      void this.applyPendingViewData();
    }
  };

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: ExcalicapPlugin,
  ) {
    super(leaf);
  }

  getViewType() {
    return EXCALICAP_VIEW_TYPE;
  }

  getDisplayText() {
    return this.file?.basename ?? "Excalicap";
  }

  getIcon() {
    return "presentation";
  }

  getViewData() {
    return this.data;
  }

  setViewData(data: string, clear: boolean) {
    if (clear || !this.root) {
      if (clear) {
        this.clear();
      }
      this.data = data;
      this.pendingViewData = null;
      this.mountApp();
      return;
    }
    if (data === this.data) {
      return;
    }
    const internalWrite = this.plugin.classifyInternalWrite(this, data);
    this.data = data;
    if (internalWrite === "own") {
      return;
    }
    this.projectStorage?.acceptExternalData(data);
    this.pendingViewData = {
      data,
      waitForActivation: internalWrite === "other",
    };
    if (internalWrite !== "other") {
      void this.applyPendingViewData();
    }
  }

  onBecameActive() {
    if (this.pendingViewData?.waitForActivation) {
      void this.applyPendingViewData();
    }
  }

  private isActiveView() {
    return this.app.workspace.getMostRecentLeaf() === this.leaf;
  }

  private async applyPendingViewData() {
    const pending = this.pendingViewData;
    const handle = this.projectSaveHandle;
    if (!pending || !handle) {
      return;
    }
    const snapshot = this.parseProject(pending.data);
    if (snapshot === undefined) {
      if (this.pendingViewData === pending) {
        this.pendingViewData = null;
      }
      return;
    }
    await handle.load(snapshot);
    if (this.pendingViewData === pending) {
      this.pendingViewData = null;
    }
  }

  clear() {
    this.pendingViewData = null;
    this.projectStorage = null;
    this.removeLaserPointerAlignment?.();
    this.removeLaserPointerAlignment = null;
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
  }

  private parseProject(data: string): ProjectSnapshot | null | undefined {
    const trimmed = data.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed) as ProjectSnapshot;
    } catch {
      return undefined;
    }
  }

  private parseInitialProject(): ProjectSnapshot | null | undefined {
    return this.parseProject(this.data);
  }

  private async persistProject() {
    await this.plugin.persistInternalWrite(this, this.data, () => this.save());
  }

  private async flushAndSave(save: () => Promise<void>) {
    await flushBeforeViewSave(
      () => this.projectSaveHandle?.flush() ?? Promise.resolve(),
      save,
    );
  }

  async onUnloadFile(file: TFile) {
    await this.flushAndSave(() => super.onUnloadFile(file));
  }

  async onClose() {
    await this.flushAndSave(() => this.save());
    this.clear();
  }

  private mountApp() {
    this.root?.unmount();
    this.contentEl.empty();
    this.contentEl.addClass("excalicap-obsidian-view");
    const container = this.contentEl.createDiv({
      cls: "excalicap-obsidian-root",
    });
    this.removeLaserPointerAlignment = installLaserPointerAlignment(container);
    this.projectStorage = createObsidianProjectStorage({
      read: () => this.data,
      readPersisted: () =>
        this.file ? this.app.vault.read(this.file) : Promise.resolve(this.data),
      write: (next) => {
        this.data = next;
      },
      requestSave: () => this.requestSave(),
      persist: () => this.persistProject(),
    });
    const initialProject = this.parseInitialProject();
    const libraryAdapter = createObsidianLibraryAdapter({
      loadData: () => this.plugin.loadData(),
      saveData: (next) => this.plugin.saveData(next),
    });
    this.root = createRoot(container);
    this.root.render(
      <App
        initialProject={initialProject}
        libraryAdapter={libraryAdapter}
        onProjectSaveHandleChange={this.setProjectSaveHandle}
        projectFileName={this.file?.name ?? null}
        projectStorage={this.projectStorage}
        showProjectFileActions={false}
      />,
    );
  }
}

export default class ExcalicapPlugin extends Plugin {
  private internalWrite: {
    readonly source: ExcalicapView;
    readonly data: string;
    readonly expiresAt: number;
  } | null = null;

  async onload() {
    const assetPath = this.app.vault.adapter.getResourcePath(
      `${this.app.vault.configDir}/plugins/excalicap/excalidraw-assets`,
    );
    (
      window as Window & { EXCALIDRAW_ASSET_PATH?: string }
    ).EXCALIDRAW_ASSET_PATH = `${assetPath}/`;
    ensureLibraryReturnTarget(window);
    registerExcalicapView(
      this,
      (leaf) => new ExcalicapView(leaf as WorkspaceLeaf, this),
    );
    this.registerEvent(
      this.app.workspace.on("active-leaf-change", (leaf) => {
        if (leaf?.view instanceof ExcalicapView) {
          leaf.view.onBecameActive();
        }
      }),
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (file instanceof TFile) {
          void this.syncModifiedProject(file);
        }
      }),
    );
    this.addCommand({
      id: "create-project",
      name: "新建 Excalicap 项目",
      callback: () => void this.createProject(),
    });
  }

  classifyInternalWrite(view: ExcalicapView, data: string) {
    const write = this.internalWrite;
    if (!write || write.expiresAt < Date.now() || write.data !== data) {
      return null;
    }
    return write.source === view ? "own" : "other";
  }

  async persistInternalWrite(
    source: ExcalicapView,
    data: string,
    save: () => Promise<void>,
  ) {
    this.internalWrite = {
      source,
      data,
      expiresAt: Date.now() + 5_000,
    };
    await save();
  }

  async syncModifiedProject(file: TFile) {
    if (file.extension !== EXCALICAP_EXTENSION) {
      return;
    }
    const data = await this.app.vault.read(file);
    this.app.workspace
      .getLeavesOfType(EXCALICAP_VIEW_TYPE)
      .forEach((leaf) => {
        if (
          leaf.view instanceof ExcalicapView &&
          leaf.view.file?.path === file.path
        ) {
          leaf.view.setViewData(data, false);
        }
      });
  }

  private async createProject() {
    const path = this.nextProjectPath();
    const file = await this.app.vault.create(path, "");
    await this.app.workspace.getLeaf(true).openFile(file);
  }

  private nextProjectPath() {
    const base = "Excalicap";
    let index = 1;
    let path = `${base}.${EXCALICAP_EXTENSION}`;
    while (this.app.vault.getAbstractFileByPath(path)) {
      index += 1;
      path = `${base} ${index}.${EXCALICAP_EXTENSION}`;
    }
    return path;
  }
}
