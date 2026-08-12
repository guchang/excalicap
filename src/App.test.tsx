import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, vi } from "vitest";
import App from "./App";
import { DEFAULT_SETTINGS } from "./product/output-presets";
import { MediaRecorderEngine } from "./recording/media-recorder-engine";

const projectStorageHarness = vi.hoisted(() => ({
  snapshot: null as null | Record<string, unknown>,
}));
const libraryHarness = vi.hoisted(() => ({
  adapter: {
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
  },
  onChange: null as
    | ((items: Array<Record<string, unknown>>) => void)
    | null,
  options: [] as Array<Record<string, unknown>>,
}));
const projectFileHarness = vi.hoisted(() => ({
  open: vi.fn(),
  save: vi.fn(),
}));
const compositorHarness = vi.hoisted(() => ({
  setWhiteboard: vi.fn(),
  setCamera: vi.fn(),
  setCursor: vi.fn(),
  updateLaser: vi.fn(),
  clearLaser: vi.fn(),
  setBackground: vi.fn(),
  draw: vi.fn(),
  dispose: vi.fn(),
}));
const exportHarness = vi.hoisted(() => ({
  backgrounds: [] as boolean[],
  dimensions: [] as Array<{ width: number; height: number }>,
  frameIds: [] as string[],
}));

vi.mock("./project/project-storage", async () => {
  const actual =
    await vi.importActual<typeof import("./project/project-storage")>(
      "./project/project-storage",
    );
  return {
    ...actual,
    createBrowserProjectStorage: () =>
      actual.createProjectStorage({
        load: async () =>
          projectStorageHarness.snapshot as unknown as import("./project/project-storage").ProjectSnapshot,
        save: async (snapshot) => {
          projectStorageHarness.snapshot =
            snapshot as unknown as Record<string, unknown>;
        },
        clear: async () => {
          projectStorageHarness.snapshot = null;
        },
      }),
  };
});

vi.mock("./project/project-file", async () => {
  const actual =
    await vi.importActual<typeof import("./project/project-file")>(
      "./project/project-file",
    );
  return {
    ...actual,
    createBrowserProjectFileGateway: () => projectFileHarness,
  };
});

vi.mock("./library/library-storage", async () => {
  const actual =
    await vi.importActual<typeof import("./library/library-storage")>(
      "./library/library-storage",
    );
  return {
    ...actual,
    createBrowserPermanentLibraryAdapter: () => libraryHarness.adapter,
  };
});

let sceneElements: Array<Record<string, unknown>> = [];
let editorOnChange:
  | ((
      elements: Array<Record<string, unknown>>,
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => void)
  | null = null;
let editorOnPointerUpdate:
  | ((payload: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => void)
  | null = null;

class BrowserTrack {
  public stopped = false;
  public constructor(
    public readonly kind: "video" | "audio",
    public readonly source: string = kind,
  ) {}
  public get label() {
    return this.source;
  }
  public stop() {
    this.stopped = true;
  }
}

class BrowserStream {
  public constructor(private readonly tracks: BrowserTrack[]) {}
  public getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }
  public getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
  public getTracks() {
    return [...this.tracks];
  }
}

class BrowserRecorder {
  public static isTypeSupported() {
    return true;
  }
  public state: RecordingState = "inactive";
  public readonly mimeType: string;
  public ondataavailable: ((event: { data: Blob }) => void) | null = null;
  public onstop: (() => void) | null = null;
  public onerror: ((event: { error: Error }) => void) | null = null;
  private readonly stopError: Error | null;
  public constructor(stream: BrowserStream, options: MediaRecorderOptions) {
    this.mimeType = options.mimeType ?? "video/webm";
    recorderStreams.push(stream);
    this.stopError = recorderStopErrors.shift() ?? null;
  }
  public start() {
    this.state = "recording";
  }
  public pause() {
    this.state = "paused";
  }
  public resume() {
    this.state = "recording";
  }
  public stop() {
    this.state = "inactive";
    if (this.stopError) {
      this.onerror?.({ error: this.stopError });
      return;
    }
    this.ondataavailable?.({ data: new Blob(["recording"]) });
    this.onstop?.();
  }
}

const recorderStreams: BrowserStream[] = [];
const recorderStopErrors: Array<Error | null> = [];
let createObjectURL: ReturnType<typeof vi.fn>;
let revokeObjectURL: ReturnType<typeof vi.fn>;

const fakeApi = {
  getSceneElements: () => sceneElements,
  getAppState: () => ({
    exportBackground: false,
    viewBackgroundColor: "#ffffff",
    isLoading: true,
  }),
  getFiles: () => ({}),
  addFiles: vi.fn(),
  updateLibrary: vi.fn(async () => []),
  resetScene: vi.fn(() => {
    sceneElements = [];
  }),
  updateScene: vi.fn(
    ({
      elements,
    }: {
      elements?: Array<Record<string, unknown>>;
      appState?: Record<string, unknown>;
    }) => {
      if (elements) {
        sceneElements = elements;
      }
    },
  ),
  scrollToContent: vi.fn(),
};

vi.mock("@excalidraw/excalidraw", async () => {
  const React = await import("react");
  const MainMenu = ({ children }: { children?: React.ReactNode }) => (
    <nav aria-label="项目菜单">{children}</nav>
  );
  MainMenu.Item = ({
    children,
    onSelect,
  }: {
    children: React.ReactNode;
    onSelect?: (event: Event) => void;
  }) => (
    <button
      onClick={(event) => onSelect?.(event.nativeEvent)}
      type="button"
    >
      {children}
    </button>
  );
  MainMenu.Separator = () => <hr />;
  MainMenu.DefaultItems = {
    Export: () => <button type="button">导出</button>,
    SaveAsImage: () => <button type="button">导出图片</button>,
    Help: () => <button type="button">帮助</button>,
  };
  return {
    Excalidraw: ({
      children,
      excalidrawAPI,
      onChange,
      onLibraryChange,
      onPointerUpdate,
      theme,
    }: {
      children?: React.ReactNode;
      excalidrawAPI?: (api: typeof fakeApi) => void;
      onChange?: typeof editorOnChange;
      onLibraryChange?: typeof libraryHarness.onChange;
      onPointerUpdate?: typeof editorOnPointerUpdate;
      theme?: "light" | "dark";
    }) => {
      React.useEffect(() => {
        excalidrawAPI?.(fakeApi);
        editorOnChange = onChange ?? null;
        libraryHarness.onChange = onLibraryChange ?? null;
        editorOnPointerUpdate = onPointerUpdate ?? null;
      }, [excalidrawAPI, onChange, onLibraryChange, onPointerUpdate]);
      return (
        <div
          className="excalidraw-container"
          data-testid="excalidraw-editor"
          data-theme={theme}
        >
          Editor
          {children}
        </div>
      );
    },
    convertToExcalidrawElements: (
      elements: Array<Record<string, unknown>>,
    ) => elements,
    loadFromBlob: async (blob: Blob) => JSON.parse(await blob.text()),
    MainMenu,
    serializeAsJSON: (
      elements: Array<Record<string, unknown>>,
      appState: Record<string, unknown>,
      files: Record<string, unknown>,
    ) => JSON.stringify({
      type: "excalidraw",
      version: 2,
      elements,
      appState,
      files,
    }),
    exportToCanvas: async ({
      appState,
      exportingFrame,
      getDimensions,
    }: {
      appState: { exportBackground?: boolean };
      exportingFrame: { id: string };
      getDimensions: (width: number, height: number) => {
        width: number;
        height: number;
      };
    }) => {
      exportHarness.backgrounds.push(Boolean(appState.exportBackground));
      exportHarness.frameIds.push(exportingFrame.id);
      const dimensions = getDimensions(1080, 1440);
      exportHarness.dimensions.push(dimensions);
      const canvas = document.createElement("canvas");
      canvas.width = dimensions.width;
      canvas.height = dimensions.height;
      return canvas;
    },
    getDataURL: async () => "data:image/png;base64,original",
    useHandleLibrary: (options: Record<string, unknown>) => {
      libraryHarness.options.push(options);
    },
  };
});

vi.mock("./compositor/compositor", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("./compositor/compositor")>();
  return {
    ...original,
    createCompositor: () => compositorHarness,
  };
});

describe("Excalicap product", () => {
  beforeEach(() => {
    projectStorageHarness.snapshot = null;
    libraryHarness.options.length = 0;
    libraryHarness.onChange = null;
    libraryHarness.adapter.load.mockClear();
    libraryHarness.adapter.save.mockClear();
    vi.stubGlobal("indexedDB", {});
    sceneElements = [
      {
        id: "slide-1",
        type: "frame",
        x: 0,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 1",
      },
    ];
    editorOnChange = null;
    editorOnPointerUpdate = null;
    projectFileHarness.open.mockReset();
    projectFileHarness.open.mockResolvedValue(null);
    projectFileHarness.save.mockReset();
    projectFileHarness.save.mockResolvedValue(null);
    Object.values(compositorHarness).forEach((mock) => mock.mockClear());
    exportHarness.frameIds.length = 0;
    exportHarness.backgrounds.length = 0;
    exportHarness.dimensions.length = 0;
    fakeApi.addFiles.mockClear();
    fakeApi.updateLibrary.mockClear();
    fakeApi.resetScene.mockClear();
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
    });
    recorderStreams.length = 0;
    recorderStopErrors.length = 0;
    vi.stubGlobal("MediaRecorder", BrowserRecorder);
    vi.stubGlobal("MediaStream", BrowserStream);
    let nextObjectUrl = 0;
    createObjectURL = vi.fn(
      () => `blob:recording-${++nextObjectUrl}`,
    );
    revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      createObjectURL,
      revokeObjectURL,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { deviceId: "mic", kind: "audioinput", label: "USB Microphone" },
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) => {
          if (constraints.video) {
            throw new DOMException(
              "Requested device not found",
              "NotFoundError",
            );
          }
          return new BrowserStream([new BrowserTrack("audio")]);
        },
      },
    });
    Object.defineProperty(HTMLCanvasElement.prototype, "captureStream", {
      configurable: true,
      value: () =>
        new BrowserStream([new BrowserTrack("video", "canvas")]),
    });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  });

  it("renders the original-inspired product workspace without validator chrome", async () => {
    render(<App />);

    expect(await screen.findByTestId("excalidraw-editor")).toBeInTheDocument();
    expect(
      screen.getByTestId("excalidraw-editor").parentElement,
    ).toHaveAttribute("data-selection-hint", "hidden");
    expect(screen.getByRole("button", { name: "录制" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "提词器" })).toBeEnabled();
    expect(screen.getByText("幻灯片")).toBeInTheDocument();
    const rightControls = screen.getByRole("group", {
      name: "右侧控制栏",
    });
    expect(rightControls).toContainElement(screen.getByLabelText("创作控制"));
    expect(rightControls).toContainElement(
      screen.getByRole("complementary", { name: "幻灯片导航" }),
    );
    expect(screen.queryByText("高清录制验证器")).not.toBeInTheDocument();
    expect(screen.queryByText("资源状态")).not.toBeInTheDocument();
  });

  it("restores the saved theme across Excalicap and Excalidraw", async () => {
    const savedSettings = JSON.stringify({
      ...DEFAULT_SETTINGS,
      theme: "dark",
    });
    vi.stubGlobal("localStorage", {
      getItem: () => savedSettings,
      setItem: vi.fn(),
    });

    render(<App />);

    expect(await screen.findByRole("main")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(screen.getByTestId("excalidraw-editor")).toHaveAttribute(
      "data-theme",
      "dark",
    );
  });

  it("applies and saves a theme selected in settings", async () => {
    const setItem = vi.fn();
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem,
    });
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "深色" }));
    fireEvent.click(screen.getByRole("button", { name: "应用设置" }));

    expect(screen.getByRole("main")).toHaveAttribute("data-theme", "dark");
    expect(screen.getByTestId("excalidraw-editor")).toHaveAttribute(
      "data-theme",
      "dark",
    );
    expect(JSON.parse(setItem.mock.calls.at(-1)?.[1] ?? "{}")).toMatchObject({
      theme: "dark",
    });
  });

  it("connects the editor API to the permanent local library", async () => {
    render(<App />);

    await waitFor(() => {
      expect(libraryHarness.options).toContainEqual({
        excalidrawAPI: fakeApi,
        adapter: libraryHarness.adapter,
      });
    });
  });

  it("replaces repeated imported library items with their newest copy", async () => {
    render(<App />);

    await waitFor(() => expect(libraryHarness.onChange).not.toBeNull());
    const newest = {
      id: "newest-copy",
      status: "published",
      created: 3,
      elements: [
        {
          id: "shared-shape",
          type: "rectangle",
          versionNonce: 300,
          updated: 3,
        },
      ],
    };
    const older = {
      id: "older-copy",
      status: "published",
      created: 2,
      elements: [
        {
          id: "shared-shape",
          type: "rectangle",
          versionNonce: 200,
          updated: 2,
        },
      ],
    };

    act(() => libraryHarness.onChange?.([newest, older]));

    expect(fakeApi.updateLibrary).toHaveBeenCalledWith({
      libraryItems: [newest],
      merge: false,
    });
  });

  it("shows project file actions in the Excalidraw main menu", async () => {
    render(<App />);

    await screen.findByTestId("excalidraw-editor");
    expect(screen.getByRole("button", { name: "新建项目" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "打开项目…" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "另存为…" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "导出" }),
    ).not.toBeInTheDocument();
  });

  it("creates one blank profile-sized Slide after confirming a new project", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "content-1",
        type: "text",
        frameId: "slide-1",
        x: 100,
        y: 100,
        width: 300,
        height: 60,
      },
    ];
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "新建项目" }));

    await waitFor(() => {
      expect(sceneElements).toHaveLength(1);
      expect(sceneElements[0]).toMatchObject({
        type: "frame",
        x: 0,
        y: 0,
        width: 1080,
        height: 1440,
        locked: true,
      });
    });
    expect(projectStorageHarness.snapshot).toEqual(
      expect.objectContaining({ elements: sceneElements }),
    );
    confirm.mockRestore();
  });

  it("opens, normalizes, and binds a selected Excalidraw project", async () => {
    const handle = { name: "opened.excalidraw" };
    const file = new File(
      [
        JSON.stringify({
          elements: [
            {
              id: "opened-slide",
              type: "frame",
              x: 50,
              y: 80,
              width: 400,
              height: 300,
            },
          ],
          appState: { viewBackgroundColor: "#ffffff" },
          files: {},
        }),
      ],
      "opened.excalidraw",
    );
    projectFileHarness.open.mockResolvedValue({ file, handle });
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "打开项目…" }));

    await waitFor(() => {
      expect(sceneElements).toEqual([
        expect.objectContaining({
          id: "opened-slide",
          width: 1080,
          height: 1440,
          locked: true,
        }),
      ]);
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(projectFileHarness.save).toHaveBeenCalledWith(
        expect.any(Blob),
        "opened.excalidraw",
        handle,
        false,
      );
    });
  });

  it("uses Save As when no file is bound and replaces the binding", async () => {
    const selectedHandle = { name: "saved.excalidraw" };
    projectFileHarness.save.mockResolvedValue({
      kind: "written",
      handle: selectedHandle,
    });
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    await waitFor(() => {
      expect(projectFileHarness.save).toHaveBeenCalledWith(
        expect.any(Blob),
        "Excalicap.excalidraw",
        null,
        false,
      );
    });
    projectFileHarness.save.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => {
      expect(projectFileHarness.save).toHaveBeenCalledWith(
        expect.any(Blob),
        "saved.excalidraw",
        selectedHandle,
        false,
      );
    });
  });

  it("keeps the current scene when opening a project fails", async () => {
    projectFileHarness.open.mockResolvedValue({
      file: new File(["not json"], "broken.excalidraw"),
      handle: { name: "broken.excalidraw" },
    });
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    const before = [...sceneElements];

    fireEvent.click(screen.getByRole("button", { name: "打开项目…" }));

    expect(await screen.findByText(/Unexpected token|JSON/)).toBeInTheDocument();
    expect(sceneElements).toEqual(before);
    expect(fakeApi.resetScene).not.toHaveBeenCalled();
  });

  it("clears Excalidraw's transient loading state when restoring a project", async () => {
    projectStorageHarness.snapshot = {
      version: 1,
      updatedAt: Date.now(),
      projectTitle: "恢复测试",
      currentSlideId: "slide-1",
      elements: sceneElements,
      appState: {
        viewBackgroundColor: "#ffffff",
      },
      files: {},
    };

    render(<App />);

    await waitFor(() => {
      const restoreCall = fakeApi.updateScene.mock.calls.find(
        ([scene]) => scene.appState,
      );
      expect(restoreCall?.[0].appState?.isLoading).toBe(false);
      expect(
        restoreCall?.[0].elements?.find(
          (element) => element.type === "frame",
        )?.locked,
      ).toBe(true);
    });
  });

  it("aligns restored Slides and their editable content to the first Slide", async () => {
    projectStorageHarness.snapshot = {
      version: 1,
      updatedAt: Date.now(),
      projectTitle: "对齐测试",
      currentSlideId: "slide-2",
      elements: [
        {
          id: "slide-1",
          type: "frame",
          x: 0,
          y: 100,
          width: 1080,
          height: 1440,
        },
        {
          id: "slide-2",
          type: "frame",
          x: 1200,
          y: -60,
          width: 960,
          height: 1280,
        },
        {
          id: "content-2",
          type: "text",
          frameId: "slide-2",
          x: 1300,
          y: 40,
          width: 300,
          height: 60,
        },
      ],
      appState: { viewBackgroundColor: "#ffffff" },
      files: {},
    };

    render(<App />);

    await waitFor(() => {
      expect(
        sceneElements.find((element) => element.id === "slide-2"),
      ).toMatchObject({
        x: 1200,
        y: 100,
        width: 1080,
        height: 1440,
        locked: true,
      });
      expect(
        sceneElements.find((element) => element.id === "content-2"),
      ).toMatchObject({ y: 200 });
    });
  });

  it("relocks an unlocked Slide without locking its editable content", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fakeApi.updateScene.mockClear();

    act(() => {
      editorOnChange?.(
        [
          {
            id: "slide-1",
            type: "frame",
            x: 240,
            y: 180,
            width: 640,
            height: 480,
            locked: false,
          },
          {
            id: "content-1",
            type: "rectangle",
            x: 280,
            y: 220,
            width: 120,
            height: 80,
            frameId: "slide-1",
            locked: false,
          },
        ],
        { viewBackgroundColor: "#fff" },
        {},
      );
    });

    const normalized = fakeApi.updateScene.mock.calls.at(-1)?.[0].elements;
    expect(
      normalized?.find((element) => element.id === "slide-1")?.locked,
    ).toBe(true);
    expect(
      normalized?.find((element) => element.id === "content-1")?.locked,
    ).toBe(false);
  });

  it("keeps a pasted image above its Slide frame", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fakeApi.updateScene.mockClear();

    act(() => {
      editorOnChange?.(
        [
          {
            id: "pasted-image",
            type: "image",
            x: 280,
            y: 220,
            width: 320,
            height: 180,
            frameId: "slide-1",
            locked: false,
          },
          {
            id: "slide-1",
            type: "frame",
            x: 0,
            y: 0,
            width: 1080,
            height: 1440,
            locked: true,
          },
        ],
        { viewBackgroundColor: "#fff" },
        {},
      );
    });

    expect(
      fakeApi.updateScene.mock.calls.at(-1)?.[0].elements?.map(
        (element) => element.id,
      ),
    ).toEqual(["slide-1", "pasted-image"]);
  });

  it("adds a new Slide through the floating rail", async () => {
    render(<App />);
    const editor = await screen.findByTestId("excalidraw-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      bottom: 1440,
      height: 1440,
      left: 0,
      right: 1080,
      top: 0,
      width: 1080,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "添加幻灯片" }));

    expect(await screen.findByRole("button", { name: "转到 Slide 2" }))
      .toBeEnabled();
    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.7 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: expect.any(String) }),
        { animate: true, duration: 500 },
      );
    });
  });

  it("deletes the right-clicked Slide and its content after confirmation", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1200,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
      {
        id: "content-2",
        type: "text",
        frameId: "slide-2",
        x: 1300,
        y: 100,
        width: 300,
        height: 60,
      },
    ];
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-2"]')!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除 Slide" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除 Slide" }));

    expect(sceneElements.map((element) => element.id)).toEqual(["slide-1"]);
    expect(
      screen.queryByRole("button", { name: "转到 Slide 2" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the current Slide when deleting a different Slide", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1200,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
      {
        id: "slide-3",
        type: "frame",
        x: 2400,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 3",
      },
    ];
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "转到 Slide 2" }));
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-2" }),
        { animate: true, duration: 500 },
      );
    });
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-3"]')!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除 Slide" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除 Slide" }));
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
    });

    expect(
      screen.getByRole("button", { name: "转到 Slide 2" }).parentElement,
    ).toHaveAttribute("data-active", "true");
    expect(fakeApi.scrollToContent).not.toHaveBeenCalled();
    expect(
      fakeApi.updateScene.mock.calls.some(([scene]) => scene.appState?.zoom),
    ).toBe(false);
  });

  it("uses the comfortable editing viewport after deleting the current Slide", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1200,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
    ];
    render(<App />);
    const editor = await screen.findByTestId("excalidraw-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      bottom: 1440,
      height: 1440,
      left: 0,
      right: 1080,
      top: 0,
      width: 1080,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fireEvent.click(screen.getByRole("button", { name: "转到 Slide 2" }));
    await waitFor(() => expect(fakeApi.scrollToContent).toHaveBeenCalled());
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-2"]')!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除 Slide" }));
    fireEvent.click(screen.getByRole("button", { name: "确认删除 Slide" }));

    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.7 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-1" }),
        { animate: true, duration: 500 },
      );
    });
  });

  it("exports the right-clicked Slide as a profile-sized PNG", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1200,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
    ];
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["png"], { type: "image/png" })),
    );
    let downloadName = "";
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(
      function (this: HTMLAnchorElement) {
        downloadName = this.download;
      },
    );
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-2"]')!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "导出为 PNG" }));

    await waitFor(() => expect(createObjectURL).toHaveBeenCalled());
    expect(exportHarness.frameIds.at(-1)).toBe("slide-2");
    expect(exportHarness.backgrounds.at(-1)).toBe(true);
    expect(exportHarness.dimensions.at(-1)).toMatchObject({
      width: 1080,
      height: 1440,
    });
    expect(createObjectURL.mock.calls.at(-1)?.[0]).toMatchObject({
      type: "image/png",
    });
    expect(downloadName).toBe("Excalicap-Slide-2.png");
  });

  it("resizes every existing Slide when applying a new output preset", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: vi.fn(),
    });
    sceneElements = [
      {
        id: "slide-1",
        type: "frame",
        x: 0,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 1",
      },
      {
        id: "slide-2",
        type: "frame",
        x: 1200,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
    ];
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.change(screen.getByRole("combobox", { name: "画幅比例" }), {
      target: { value: "16:9" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用设置" }));

    expect(sceneElements.filter((element) => element.type === "frame")).toEqual([
      expect.objectContaining({
        id: "slide-1",
        x: 0,
        width: 1920,
        height: 1080,
      }),
      expect.objectContaining({
        id: "slide-2",
        x: 2040,
        width: 1920,
        height: 1080,
      }),
    ]);
    expect(
      screen.getByText("设置已应用；现有 Slide 已统一为所选画幅"),
    ).toBeInTheDocument();
  });

  it("navigates to a Slide with the comfortable animated editing viewport", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1280,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
    ];
    render(<App />);
    const editor = await screen.findByTestId("excalidraw-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      bottom: 1440,
      height: 1440,
      left: 0,
      right: 1080,
      top: 0,
      width: 1080,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "转到 Slide 2" }));

    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.7 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-2" }),
        { animate: true, duration: 500 },
      );
    });

  });

  it("uses the larger recording viewport when preparing the current Slide", async () => {
    sceneElements = [
      ...sceneElements,
      {
        id: "slide-2",
        type: "frame",
        x: 1280,
        y: 0,
        width: 1080,
        height: 1440,
        name: "Slide 2",
      },
    ];
    render(<App />);
    const editor = await screen.findByTestId("excalidraw-editor");
    vi.spyOn(editor, "getBoundingClientRect").mockReturnValue({
      bottom: 1440,
      height: 1440,
      left: 0,
      right: 1080,
      top: 0,
      width: 1080,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();

    fireEvent.click(screen.getByRole("button", { name: "录制" }));

    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.9 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-1" }),
        { animate: true, duration: 500 },
      );
    });

    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "转到 Slide 2" }));

    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.9 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-2" }),
        { animate: true, duration: 500 },
      );
    });

    fakeApi.updateScene.mockClear();
    fakeApi.scrollToContent.mockClear();
    fireEvent.click(await screen.findByRole("button", { name: "返回编辑" }));

    expect(fakeApi.updateScene).toHaveBeenCalledWith({
      appState: { zoom: { value: 0.7 } },
    });
    await waitFor(() => {
      expect(fakeApi.scrollToContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: "slide-2" }),
        { animate: true, duration: 500 },
      );
    });
  });

  it("prepares and records with microphone when the camera is missing", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "录制" }));

    expect(
      await screen.findByText("未检测到摄像头，将只录制白板和声音"),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始录制" }));
    expect(await screen.findByRole("button", { name: "停止" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "停止" }));

    expect(await screen.findByText("录制完成")).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute(
      "href",
      "blob:recording-1",
    );
  });

  it("creates only one recording session when start is clicked repeatedly", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    const start = await screen.findByRole("button", { name: "开始录制" });

    fireEvent.click(start);
    fireEvent.click(start);

    await waitFor(() => expect(recorderStreams).toHaveLength(3));
    expect(
      screen.getByRole("button", { name: "设置" }),
    ).toBeDisabled();
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    expect(await screen.findByText("录制完成")).toBeInTheDocument();
  });

  it("downloads separately recorded whiteboard, camera, and audio as original materials", async () => {
    const cameraTrack = new BrowserTrack("video", "USB Camera");
    const microphoneTrack = new BrowserTrack("audio", "USB Microphone");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { deviceId: "camera", kind: "videoinput", label: "USB Camera" },
          { deviceId: "mic", kind: "audioinput", label: "USB Microphone" },
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) =>
          constraints.video
            ? new BrowserStream([cameraTrack])
            : new BrowserStream([microphoneTrack]),
      },
    });
    render(<App projectFileName="Excalicap介绍.excalicap" />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    expect(await screen.findByText("USB Camera")).toBeInTheDocument();
    expect(screen.getByText("USB Microphone")).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));

    expect(
      await screen.findByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", "blob:recording-1");
    expect(
      screen.getByRole("link", { name: "下载原始素材" }),
    ).toHaveAttribute("href", "blob:recording-2");
    expect(recorderStreams).toHaveLength(4);
    expect(recorderStreams[0].getVideoTracks()[0].source).toBe("canvas");
    expect(recorderStreams[1].getVideoTracks()[0].source).toBe("canvas");
    expect(recorderStreams[2].getVideoTracks()[0]).toBe(cameraTrack);
    expect(recorderStreams[3].getVideoTracks()).toHaveLength(0);
    expect(recorderStreams[0].getAudioTracks()[0]).toBe(microphoneTrack);
    expect(recorderStreams[1].getAudioTracks()).toHaveLength(0);
    expect(recorderStreams[2].getAudioTracks()).toHaveLength(0);
    expect(recorderStreams[3].getAudioTracks()[0]).toBe(microphoneTrack);
    const compositeName = screen
      .getByRole("link", { name: "下载合成视频" })
      .getAttribute("download");
    const materialsName = screen
      .getByRole("link", { name: "下载原始素材" })
      .getAttribute("download");
    expect(compositeName).toMatch(
      /^Excalicap介绍-合成成片-\d{8}-\d{6}\.mp4$/,
    );
    expect(materialsName).toMatch(
      /^Excalicap介绍-原始素材-\d{8}-\d{6}\.zip$/,
    );
    expect(screen.getByText("白板 + 激光笔、摄像头、声音")).toBeInTheDocument();
  });

  it("stops prepared devices and opens settings when changing devices", async () => {
    const cameraTrack = new BrowserTrack("video", "USB Camera");
    const microphoneTrack = new BrowserTrack("audio", "USB Microphone");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [
          { deviceId: "camera", kind: "videoinput", label: "USB Camera" },
          { deviceId: "mic", kind: "audioinput", label: "USB Microphone" },
        ],
        getUserMedia: async (constraints: MediaStreamConstraints) =>
          constraints.video
            ? new BrowserStream([cameraTrack])
            : new BrowserStream([microphoneTrack]),
      },
    });
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "更换设备" }),
    );

    expect(cameraTrack.stopped).toBe(true);
    expect(microphoneTrack.stopped).toBe(true);
    expect(
      screen.queryByRole("dialog", { name: "录制准备" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "录制设置" })).toBeInTheDocument();
  });

  it("does not present an incomplete ZIP as successful when camera recording fails", async () => {
    const cameraTrack = new BrowserTrack("video", "camera");
    const microphoneTrack = new BrowserTrack("audio", "microphone");
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: async () => [],
        getUserMedia: async (constraints: MediaStreamConstraints) =>
          constraints.video
            ? new BrowserStream([cameraTrack])
            : new BrowserStream([microphoneTrack]),
      },
    });
    recorderStopErrors.push(null, null, new Error("摄像头编码失败"), null);
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));

    expect(
      await screen.findByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", "blob:recording-1");
    expect(
      screen.queryByRole("link", { name: "下载原始素材" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "原始素材生成失败：摄像头编码失败。合成成片仍可下载。",
      ),
    ).toBeInTheDocument();
  });

  it("retains and reopens the last result after closing the result panel", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    const originalUrl = (
      await screen.findByRole("link", { name: "下载合成视频" })
    ).getAttribute("href");

    fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
    expect(
      screen.queryByRole("dialog", { name: "录制结果" }),
    ).not.toBeInTheDocument();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "上次录制" }));

    expect(
      screen.getByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", originalUrl);
  });

  it("replaces and revokes the previous result only after a new recording succeeds", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    await screen.findByRole("link", { name: "下载合成视频" });
    fireEvent.click(screen.getByRole("button", { name: "返回白板" }));

    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    expect(revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));

    expect(
      await screen.findByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", "blob:recording-3");
    await waitFor(() => {
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-1");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-2");
    });
  });

  it("preserves the previous result when a later composite recording fails", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    await screen.findByRole("link", { name: "下载合成视频" });
    fireEvent.click(screen.getByRole("button", { name: "返回白板" }));

    recorderStopErrors.push(new Error("合成编码失败"));
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    expect(await screen.findByText("合成编码失败")).toBeInTheDocument();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "返回白板" }));
    fireEvent.click(screen.getByRole("button", { name: "上次录制" }));

    expect(
      screen.getByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", "blob:recording-1");
  });

  it("releases every retained recording when the app unmounts", async () => {
    const cleanup = vi.spyOn(MediaRecorderEngine.prototype, "cleanup");
    const { unmount } = render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    fireEvent.click(
      await screen.findByRole("button", { name: "开始录制" }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "停止" }));
    await screen.findByRole("link", { name: "下载合成视频" });

    unmount();

    expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-1");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:recording-2");
    await waitFor(() => expect(cleanup).toHaveBeenCalledTimes(3));
    cleanup.mockRestore();
  });

  it("queues product changes for automatic local saving", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");

    editorOnChange?.(
      sceneElements,
      { viewBackgroundColor: "#fff" },
      {},
    );

    await waitFor(() => {
      expect(projectStorageHarness.snapshot).toEqual(
        expect.objectContaining({
          elements: sceneElements,
        }),
      );
    });
  });

  it("routes laser pointer presses to the recording compositor instead of the cursor", async () => {
    render(<App />);
    await screen.findByTestId("excalidraw-editor");
    fireEvent.click(screen.getByRole("button", { name: "录制" }));
    await screen.findByText("未检测到摄像头，将只录制白板和声音");

    editorOnPointerUpdate?.({
      pointer: { x: 240, y: 360, tool: "laser" },
      button: "down",
    });

    expect(compositorHarness.setCursor).toHaveBeenCalledWith(null);
    expect(compositorHarness.updateLaser).toHaveBeenCalledWith(
      expect.objectContaining({
        editorX: 240,
        editorY: 360,
        button: "down",
        visible: true,
      }),
    );
  });
});
