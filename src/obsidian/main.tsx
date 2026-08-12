import { Plugin, TextFileView, type TFile, type WorkspaceLeaf } from "obsidian";
import { createRoot, type Root } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import App, { type ProjectSaveHandle } from "../App";
import { ensureLibraryReturnTarget } from "../library/library-return-target";
import "../styles.css";
import { createObsidianLibraryAdapter } from "./library-storage";
import { createObsidianProjectStorage } from "./project-storage";
import {
  EXCALICAP_EXTENSION,
  EXCALICAP_VIEW_TYPE,
  registerExcalicapView,
} from "./registration";
import { flushBeforeViewSave } from "./view-lifecycle";

class ExcalicapView extends TextFileView {
  private root: Root | null = null;
  private projectSaveHandle: ProjectSaveHandle | null = null;
  private readonly setProjectSaveHandle = (handle: ProjectSaveHandle | null) => {
    this.projectSaveHandle = handle;
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
    if (clear) {
      this.clear();
    }
    this.data = data;
    this.mountApp();
  }

  clear() {
    this.root?.unmount();
    this.root = null;
    this.contentEl.empty();
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
    const projectStorage = createObsidianProjectStorage({
      read: () => this.data,
      write: (next) => {
        this.data = next;
      },
      requestSave: () => this.requestSave(),
    });
    const libraryAdapter = createObsidianLibraryAdapter({
      loadData: () => this.plugin.loadData(),
      saveData: (next) => this.plugin.saveData(next),
    });
    this.root = createRoot(container);
    this.root.render(
      <App
        libraryAdapter={libraryAdapter}
        onProjectSaveHandleChange={this.setProjectSaveHandle}
        projectFileName={this.file?.name ?? null}
        projectStorage={projectStorage}
        showProjectFileActions={false}
      />,
    );
  }

  private async flushAndSave(save: () => Promise<void>) {
    await flushBeforeViewSave(
      () => this.projectSaveHandle?.flush() ?? Promise.resolve(),
      save,
    );
  }
}

export default class ExcalicapPlugin extends Plugin {
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
    this.addCommand({
      id: "create-project",
      name: "新建 Excalicap 项目",
      callback: () => void this.createProject(),
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
