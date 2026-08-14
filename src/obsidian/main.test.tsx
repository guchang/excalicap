import type { ReactElement } from "react";
import { createRoot } from "react-dom/client";
import type { ProjectSaveHandle } from "../App";
import type { ProjectSnapshot } from "../project/project-storage";
import ExcalicapPlugin, { ExcalicapView } from "./main";

const render = vi.fn();
const unmount = vi.fn();

vi.mock("react-dom/client", () => ({
  createRoot: vi.fn(() => ({ render, unmount })),
}));

vi.mock("../App", () => ({ default: () => null }));
vi.mock("./laser-pointer-alignment", () => ({
  installLaserPointerAlignment: () => vi.fn(),
}));

describe("ExcalicapView same-file updates", () => {
  const snapshot = (id: string): ProjectSnapshot => ({
    version: 1,
    updatedAt: 1,
    projectTitle: "Project",
    currentSlideId: id,
    elements: [{ id, type: "frame" }],
    appState: {},
    files: {},
  });

  const createView = (
    classifyInternalWrite = vi.fn(() => null as "own" | "other" | null),
  ) =>
    new ExcalicapView(
      {} as never,
      {
        classifyInternalWrite,
        persistInternalWrite: vi.fn(
          async (_view, _data, save: () => Promise<void>) => save(),
        ),
        loadData: vi.fn(async () => null),
        saveData: vi.fn(async () => undefined),
      } as never,
    );

  const attachSaveHandle = (handle: ProjectSaveHandle) => {
    const app = render.mock.calls[0]?.[0] as ReactElement<{
      onProjectSaveHandleChange: (handle: ProjectSaveHandle) => void;
    }>;
    app.props.onProjectSaveHandleChange(handle);
  };

  beforeEach(() => {
    render.mockClear();
    unmount.mockClear();
    vi.mocked(createRoot).mockClear();
  });

  it("keeps the mounted canvas when Obsidian updates the same file", () => {
    const view = createView();

    view.setViewData(JSON.stringify(snapshot("slide-1")), true);
    view.setViewData(JSON.stringify(snapshot("slide-2")), false);

    expect(createRoot).toHaveBeenCalledOnce();
    expect(unmount).not.toHaveBeenCalled();
  });

  it("defers another Excalicap view's save until this view becomes active", async () => {
    const classifyInternalWrite = vi.fn(() => "other" as const);
    const view = createView(classifyInternalWrite);
    const load = vi.fn(async () => undefined);
    view.setViewData(JSON.stringify(snapshot("slide-1")), true);
    attachSaveHandle({ flush: vi.fn(async () => undefined), load });

    view.setViewData(JSON.stringify(snapshot("slide-2")), false);
    await Promise.resolve();

    expect(load).not.toHaveBeenCalled();
    view.onBecameActive();
    await Promise.resolve();
    expect(load).toHaveBeenCalledWith(snapshot("slide-2"));
  });

  it("applies an external file change to an open view immediately", async () => {
    const view = createView();
    const load = vi.fn(async () => undefined);
    view.setViewData(JSON.stringify(snapshot("slide-1")), true);
    attachSaveHandle({ flush: vi.fn(async () => undefined), load });

    view.setViewData(JSON.stringify(snapshot("external-slide")), false);
    await Promise.resolve();

    expect(load).toHaveBeenCalledWith(snapshot("external-slide"));
    expect(createRoot).toHaveBeenCalledOnce();
    expect(unmount).not.toHaveBeenCalled();
  });

  it("broadcasts a Vault modification to every view of that Excalicap file", async () => {
    const plugin = new ExcalicapPlugin({} as never, {} as never);
    const matchingView = createView();
    const otherView = createView();
    Object.assign(matchingView.file!, {
      path: "Project.excalicap",
      extension: "excalicap",
    });
    Object.assign(otherView.file!, {
      path: "Other.excalicap",
      extension: "excalicap",
    });
    const setMatchingData = vi.spyOn(matchingView, "setViewData");
    const setOtherData = vi.spyOn(otherView, "setViewData");
    const modified = JSON.stringify(snapshot("external-slide"));
    Object.assign(plugin, {
      app: {
        vault: { read: vi.fn(async () => modified) },
        workspace: {
          getLeavesOfType: vi.fn(() => [
            { view: matchingView },
            { view: otherView },
          ]),
        },
      },
    });

    await plugin.syncModifiedProject({
      path: "Project.excalicap",
      extension: "excalicap",
    } as never);

    expect(setMatchingData).toHaveBeenCalledWith(modified, false);
    expect(setOtherData).not.toHaveBeenCalled();
  });
});
