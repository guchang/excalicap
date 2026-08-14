import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  exportToCanvas,
  getDataURL,
  loadFromBlob,
  newElementWith,
  serializeAsJSON,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  LibraryItems,
  NormalizedZoomValue,
  PointerDownState,
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ClipboardData } from "@excalidraw/excalidraw/clipboard";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EXCALICAP_AI_DRAWING_PROMPT } from "./ai/excalicap-ai-prompt";
import { Icon } from "./components/icons";
import { ProductTopbar, type ProductRecordingState } from "./components/ProductTopbar";
import { RecordingPreparation } from "./components/RecordingPreparation";
import {
  RecordingResult,
  type RecordingAsset,
  type RecordingResultState,
} from "./components/RecordingResult";
import { SettingsDialog } from "./components/SettingsDialog";
import { CanvasSlideSorter } from "./components/CanvasSlideSorter";
import { SlideRail } from "./components/SlideRail";
import { Teleprompter } from "./components/Teleprompter";
import {
  createCompositor,
  getCameraRect,
  getSlideRect,
  type Compositor,
} from "./compositor/compositor";
import {
  acquireEnabledMedia,
  enumerateMediaDevices,
  stopAcquiredMedia,
  type AcquiredMedia,
  type DeviceCatalog,
  type MediaDevicesPort,
} from "./media/device-controller";
import {
  attachCameraPreview,
  CAMERA_PREVIEW_WAITING_WARNING,
} from "./media/camera-preview";
import {
  DEFAULT_SETTINGS,
  resolveOutputProfile,
} from "./product/output-presets";
import {
  loadProductSettings,
  saveProductSettings,
  takeLegacyTeleprompterText,
} from "./product/settings-storage";
import type { ProductSettings } from "./product/types";
import type { CameraSettings } from "./product/types";
import {
  defaultPresentationFontSize,
  installPresentationFontSizeControls,
} from "./presentation/font-size-presets";
import {
  createBrowserPermanentLibraryAdapter,
  createPermanentLibraryAdapter,
  deduplicateLibraryItems,
  type PermanentLibraryAdapter,
} from "./library/library-storage";
import {
  createBrowserProjectFileGateway,
  type ProjectFileGateway,
  type ProjectFileHandle,
  type ProjectFilePickerWindow,
} from "./project/project-file";
import {
  createAutosaveController,
  createBrowserProjectStorage,
  createProjectStorage,
  type AutosaveController,
  type AutosaveStatus,
  type ProjectSnapshot,
  type ProjectStorage,
} from "./project/project-storage";
import {
  selectAudioRecorderMimeType,
  selectRecorderCapability,
} from "./recording/capabilities";
import {
  createMemoryChunkSink,
  createOpfsChunkSink,
  removeOrphanedRecordingChunks,
  type ChunkSink,
  type OpfsDirectory,
} from "./recording/chunk-sink";
import {
  MediaRecorderEngine,
  type MediaRecorderLike,
  type MediaStreamLike,
  type MediaTrackLike,
} from "./recording/media-recorder-engine";
import { DualRecordingSession } from "./recording/dual-recording-session";
import {
  createRecordingFileNames,
  createStoredZip,
} from "./recording/recording-artifacts";
import { RecordingClock, formatRecordingTime } from "./recording/recording-clock";
import {
  calculateRecordingViewportState,
  measureRecordingViewport,
} from "./recording/recording-viewport";
import type { RecorderCapability } from "./recording/types";
import { createHighResolutionFileImporter } from "./rendering/high-resolution-file-import";
import {
  getFrameViewportRect,
  toHostViewportRect,
  type ViewportRect,
  type ViewportState,
} from "./rendering/frame-viewport";
import { createLatestRenderCoordinator } from "./rendering/latest-render";
import { getFrameRenderDimensions, type OutputProfile } from "./rendering/output-profile";
import { runScenePreflight } from "./rendering/preflight";
import {
  renderFrameToCanvas,
  type FrameBounds,
  type SceneExporter,
} from "./rendering/render-frame";
import {
  createSlide,
  deleteSlide,
  duplicateSlide,
  getSlideAtPoint,
  getSlides,
  isPointOnSlide,
  normalizeSlideFrames,
  pasteSlides,
  repairInvalidSlideChildren,
  reorderSlides,
  resizeSlideFrames,
  wouldNudgeElementsOutsideOwningSlides,
  type SlideSceneElement,
} from "./slides/slide-service";

interface ActiveFrameBounds extends FrameBounds {
  readonly x: number;
  readonly y: number;
}

interface PendingScene {
  readonly elements: readonly OrderedExcalidrawElement[];
  readonly appState: AppState;
  readonly files: BinaryFiles;
}

interface PreparationState {
  readonly capability: RecorderCapability;
  readonly warnings: readonly string[];
  readonly blockingIssues: readonly string[];
  readonly hasCamera: boolean;
  readonly hasMicrophone: boolean;
  readonly cameraDeviceName: string | null;
  readonly microphoneDeviceName: string | null;
}

type SlideMutationViewport = "fit" | "comfortable" | "preserve";

const AI_DRAWING_PROMPT_COPIED_NOTICE =
  "AI 绘图提示词已复制，可直接粘贴给 AI";
const NOTICE_DURATION_MS = 5_000;
const PROGRAMMATIC_SCENE_SETTLE_MS = 250;
const SLIDE_ONLY_PLACEMENT_NOTICE = "元素只能放在 Slide 上";
const SLIDE_FRAME_RENDERING = {
  enabled: true,
  clip: true,
  name: true,
  outline: true,
} as const;

const EDITING_SLIDE_VIEWPORT_FACTOR = 0.7;
const SLIDE_TRANSITION_DURATION_MS = 500;

function isWritablePasteTarget(target: Element | null): boolean {
  return Boolean(
    target &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable)),
  );
}

function focusSlide(
  api: ExcalidrawImperativeAPI,
  root: HTMLElement | null,
  frame: OrderedExcalidrawElement,
  viewportFactor: number,
) {
  const container = root?.querySelector<HTMLElement>(".excalidraw-container");
  if (container) {
    const bounds = container.getBoundingClientRect();
    if (
      bounds.width > 0 &&
      bounds.height > 0 &&
      frame.width > 0 &&
      frame.height > 0
    ) {
      api.updateScene({
        appState: {
          zoom: {
            value:
              (viewportFactor *
                Math.min(
                  bounds.width / frame.width,
                  bounds.height / frame.height,
                )) as NormalizedZoomValue,
          },
        },
      });
    }
  }
  window.setTimeout(() => {
    const currentFrame = api
      .getSceneElements()
      .find(
        (element) =>
          element.id === frame.id &&
          element.type === "frame" &&
          !element.isDeleted,
      );
    if (currentFrame) {
      api.scrollToContent(currentFrame, {
        animate: true,
        duration: SLIDE_TRANSITION_DURATION_MS,
      });
    }
  }, 30);
}

function focusSlideForRecording(
  api: ExcalidrawImperativeAPI,
  root: HTMLElement,
  frame: OrderedExcalidrawElement,
) {
  const viewport = measureRecordingViewport(root);
  if (!viewport) {
    return;
  }
  const state = calculateRecordingViewportState(
    frame,
    viewport.container,
    viewport.offsets,
    api.getAppState(),
  );
  api.updateScene({
    appState: {
      zoom: { value: state.zoom as NormalizedZoomValue },
      scrollX: state.scrollX,
      scrollY: state.scrollY,
    },
  });
}

const initialElements = convertToExcalidrawElements(
  [
    {
      type: "frame",
      id: "slide-1",
      x: 0,
      y: 0,
      width: 1080,
      height: 1440,
      name: "Slide 1",
      locked: true,
      children: ["welcome-title", "welcome-subtitle"],
    },
    {
      type: "text",
      id: "welcome-title",
      x: 110,
      y: 180,
      width: 860,
      height: 90,
      text: "把想法讲清楚",
      fontSize: 56,
      strokeColor: "#e53935",
      frameId: "slide-1",
    },
    {
      type: "text",
      id: "welcome-subtitle",
      x: 110,
      y: 300,
      width: 860,
      height: 60,
      text: "在白板上创作，然后高清录制",
      fontSize: 28,
      strokeColor: "#6b7280",
      frameId: "slide-1",
    },
    {
      type: "frame",
      id: "slide-2",
      x: 1200,
      y: 0,
      width: 1080,
      height: 1440,
      name: "Slide 2",
      locked: true,
      children: [],
    },
  ],
  { regenerateIds: false },
);

function decodeImage(dataURL: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () =>
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("图片无法解码"));
    image.src = dataURL;
  });
}

function recorderOptionsFor(profile: OutputProfile) {
  return {
    ...profile,
    videoBitsPerSecond: profile.width >= 1620 ? 12_000_000 : 8_000_000,
    audioBitsPerSecond: 192_000,
  };
}

async function createTemporaryChunkSink(): Promise<{
  sink: ChunkSink;
  kind: "OPFS" | "内存";
}> {
  if (
    navigator.storage &&
    "getDirectory" in navigator.storage &&
    typeof navigator.storage.getDirectory === "function"
  ) {
    try {
      const sink = await createOpfsChunkSink(
        `excalicap-${Date.now()}-${crypto.randomUUID()}.tmp`,
        {
          getDirectory: async () =>
            (await navigator.storage.getDirectory()) as unknown as OpfsDirectory,
        },
      );
      return { sink, kind: "OPFS" };
    } catch (error) {
      throw new Error(
        `无法创建录制临时文件：${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
  return { sink: createMemoryChunkSink(), kind: "内存" };
}

function createRuntimeProjectStorage(): ProjectStorage {
  if (typeof indexedDB !== "undefined") {
    return createBrowserProjectStorage(indexedDB, "excalicap-product-v1");
  }
  let snapshot: ProjectSnapshot | null = null;
  return createProjectStorage({
    load: async () => snapshot,
    save: async (next) => {
      snapshot = structuredClone(next);
    },
    clear: async () => {
      snapshot = null;
    },
  });
}

function createRuntimeLibraryAdapter(): PermanentLibraryAdapter {
  if (typeof indexedDB !== "undefined") {
    return createBrowserPermanentLibraryAdapter(indexedDB);
  }
  let record: unknown = null;
  return createPermanentLibraryAdapter({
    load: async () => record,
    save: async (next) => {
      record = structuredClone(next);
    },
  });
}

function sceneElements(
  elements: readonly OrderedExcalidrawElement[],
): readonly SlideSceneElement[] {
  return elements as unknown as readonly SlideSceneElement[];
}

function excalidrawElements(
  elements: readonly SlideSceneElement[],
): readonly OrderedExcalidrawElement[] {
  return elements as unknown as readonly OrderedExcalidrawElement[];
}

function versionChangedElements(
  currentElements: readonly OrderedExcalidrawElement[],
  nextElements: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  const currentById = new Map(
    currentElements.map((element) => [element.id, element]),
  );
  return nextElements.map((element) => {
    const current = currentById.get(element.id);
    if (!current || current === element) {
      return element;
    }
    const {
      id: _id,
      version: _version,
      versionNonce: _versionNonce,
      updated: _updated,
      ...updates
    } = element;
    return newElementWith(
      current,
      updates as Parameters<typeof newElementWith>[1],
    ) as unknown as SlideSceneElement;
  });
}

function preparePersistedElements(
  elements: readonly unknown[],
): readonly OrderedExcalidrawElement[] {
  return elements.map((element) => {
    if (!element || typeof element !== "object") {
      return element;
    }
    const { index: _persistedIndex, ...elementWithoutIndex } = element as Record<
      string,
      unknown
    >;
    return elementWithoutIndex;
  }) as unknown as readonly OrderedExcalidrawElement[];
}

function hydrateNewFrames(
  elements: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  return elements.map((element) => {
    if (element.type !== "frame" || "version" in element) {
      return element;
    }
    const [frame] = convertToExcalidrawElements(
      [
        {
          ...element,
          children: Array.isArray(element.children) ? element.children : [],
        },
      ] as Parameters<typeof convertToExcalidrawElements>[0],
      { regenerateIds: false },
    );
    return frame as unknown as SlideSceneElement;
  });
}

function createRecordingAsset(blob: Blob, fileName: string): RecordingAsset {
  return {
    url: URL.createObjectURL(blob),
    fileName,
    size: blob.size,
    type: blob.type,
  };
}

function revokeRecordingResult(result: RecordingResultState | null) {
  if (!result) {
    return;
  }
  URL.revokeObjectURL(result.composite.url);
  if (result.materials) {
    URL.revokeObjectURL(result.materials.url);
  }
}

function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error("无法生成 PNG 图片"));
      }
    }, "image/png");
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export interface AppProps {
  readonly projectStorage?: ProjectStorage;
  readonly initialProject?: ProjectSnapshot | null;
  readonly projectFileName?: string | null;
  readonly libraryAdapter?: PermanentLibraryAdapter;
  readonly showProjectFileActions?: boolean;
  readonly onProjectSaveHandleChange?: (
    handle: ProjectSaveHandle | null,
  ) => void;
}

export interface ProjectSaveHandle {
  flush(): Promise<void>;
  load(snapshot: ProjectSnapshot | null): Promise<void>;
}

export default function App({
  projectStorage,
  initialProject,
  projectFileName = null,
  libraryAdapter,
  showProjectFileActions = true,
  onProjectSaveHandleChange,
}: AppProps = {}) {
  const startingElements = initialProject
    ? excalidrawElements(
        repairInvalidSlideChildren(
          sceneElements(preparePersistedElements(initialProject.elements)),
        ),
      )
    : initialElements;
  const [settings, setSettings] = useState<ProductSettings>(() => {
    const preferences =
      typeof localStorage === "undefined" ||
      typeof localStorage.getItem !== "function"
        ? DEFAULT_SETTINGS
        : loadProductSettings(localStorage);
    return {
      ...preferences,
      teleprompter: {
        ...preferences.teleprompter,
        text:
          initialProject?.teleprompterText ??
          (initialProject !== undefined
            ? takeLegacyTeleprompterText(localStorage)
            : ""),
      },
    };
  });
  const [slides, setSlides] = useState(() =>
    getSlides(sceneElements(startingElements)),
  );
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(
    initialProject?.currentSlideId ?? slides[0]?.id ?? null,
  );
  const [saveStatus, setSaveStatus] = useState<AutosaveStatus>("saved");
  const [recordingState, setRecordingStateValue] =
    useState<ProductRecordingState>("idle");
  const recordingStateRef = useRef<ProductRecordingState>("idle");
  const setRecordingState = useCallback((next: ProductRecordingState) => {
    recordingStateRef.current = next;
    setRecordingStateValue(next);
  }, []);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [teleprompterOpen, setTeleprompterOpen] = useState(false);
  const [devices, setDevices] = useState<DeviceCatalog>({
    cameras: [],
    microphones: [],
  });
  const [preparation, setPreparation] = useState<PreparationState | null>(null);
  const [recordingResult, setRecordingResult] =
    useState<RecordingResultState | null>(null);
  const [recordingResultOpen, setRecordingResultOpen] = useState(false);
  const [recordingError, setRecordingError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [clockPulse, setClockPulse] = useState(0);
  const [focusRect, setFocusRect] = useState<ViewportRect | null>(null);
  const [slideViewport, setSlideViewport] =
    useState<ViewportState | null>(null);
  const [libraryApi, setLibraryApi] =
    useState<ExcalidrawImperativeAPI | null>(null);
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const productShellRef = useRef<HTMLElement | null>(null);
  const recordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const whiteboardRecordingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const cameraGestureRef = useRef<
    | {
        kind: "drag" | "resize";
        pointerId: number;
        startX: number;
        startY: number;
        camera: CameraSettings;
      }
    | undefined
  >(undefined);
  const compositorRef = useRef<Compositor | null>(null);
  const whiteboardCompositorRef = useRef<Compositor | null>(null);
  const currentFrameRef = useRef<ActiveFrameBounds | null>(null);
  const lastEditorPointerRef = useRef<{ x: number; y: number } | null>(null);
  const recordingSessionRef = useRef<DualRecordingSession | null>(null);
  const retainedRecordingSessionRef = useRef<DualRecordingSession | null>(null);
  const preparingRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const captureStreamRefs = useRef<MediaStreamLike[]>([]);
  const acquiredMediaRef = useRef<AcquiredMedia | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentSlideIdRef = useRef(currentSlideId);
  const teleprompterTextRef = useRef(settings.teleprompter.text);
  const latestRenderRef = useRef(createLatestRenderCoordinator<HTMLCanvasElement>());
  const latestSceneRef = useRef<PendingScene | null>(null);
  const projectReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const projectStorageRef = useRef<ProjectStorage | null>(null);
  const libraryAdapterRef = useRef<PermanentLibraryAdapter | null>(null);
  const projectFileGatewayRef = useRef<ProjectFileGateway | null>(null);
  const projectFileHandleRef = useRef<ProjectFileHandle | null>(null);
  const projectFileNameRef = useRef<string | null>(projectFileName);
  const projectFileDirtyRef = useRef(true);
  const programmaticSceneChangeRef = useRef(false);
  const programmaticSceneTimerRef = useRef<number | null>(null);
  const loadProjectSnapshotRef = useRef<
    (snapshot: ProjectSnapshot | null) => Promise<void>
  >(async () => undefined);
  const autosaveRef = useRef<AutosaveController | null>(null);
  const clockRef = useRef(new RecordingClock());
  const profile = useMemo(() => resolveOutputProfile(settings), [settings]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const focusActive =
    recordingState === "preparing" ||
    recordingState === "starting" ||
    recordingState === "recording" ||
    recordingState === "paused" ||
    recordingState === "stopping";

  const selectSlide = useCallback((slideId: string | null) => {
    currentSlideIdRef.current = slideId;
    setCurrentSlideId(slideId);
  }, []);

  const selectCanvasSlide = useCallback(
    (slideId: string) => {
      selectSlide(slideId);
      apiRef.current?.updateScene({
        appState: { selectedElementIds: { [slideId]: true } },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    },
    [selectSlide],
  );

  if (!projectStorageRef.current) {
    projectStorageRef.current = projectStorage ?? createRuntimeProjectStorage();
  }
  if (!libraryAdapterRef.current) {
    libraryAdapterRef.current = libraryAdapter ?? createRuntimeLibraryAdapter();
  }
  useHandleLibrary({
    excalidrawAPI: libraryApi,
    adapter: libraryAdapterRef.current,
  });
  if (!projectFileGatewayRef.current) {
    projectFileGatewayRef.current = createBrowserProjectFileGateway(
      window as unknown as ProjectFilePickerWindow,
      document,
    );
  }
  if (!autosaveRef.current) {
    autosaveRef.current = createAutosaveController({
      delayMs: 800,
      save: (snapshot) => projectStorageRef.current!.save(snapshot),
      onError: (error) =>
        setNotice(error instanceof Error ? error.message : "无法保存项目"),
      onStatusChange: setSaveStatus,
    });
  }

  useEffect(() => {
    const handle = {
      flush: () => autosaveRef.current?.flush() ?? Promise.resolve(),
      load: (snapshot: ProjectSnapshot | null) =>
        loadProjectSnapshotRef.current(snapshot),
    };
    onProjectSaveHandleChange?.(handle);
    return () => onProjectSaveHandleChange?.(null);
  }, [onProjectSaveHandleChange]);

  useEffect(() => {
    if (typeof navigator.storage?.getDirectory !== "function") {
      return;
    }
    void removeOrphanedRecordingChunks({
      getDirectory: async () =>
        (await navigator.storage.getDirectory()) as unknown as OpfsDirectory,
    }).catch(() => undefined);
  }, []);

  const initialData = useMemo(
    () => {
      const currentItemFontSize = defaultPresentationFontSize(
        Math.min(profile.width, profile.height),
      );
      return (
        initialProject !== undefined
          ? {
              elements: startingElements,
              appState: {
                viewBackgroundColor: "#ffffff",
                ...(initialProject?.appState as Partial<AppState> | undefined),
                currentItemFontSize,
                frameRendering: SLIDE_FRAME_RENDERING,
                isLoading: false,
              },
              files: (initialProject?.files ?? {}) as BinaryFiles,
              scrollToContent: true,
            }
          : {
              elements: initialElements,
              appState: {
                viewBackgroundColor: "#ffffff",
                currentItemFontSize,
                frameRendering: SLIDE_FRAME_RENDERING,
              },
              scrollToContent: true,
            }
      );
    },
    [initialProject, profile.height, profile.width, startingElements],
  );

  useEffect(() => {
    const root = productShellRef.current;
    if (!root) {
      return;
    }
    return installPresentationFontSizeControls(
      root,
      Math.min(profile.width, profile.height),
      (fontSize) => apiRef.current?.setFontSize(fontSize),
    );
  }, [profile.height, profile.width]);

  const snapshotFrom = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ): ProjectSnapshot => ({
      version: 1,
      updatedAt: Date.now(),
      projectTitle: "我的 Excalicap 视频",
      currentSlideId: currentSlideIdRef.current,
      teleprompterText: teleprompterTextRef.current,
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    }),
    [],
  );

  const copyAiDrawingPrompt = useCallback(async () => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(EXCALICAP_AI_DRAWING_PROMPT);
      setNotice(AI_DRAWING_PROMPT_COPIED_NOTICE);
    } catch {
      setNotice("无法复制 AI 绘图提示词，请检查剪贴板权限后重试");
    }
  }, []);

  useEffect(() => {
    if (!notice) {
      return;
    }
    const currentNotice = notice;
    const timer = window.setTimeout(
      () =>
        setNotice((current) =>
          current === currentNotice ? null : current,
        ),
      NOTICE_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const blockPasteOutsideSlides = (event: ClipboardEvent) => {
      const editor = productShellRef.current?.querySelector(
        ".excalidraw-container",
      );
      const activeElement = document.activeElement;
      if (
        !editor ||
        !activeElement ||
        !editor.contains(activeElement) ||
        isWritablePasteTarget(activeElement)
      ) {
        return;
      }
      const pointer = lastEditorPointerRef.current;
      const elements = apiRef.current?.getSceneElements() ?? [];
      const clipboardTypes = Array.from(event.clipboardData?.types ?? []);
      const containsImage =
        Boolean(event.clipboardData?.files?.length) ||
        clipboardTypes.some((type) => type.startsWith("image/"));
      if (!containsImage) {
        return;
      }
      if (
        pointer &&
        isPointOnSlide(sceneElements(elements), pointer)
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setNotice(SLIDE_ONLY_PLACEMENT_NOTICE);
    };
    window.addEventListener("paste", blockPasteOutsideSlides, true);
    return () =>
      window.removeEventListener("paste", blockPasteOutsideSlides, true);
  }, []);

  useEffect(() => {
    const blockArrowNudgeOutsideSlides = (event: KeyboardEvent) => {
      const recordingState = recordingStateRef.current;
      if (
        recordingState === "preparing" ||
        recordingState === "recording" ||
        recordingState === "paused"
      ) {
        return;
      }
      if (
        event.key !== "ArrowLeft" &&
        event.key !== "ArrowRight" &&
        event.key !== "ArrowUp" &&
        event.key !== "ArrowDown"
      ) {
        return;
      }
      const editor = productShellRef.current?.querySelector(
        ".excalidraw-container",
      );
      if (
        !editor ||
        !(event.target instanceof Element) ||
        !editor.contains(event.target) ||
        isWritablePasteTarget(event.target)
      ) {
        return;
      }
      const api = apiRef.current;
      if (!api) {
        return;
      }
      const appState = api.getAppState();
      if (
        appState.editingTextElement ||
        appState.editingLinearElement ||
        appState.newElement
      ) {
        return;
      }
      const effectiveGridSize = appState.gridModeEnabled
        ? appState.gridSize
        : null;
      const step =
        (effectiveGridSize && (event.shiftKey ? 1 : effectiveGridSize)) ||
        (event.shiftKey ? 5 : 1);
      const offset = {
        x:
          event.key === "ArrowLeft"
            ? -step
            : event.key === "ArrowRight"
              ? step
              : 0,
        y:
          event.key === "ArrowUp"
            ? -step
            : event.key === "ArrowDown"
              ? step
              : 0,
      };
      if (
        !wouldNudgeElementsOutsideOwningSlides(
          sceneElements(api.getSceneElements()),
          appState.selectedElementIds ?? {},
          offset,
        )
      ) {
        return;
      }
      event.preventDefault();
      event.stopImmediatePropagation();
      setNotice(SLIDE_ONLY_PLACEMENT_NOTICE);
    };
    window.addEventListener("keydown", blockArrowNudgeOutsideSlides, true);
    return () =>
      window.removeEventListener(
        "keydown",
        blockArrowNudgeOutsideSlides,
        true,
      );
  }, []);

  const replaceProjectScene = useCallback(
    async (
      elements: readonly SlideSceneElement[],
      appState: Partial<AppState>,
      files: BinaryFiles,
      nextSlideId: string | null,
      options: {
        readonly persist?: boolean;
        readonly preserveViewport?: boolean;
      } = {},
    ) => {
      const api = apiRef.current;
      if (!api) {
        throw new Error("Excalidraw API 尚未初始化");
      }
      const { persist = true, preserveViewport = false } = options;
      const currentAppState = api.getAppState();
      const normalized = normalizeSlideFrames(
        repairInvalidSlideChildren(elements),
      );
      const normalizedElements = excalidrawElements(
        hydrateNewFrames(normalized),
      );
      programmaticSceneChangeRef.current = true;
      if (programmaticSceneTimerRef.current) {
        window.clearTimeout(programmaticSceneTimerRef.current);
      }
      api.resetScene();
      api.updateScene({
        elements: normalizedElements,
        appState: {
          ...currentAppState,
          ...appState,
          ...(preserveViewport
            ? {
                scrollX: currentAppState.scrollX,
                scrollY: currentAppState.scrollY,
                zoom: currentAppState.zoom,
              }
            : {}),
          isLoading: false,
        },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.addFiles(Object.values(files) as BinaryFileData[]);
      const nextSlides = getSlides(sceneElements(normalizedElements));
      setSlides(nextSlides);
      selectSlide(
        nextSlideId && nextSlides.some((slide) => slide.id === nextSlideId)
          ? nextSlideId
          : (nextSlides[0]?.id ?? null),
      );
      latestSceneRef.current = {
        elements: normalizedElements,
        appState: api.getAppState(),
        files,
      };
      if (persist) {
        await autosaveRef.current?.flush(
          snapshotFrom(normalizedElements, api.getAppState(), files),
        );
      }
      programmaticSceneTimerRef.current = window.setTimeout(() => {
        programmaticSceneChangeRef.current = false;
        programmaticSceneTimerRef.current = null;
      }, PROGRAMMATIC_SCENE_SETTLE_MS);
      if (!preserveViewport) {
        requestAnimationFrame(() => {
          api.scrollToContent(api.getSceneElements(), {
            fitToContent: true,
          });
        });
      }
    },
    [selectSlide, snapshotFrom],
  );

  loadProjectSnapshotRef.current = async (snapshot) => {
    autosaveRef.current?.discardPending();
    setSaveStatus("saved");
    setNotice(null);
    const teleprompterText = snapshot?.teleprompterText ?? "";
    teleprompterTextRef.current = teleprompterText;
    setSettings((current) => ({
      ...current,
      teleprompter: { ...current.teleprompter, text: teleprompterText },
    }));
    await replaceProjectScene(
      snapshot
        ? sceneElements(preparePersistedElements(snapshot.elements))
        : sceneElements(initialElements),
      (snapshot?.appState as Partial<AppState> | undefined) ?? {
        viewBackgroundColor: "#ffffff",
      },
      (snapshot?.files ?? {}) as BinaryFiles,
      snapshot?.currentSlideId ?? null,
      { persist: false, preserveViewport: true },
    );
    projectFileDirtyRef.current = false;
  };

  const newProject = useCallback(async () => {
    if (
      projectFileDirtyRef.current &&
      !window.confirm("当前改动尚未保存到文件，仍要新建项目吗？")
    ) {
      return;
    }
    try {
      const created = createSlide(
        [],
        null,
        profile,
        () => crypto.randomUUID(),
      );
      await projectStorageRef.current?.clear();
      projectFileHandleRef.current = null;
      projectFileNameRef.current = null;
      await replaceProjectScene(
        created.elements,
        { viewBackgroundColor: "#ffffff" },
        {},
        created.currentSlideId,
      );
      projectFileDirtyRef.current = true;
      setNotice("已新建项目");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法新建项目");
    }
  }, [profile, replaceProjectScene]);

  const openProject = useCallback(async () => {
    try {
      const selected = await projectFileGatewayRef.current?.open();
      if (!selected) {
        return;
      }
      const api = apiRef.current;
      if (!api) {
        throw new Error("Excalidraw API 尚未初始化");
      }
      const restored = await loadFromBlob(
        selected.file,
        api.getAppState(),
        api.getSceneElements(),
        selected.handle as FileSystemHandle | null,
      );
      await replaceProjectScene(
        sceneElements(restored.elements ?? []),
        restored.appState ?? {},
        restored.files ?? {},
        null,
      );
      projectFileHandleRef.current = selected.handle;
      projectFileNameRef.current = selected.file.name;
      projectFileDirtyRef.current = false;
      setNotice(`已打开 ${selected.file.name}`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法打开项目");
    }
  }, [replaceProjectScene]);

  const saveProject = useCallback(async (forceSaveAs = false) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    try {
      const serialized = serializeAsJSON(
        api.getSceneElements(),
        api.getAppState(),
        api.getFiles(),
        "local",
      );
      const blob = new Blob([serialized], {
        type: "application/vnd.excalidraw+json",
      });
      const suggestedName =
        projectFileNameRef.current ?? "Excalicap.excalidraw";
      const result = await projectFileGatewayRef.current?.save(
        blob,
        suggestedName,
        projectFileHandleRef.current,
        forceSaveAs,
      );
      if (!result) {
        return;
      }
      if (result.kind === "written") {
        projectFileHandleRef.current = result.handle;
        projectFileNameRef.current = result.handle.name;
        setNotice(`已保存到 ${result.handle.name}`);
      } else {
        projectFileHandleRef.current = null;
        setNotice(`已下载 ${suggestedName}`);
      }
      projectFileDirtyRef.current = false;
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "无法保存项目");
    }
  }, []);

  const configureApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    api.updateFrameRendering(SLIDE_FRAME_RENDERING);
    setLibraryApi((current) => (current === api ? current : api));
    setSlideViewport(api.getAppState() as unknown as ViewportState);
    const currentElements = api.getSceneElements();
    const currentScene = sceneElements(currentElements);
    const normalizedElements = normalizeSlideFrames(currentScene);
    if (normalizedElements !== currentScene) {
      const versionedElements = versionChangedElements(
        currentElements,
        normalizedElements,
      );
      api.updateScene({
        elements: excalidrawElements(versionedElements),
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
    const currentSlides = getSlides(normalizedElements);
    setSlides(currentSlides);
    const initialSlideId =
      currentSlideIdRef.current ?? currentSlides[0]?.id ?? null;
    selectSlide(initialSlideId);
    if (projectReadyRef.current) {
      return;
    }
    if (initialProject !== undefined) {
      projectReadyRef.current = true;
      if (
        initialProject?.teleprompterText === undefined &&
        teleprompterTextRef.current
      ) {
        autosaveRef.current?.queue(
          snapshotFrom(
            api.getSceneElements(),
            api.getAppState(),
            api.getFiles(),
          ),
        );
      }
      requestAnimationFrame(() => {
        if (mountedRef.current) {
          api.scrollToContent(api.getSceneElements(), {
            fitToContent: true,
          });
        }
      });
      return;
    }
    void projectStorageRef.current!
      .load()
      .then((saved) => {
        if (!mountedRef.current) {
          return;
        }
        if (saved) {
          const teleprompterText = saved.teleprompterText ?? "";
          teleprompterTextRef.current = teleprompterText;
          setSettings((current) => ({
            ...current,
            teleprompter: { ...current.teleprompter, text: teleprompterText },
          }));
          const restoredElements = normalizeSlideFrames(
            saved.elements as unknown as readonly SlideSceneElement[],
          );
          api.resetScene();
          api.updateScene({
            elements: excalidrawElements(restoredElements),
            appState: {
              ...api.getAppState(),
              ...saved.appState,
              frameRendering: SLIDE_FRAME_RENDERING,
              isLoading: false,
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
          api.addFiles(Object.values(saved.files) as BinaryFileData[]);
          const restoredSlides = getSlides(restoredElements);
          setSlides(restoredSlides);
          selectSlide(
            saved.currentSlideId ?? restoredSlides[0]?.id ?? null,
          );
        }
        projectReadyRef.current = true;
        requestAnimationFrame(() => {
          if (mountedRef.current) {
            api.scrollToContent(api.getSceneElements(), {
              fitToContent: true,
            });
          }
        });
      })
      .catch((error: unknown) => {
        if (!mountedRef.current) {
          return;
        }
        projectReadyRef.current = true;
        setSaveStatus("failed");
        setNotice(
          error instanceof Error ? error.message : "无法恢复本地项目",
        );
      });
  }, [initialProject, selectSlide, snapshotFrom]);

  const generateIdForFile = useCallback(async (file: File) => {
    const api = apiRef.current;
    if (!api) {
      throw new Error("Excalidraw API 尚未初始化");
    }
    return createHighResolutionFileImporter({
      createId: async () => crypto.randomUUID(),
      getDataURL: async (source) => String(await getDataURL(source)),
      addFiles: (files) => api.addFiles(files as BinaryFileData[]),
      now: () => Date.now(),
    })(file);
  }, []);

  const handleLibraryChange = useCallback((libraryItems: LibraryItems) => {
    const deduplicatedItems = deduplicateLibraryItems(libraryItems);
    if (deduplicatedItems.length === libraryItems.length) {
      return;
    }
    void apiRef.current?.updateLibrary({
      libraryItems: deduplicatedItems,
      merge: false,
    });
  }, []);

  const stopCompositionLoop = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const startCompositionLoop = useCallback(() => {
    stopCompositionLoop();
    const draw = () => {
      compositorRef.current?.draw();
      whiteboardCompositorRef.current?.draw();
      animationFrameRef.current = requestAnimationFrame(draw);
    };
    draw();
  }, [stopCompositionLoop]);

  const stopDevices = useCallback(() => {
    stopAcquiredMedia(acquiredMediaRef.current);
    acquiredMediaRef.current = null;
    setFocusRect(null);
    if (cameraVideoRef.current) {
      cameraVideoRef.current.srcObject = null;
    }
    compositorRef.current?.setCamera(null);
    compositorRef.current?.clearLaser();
    whiteboardCompositorRef.current?.clearLaser();
  }, []);

  const stopCaptureStream = useCallback(() => {
    const tracks = captureStreamRefs.current.flatMap((stream) => [
      ...stream.getVideoTracks(),
      ...stream.getAudioTracks(),
    ]);
    new Set(tracks).forEach((track) => track.stop());
    captureStreamRefs.current = [];
  }, []);

  const ensureCompositor = useCallback(() => {
    const canvas = recordingCanvasRef.current;
    const whiteboardCanvas = whiteboardRecordingCanvasRef.current;
    if (!canvas || !whiteboardCanvas) {
      throw new Error("录制画布尚未初始化");
    }
    compositorRef.current?.dispose();
    whiteboardCompositorRef.current?.dispose();
    const compositor = createCompositor(canvas, profile, {
      padding: settings.canvas.padding,
      slideRadius: settings.canvas.slideRadius,
    });
    const whiteboardCompositor = createCompositor(whiteboardCanvas, profile, {
      padding: settings.canvas.padding,
      slideRadius: settings.canvas.slideRadius,
    });
    compositor.setBackground(settings.canvas.background);
    whiteboardCompositor.setBackground(settings.canvas.background);
    compositorRef.current = compositor;
    whiteboardCompositorRef.current = whiteboardCompositor;
    return compositor;
  }, [
    profile,
    settings.canvas.background,
    settings.canvas.padding,
    settings.canvas.slideRadius,
  ]);

  const updateFocusRect = useCallback((frameId = currentSlideIdRef.current) => {
    const api = apiRef.current;
    if (!api || !frameId) {
      setFocusRect(null);
      return;
    }
    const frame = api
      .getSceneElements()
      .find(
        (element) =>
          element.id === frameId &&
          element.type === "frame" &&
          !element.isDeleted,
      );
    if (!frame) {
      setFocusRect(null);
      return;
    }
    setFocusRect(
      getFrameViewportRect(frame, api.getAppState()),
    );
  }, []);

  const restoreEditingFocus = useCallback(() => {
    const api = apiRef.current;
    const frame = api
      ?.getSceneElements()
      .find(
        (element) =>
          element.id === currentSlideIdRef.current &&
          element.type === "frame" &&
          !element.isDeleted,
      );
    if (api && frame) {
      focusSlide(
        api,
        productShellRef.current,
        frame,
        EDITING_SLIDE_VIEWPORT_FACTOR,
      );
    }
  }, []);

  const renderCurrentFrame = useCallback(
    async (frameId = currentSlideIdRef.current) => {
      const api = apiRef.current;
      if (!api || !frameId) {
        throw new Error("当前幻灯片不可用");
      }
      const elements = api.getSceneElements();
      const frame = elements.find(
        (element) =>
          element.id === frameId &&
          element.type === "frame" &&
          !element.isDeleted,
      );
      if (!frame) {
        throw new Error("当前幻灯片已被删除");
      }
      getFrameRenderDimensions(frame, profile);
      const committed = await latestRenderRef.current.run(
        () =>
          renderFrameToCanvas(
            {
              elements,
              appState: {
                ...api.getAppState(),
                exportBackground: false,
              } as unknown as Readonly<Record<string, unknown>>,
              files: api.getFiles(),
              frame,
              profile,
            },
            exportToCanvas as unknown as SceneExporter,
          ),
        (whiteboard) => {
          const compositor = compositorRef.current ?? ensureCompositor();
          compositor.setWhiteboard(whiteboard);
          compositor.draw();
          whiteboardCompositorRef.current?.setWhiteboard(whiteboard);
          whiteboardCompositorRef.current?.draw();
          currentFrameRef.current = {
            id: frame.id,
            x: frame.x,
            y: frame.y,
            width: frame.width,
            height: frame.height,
          };
        },
      );
      if (!committed) {
        throw new Error("幻灯片已切换，请重新开始录制");
      }
      return frame;
    },
    [ensureCompositor, profile],
  );

  const prepareRecording = useCallback(async () => {
    if (preparingRef.current || recordingSessionRef.current) {
      return;
    }
    const api = apiRef.current;
    if (!api) {
      return;
    }
    preparingRef.current = true;
    setRecordingState("preparing");
    setRecordingError(null);
    setNotice(null);
    setPreparation(null);
    stopDevices();
    try {
      const selectedFrame = api
        .getSceneElements()
        .find(
          (element) =>
            element.id === currentSlideIdRef.current &&
            element.type === "frame" &&
            !element.isDeleted,
      );
      if (selectedFrame) {
        const root = productShellRef.current;
        if (root) {
          focusSlideForRecording(api, root, selectedFrame);
        }
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            updateFocusRect(selectedFrame.id);
            resolve();
          });
        });
        window.setTimeout(
          () => updateFocusRect(selectedFrame.id),
          SLIDE_TRANSITION_DURATION_MS,
        );
      }
      const frame = await renderCurrentFrame();
      const elements = api.getSceneElements();
      const files = api.getFiles();
      const dimensions = getFrameRenderDimensions(frame, profile);
      const preflight = await runScenePreflight(
        {
          images: elements
            .filter((element) => element.type === "image")
            .map((element) => ({
              id: element.id,
              type: "image" as const,
              fileId: element.fileId,
              width: element.width,
              height: element.height,
            })),
          files,
          scale: dimensions.scale,
          fonts: [{ family: "Excalifont", text: "中文 ABC 123" }],
        },
        {
          decodeImage,
          checkFont: (family, text) =>
            document.fonts?.check(`16px "${family}"`, text) ?? true,
        },
      );
      const capability = await selectRecorderCapability(
        recorderOptionsFor(profile),
        {
          isTypeSupported: (mimeType) =>
            typeof MediaRecorder !== "undefined" &&
            MediaRecorder.isTypeSupported(mimeType),
        },
      );
      const blockingIssues = preflight.blocking.map((issue) => issue.message);
      if (!capability.supported) {
        blockingIssues.push("当前浏览器没有可用的视频编码格式");
      }
      let acquired: AcquiredMedia = {
        stream: null,
        cameraStream: null,
        microphoneStream: null,
        warnings: [],
      };
      if (navigator.mediaDevices) {
        acquired = await acquireEnabledMedia(
          navigator.mediaDevices as unknown as MediaDevicesPort,
          settings,
        );
        acquiredMediaRef.current = acquired;
        void enumerateMediaDevices(
          navigator.mediaDevices as unknown as MediaDevicesPort,
        )
          .then(setDevices)
          .catch(() => undefined);
      } else {
        acquired = {
          ...acquired,
          warnings: [
            "当前浏览器无法访问媒体设备，将只录制白板",
          ],
        };
      }
      setPreparation({
        capability,
        warnings: [
          ...preflight.warnings.map((issue) => issue.message),
          ...acquired.warnings,
        ],
        blockingIssues,
        hasCamera: Boolean(acquired.cameraStream),
        hasMicrophone: Boolean(acquired.microphoneStream),
        cameraDeviceName:
          acquired.cameraStream?.getVideoTracks()[0]?.label ?? null,
        microphoneDeviceName:
          acquired.microphoneStream?.getAudioTracks()[0]?.label ?? null,
      });
      if (
        acquired.cameraStream &&
        acquired.cameraStream.getVideoTracks().length > 0
      ) {
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => resolve()),
        );
        const cameraVideo = cameraVideoRef.current;
        if (cameraVideo) {
          const warning = await attachCameraPreview(
            cameraVideo,
            acquired.cameraStream as unknown as MediaStream,
            {
              onReady: () =>
                setPreparation((current) =>
                  current
                    ? {
                        ...current,
                        warnings: current.warnings.filter(
                          (item) => item !== CAMERA_PREVIEW_WAITING_WARNING,
                        ),
                      }
                    : current,
                ),
            },
          );
          if (warning) {
            setPreparation((current) =>
              current
                ? { ...current, warnings: [...current.warnings, warning] }
                : current,
            );
          }
          const slideRect = getSlideRect(profile, settings.canvas.padding);
          const cameraRect = getCameraRect(
            slideRect,
            settings.camera.size,
            settings.camera.positionX,
            settings.camera.positionY,
          );
          compositorRef.current?.setCamera({
            source: cameraVideo,
            ...cameraRect,
            shape: settings.camera.shape,
            mirrored: settings.camera.mirrored,
          });
          compositorRef.current?.draw();
        }
      }
    } catch (error) {
      setPreparation({
        capability: {
          supported: false,
          mimeType: null,
          smooth: null,
          powerEfficient: null,
          options: recorderOptionsFor(profile),
        },
        warnings: [],
        blockingIssues: [
          error instanceof Error ? error.message : "录制准备失败",
        ],
        hasCamera: false,
        hasMicrophone: false,
        cameraDeviceName: null,
        microphoneDeviceName: null,
      });
    } finally {
      preparingRef.current = false;
    }
  }, [
    profile,
    renderCurrentFrame,
    settings,
    stopDevices,
    updateFocusRect,
  ]);

  const cancelRecordingPreparation = useCallback(() => {
    if (startingRef.current) {
      return;
    }
    setPreparation(null);
    setRecordingState("idle");
    stopDevices();
    restoreEditingFocus();
  }, [restoreEditingFocus, stopDevices]);

  const startRecording = useCallback(async () => {
    if (startingRef.current || recordingSessionRef.current) {
      return;
    }
    const canvas = recordingCanvasRef.current;
    const whiteboardCanvas = whiteboardRecordingCanvasRef.current;
    const capability = preparation?.capability;
    if (
      !canvas ||
      !whiteboardCanvas ||
      !capability?.supported ||
      !capability.mimeType
    ) {
      return;
    }
    startingRef.current = true;
    setRecordingState("starting");
    try {
      setRecordingError(null);
      setRecordingResultOpen(false);
      const createTask = async () => {
        const { sink } = await createTemporaryChunkSink();
        return new MediaRecorderEngine({
          sink,
          createMediaStream: (tracks) =>
            new MediaStream(
              tracks as readonly MediaTrackLike[] as MediaStreamTrack[],
            ) as unknown as MediaStreamLike,
          createRecorder: (stream, options) =>
            new MediaRecorder(
              stream as unknown as MediaStream,
              options,
            ) as unknown as MediaRecorderLike,
        });
      };
      const cameraStream =
        acquiredMediaRef.current?.cameraStream as unknown as
          | MediaStreamLike
          | null;
      const microphoneStream =
        acquiredMediaRef.current
          ?.microphoneStream as unknown as MediaStreamLike | null;
      const audioMimeType = microphoneStream
        ? selectAudioRecorderMimeType(
            MediaRecorder.isTypeSupported.bind(MediaRecorder),
          )
        : null;
      if (microphoneStream && !audioMimeType) {
        throw new Error("当前环境不支持单独录制声音素材");
      }
      const [compositeTask, whiteboardTask, cameraTask, audioTask] =
        await Promise.all([
          createTask(),
          createTask(),
          cameraStream ? createTask() : Promise.resolve(null),
          microphoneStream ? createTask() : Promise.resolve(null),
        ]);
      const session = new DualRecordingSession(
        compositeTask,
        whiteboardTask,
        cameraTask,
        audioTask,
      );
      recordingSessionRef.current = session;
      await autosaveRef.current?.flush();
      const captureStream =
        canvas.captureStream(profile.fps) as unknown as MediaStreamLike;
      const whiteboardCaptureStream =
        whiteboardCanvas.captureStream(
          profile.fps,
        ) as unknown as MediaStreamLike;
      captureStreamRefs.current = [captureStream, whiteboardCaptureStream];
      const recorder = {
        mimeType: capability.mimeType,
        videoBitsPerSecond: capability.options.videoBitsPerSecond,
        audioBitsPerSecond: capability.options.audioBitsPerSecond,
      };
      await session.start(
        {
          videoStream: captureStream,
          microphoneStream,
          recorder,
        },
        {
          videoStream: whiteboardCaptureStream,
          microphoneStream: null,
          recorder,
        },
        cameraStream
          ? {
              videoStream: cameraStream,
              microphoneStream: null,
              recorder,
            }
          : null,
        microphoneStream
          ? {
              videoStream: null,
              microphoneStream,
              recorder: {
                mimeType: audioMimeType!,
                audioBitsPerSecond: capability.options.audioBitsPerSecond,
              },
            }
          : null,
      );
      clockRef.current = new RecordingClock();
      clockRef.current.start(performance.now());
      setPreparation(null);
      setRecordingState("recording");
      startCompositionLoop();
    } catch (error) {
      await recordingSessionRef.current?.abort();
      recordingSessionRef.current = null;
      stopCaptureStream();
      stopDevices();
      setPreparation(null);
      setRecordingState("failed");
      restoreEditingFocus();
      setRecordingResultOpen(true);
      setRecordingError(
        error instanceof Error ? error.message : "无法开始录制",
      );
    } finally {
      startingRef.current = false;
    }
  }, [
    preparation,
    profile.fps,
    restoreEditingFocus,
    startCompositionLoop,
    stopCaptureStream,
    stopDevices,
  ]);

  const pauseRecording = useCallback(async () => {
    try {
      await recordingSessionRef.current?.pause();
      clockRef.current.pause(performance.now());
      setRecordingState("paused");
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "无法暂停录制",
      );
    }
  }, []);

  const resumeRecording = useCallback(async () => {
    try {
      await recordingSessionRef.current?.resume();
      clockRef.current.resume(performance.now());
      setRecordingState("recording");
    } catch (error) {
      setRecordingError(
        error instanceof Error ? error.message : "无法继续录制",
      );
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) {
      return;
    }
    const session = recordingSessionRef.current;
    if (!session) {
      return;
    }
    stoppingRef.current = true;
    setRecordingState("stopping");
    try {
      const result = await session.stop();
      clockRef.current.stop(performance.now());
      stopCompositionLoop();
      stopCaptureStream();
      stopDevices();
      const names = createRecordingFileNames(
        projectFileNameRef.current,
        result.composite.type,
        result.whiteboard?.type ?? result.composite.type,
        result.audio?.type ?? "audio/webm",
      );
      const composite = createRecordingAsset(
        result.composite,
        names.composite,
      );
      let materials: RecordingAsset | null = null;
      let materialsError =
        result.whiteboardError?.message ??
        result.cameraError?.message ??
        result.audioError?.message ??
        null;
      const materialLabels: string[] = [];
      try {
        if (!materialsError && result.whiteboard) {
          const entries = [
            { name: names.whiteboard, blob: result.whiteboard },
          ];
          materialLabels.push("白板 + 激光笔");
          if (result.camera) {
            entries.push({ name: names.camera, blob: result.camera });
            materialLabels.push("摄像头");
          }
          if (result.audio) {
            entries.push({ name: names.audio, blob: result.audio });
            materialLabels.push("声音");
          }
          const zip = await createStoredZip(entries);
          materials = createRecordingAsset(zip, names.materials);
        }
      } catch (error) {
        materialsError =
          error instanceof Error ? error.message : "无法创建 ZIP 素材包";
      }
      try {
        await retainedRecordingSessionRef.current?.cleanup();
      } catch (error) {
        setNotice(
          error instanceof Error
            ? `上次录制临时文件清理失败：${error.message}`
            : "上次录制临时文件清理失败",
        );
      }
      retainedRecordingSessionRef.current = session;
      recordingSessionRef.current = null;
      setRecordingResult({
        composite,
        materials,
        materialsDescription: materialLabels.join("、"),
        materialsError,
        completedAt: Date.now(),
      });
      setRecordingError(null);
      setRecordingResultOpen(true);
      setRecordingState("completed");
      restoreEditingFocus();
      const scene = latestSceneRef.current;
      if (scene) {
        await autosaveRef.current?.flush(
          snapshotFrom(scene.elements, scene.appState, scene.files),
        );
      }
    } catch (error) {
      stopCompositionLoop();
      await recordingSessionRef.current?.abort();
      recordingSessionRef.current = null;
      stopCaptureStream();
      stopDevices();
      setRecordingState("failed");
      restoreEditingFocus();
      setRecordingResultOpen(true);
      setRecordingError(
        error instanceof Error ? error.message : "停止录制失败",
      );
    } finally {
      stoppingRef.current = false;
    }
  }, [
    restoreEditingFocus,
    snapshotFrom,
    stopCaptureStream,
    stopCompositionLoop,
    stopDevices,
  ]);

  const navigateToSlide = useCallback(
    (slideId: string) => {
      const api = apiRef.current;
      const frame = api
        ?.getSceneElements()
        .find((element) => element.id === slideId && element.type === "frame");
      selectSlide(slideId);
      latestRenderRef.current.invalidate();
      compositorRef.current?.clearLaser();
      whiteboardCompositorRef.current?.clearLaser();
      if (api && frame) {
        const root = productShellRef.current;
        if (focusActive && root) {
          focusSlideForRecording(api, root, frame);
          requestAnimationFrame(() => updateFocusRect(slideId));
        } else {
          focusSlide(api, root, frame, EDITING_SLIDE_VIEWPORT_FACTOR);
          requestAnimationFrame(() => updateFocusRect(slideId));
        }
      }
      if (compositorRef.current) {
        void renderCurrentFrame(slideId);
      }
    },
    [focusActive, renderCurrentFrame, selectSlide, updateFocusRect],
  );

  useEffect(() => {
    if (!focusActive || typeof ResizeObserver === "undefined") {
      return;
    }
    const root = productShellRef.current;
    const api = apiRef.current;
    const container = root?.querySelector<HTMLElement>(
      ".excalidraw-container",
    );
    if (!root || !api || !container) {
      return;
    }
    let animationFrame: number | null = null;
    const refocus = () => {
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
      animationFrame = requestAnimationFrame(() => {
        animationFrame = null;
        const frameId = currentSlideIdRef.current;
        const frame = api
          .getSceneElements()
          .find(
            (element) =>
              element.id === frameId &&
              element.type === "frame" &&
              !element.isDeleted,
          );
        if (!frame) {
          return;
        }
        focusSlideForRecording(api, root, frame);
        requestAnimationFrame(() => updateFocusRect(frame.id));
      });
    };
    const observer = new ResizeObserver(refocus);
    observer.observe(container);
    const rightStack = root.querySelector<HTMLElement>(".product-right-stack");
    if (rightStack) {
      observer.observe(rightStack);
    }
    window.addEventListener("resize", refocus);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", refocus);
      if (animationFrame !== null) {
        cancelAnimationFrame(animationFrame);
      }
    };
  }, [focusActive, updateFocusRect]);

  const applySlideMutation = useCallback(
    (mutation: {
      readonly elements: readonly SlideSceneElement[];
      readonly currentSlideId: string;
    }, viewport: SlideMutationViewport = "fit") => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      const hydratedElements = hydrateNewFrames(mutation.elements);
      const versionedElements = versionChangedElements(
        api.getSceneElements(),
        hydratedElements,
      );
      compositorRef.current?.clearLaser();
      whiteboardCompositorRef.current?.clearLaser();
      api.updateScene({
        elements: excalidrawElements(versionedElements),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      setSlides(getSlides(versionedElements));
      selectSlide(mutation.currentSlideId);
      const frame = versionedElements.find(
        (element) => element.id === mutation.currentSlideId,
      );
      if (frame && viewport === "comfortable") {
        focusSlide(
          api,
          productShellRef.current,
          frame as unknown as OrderedExcalidrawElement,
          EDITING_SLIDE_VIEWPORT_FACTOR,
        );
      } else if (frame && viewport === "fit") {
        api.scrollToContent(
          frame as unknown as OrderedExcalidrawElement,
          { fitToContent: true },
        );
      }
    },
    [selectSlide],
  );

  const addSlide = useCallback(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    applySlideMutation(
      createSlide(
        sceneElements(api.getSceneElements()),
        currentSlideId,
        { width: profile.width, height: profile.height },
        () => crypto.randomUUID(),
      ),
      "comfortable",
    );
  }, [applySlideMutation, currentSlideId, profile.height, profile.width]);

  const handlePaste = useCallback(
    (data: ClipboardData) => {
      const clipboardElements = sceneElements(
        (data.elements ?? []) as readonly OrderedExcalidrawElement[],
      );
      if (!clipboardElements.some((element) => element.type === "frame")) {
        const pointer = lastEditorPointerRef.current;
        const api = apiRef.current;
        if (
          !pointer ||
          !api ||
          !isPointOnSlide(sceneElements(api.getSceneElements()), pointer)
        ) {
          setNotice(SLIDE_ONLY_PLACEMENT_NOTICE);
          return false;
        }
        return true;
      }
      const api = apiRef.current;
      if (!api) {
        return false;
      }
      try {
        applySlideMutation(
          pasteSlides(
            sceneElements(api.getSceneElements()),
            clipboardElements,
            currentSlideIdRef.current,
            () => crypto.randomUUID(),
          ),
          "preserve",
        );
        api.addFiles(Object.values(data.files ?? {}) as BinaryFileData[]);
        latestRenderRef.current.invalidate();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法粘贴 Slide");
      }
      return false;
    },
    [applySlideMutation],
  );

  const handleDeleteSlide = useCallback(
    (slideId: string) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      try {
        const deleted = deleteSlide(
          sceneElements(api.getSceneElements()),
          slideId,
        );
        const currentId = currentSlideIdRef.current;
        applySlideMutation(
          currentId &&
            currentId !== slideId &&
            deleted.slides.some((slide) => slide.id === currentId)
            ? { ...deleted, currentSlideId: currentId }
            : deleted,
          !currentId || currentId === slideId ? "comfortable" : "preserve",
        );
        latestRenderRef.current.invalidate();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法删除 Slide");
      }
    },
    [applySlideMutation],
  );

  const handleDuplicateSlide = useCallback(
    (slideId: string) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      try {
        applySlideMutation(
          duplicateSlide(
            sceneElements(api.getSceneElements()),
            slideId,
            () => crypto.randomUUID(),
          ),
          "preserve",
        );
        latestRenderRef.current.invalidate();
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法复制 Slide");
      }
    },
    [applySlideMutation],
  );

  const handleExportSlide = useCallback(
    async (slideId: string) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      const frame = api
        .getSceneElements()
        .find(
          (element) =>
            element.id === slideId &&
            element.type === "frame" &&
            !element.isDeleted,
        );
      if (!frame) {
        setNotice("找不到要导出的 Slide");
        return;
      }
      try {
        const canvas = await renderFrameToCanvas(
          {
            elements: api.getSceneElements(),
            appState: {
              ...api.getAppState(),
              exportBackground: true,
            } as unknown as Readonly<Record<string, unknown>>,
            files: api.getFiles(),
            frame,
            profile,
          },
          exportToCanvas as unknown as SceneExporter,
        );
        const blob = await canvasToPngBlob(canvas);
        const slideNumber = slides.findIndex((slide) => slide.id === slideId) + 1;
        downloadBlob(blob, `Excalicap-Slide-${slideNumber}.png`);
      } catch (error) {
        setNotice(error instanceof Error ? error.message : "无法导出 Slide");
      }
    },
    [profile, slides],
  );

  const handleReorder = useCallback(
    (orderedIds: string[]) => {
      const api = apiRef.current;
      if (!api) {
        return;
      }
      const arranged = reorderSlides(
        sceneElements(api.getSceneElements()),
        orderedIds,
      );
      const arrangedSlides = getSlides(arranged);
      const selectedSlideId = currentSlideIdRef.current;
      applySlideMutation(
        {
          elements: arranged,
          currentSlideId:
            selectedSlideId &&
            arrangedSlides.some((slide) => slide.id === selectedSlideId)
              ? selectedSlideId
              : arrangedSlides[0].id,
        },
        "preserve",
      );
    },
    [applySlideMutation],
  );

  const createSlideDragPreview = useCallback(
    async (slideId: string) => {
      const api = apiRef.current;
      if (!api) {
        return null;
      }
      const elements = api.getSceneElements();
      const frame = elements.find(
        (element) =>
          element.id === slideId &&
          element.type === "frame" &&
          !element.isDeleted,
      );
      if (!frame) {
        return null;
      }
      try {
        const canvas = await renderFrameToCanvas(
          {
            elements,
            appState: {
              ...api.getAppState(),
              exportBackground: true,
            } as unknown as Readonly<Record<string, unknown>>,
            files: api.getFiles(),
            frame,
            profile,
          },
          exportToCanvas as unknown as SceneExporter,
        );
        return canvas.toDataURL("image/jpeg", 0.82);
      } catch {
        return null;
      }
    },
    [profile],
  );

  const autoPanSlides = useCallback((direction: -1 | 1) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const appState = api.getAppState();
    const zoomState = appState.zoom ?? 1;
    const zoom =
      typeof zoomState === "number" ? zoomState : zoomState.value;
    const nextScrollX =
      (appState.scrollX ?? 0) - (direction * 12) / Math.max(zoom, 0.01);
    api.updateScene({ appState: { scrollX: nextScrollX } });
    setSlideViewport({
      ...(appState as unknown as ViewportState),
      scrollX: nextScrollX,
    });
  }, []);

  const handleSceneChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      setSlideViewport(appState as unknown as ViewportState);
      const scene = sceneElements(elements);
      const normalizedScene = normalizeSlideFrames(scene);
      const committedScene =
        normalizedScene === scene
          ? normalizedScene
          : versionChangedElements(elements, normalizedScene);
      const normalizedElements = excalidrawElements(committedScene);
      if (normalizedScene !== scene) {
        apiRef.current?.updateScene({
          elements: normalizedElements,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      latestSceneRef.current = { elements: normalizedElements, appState, files };
      const nextSlides = getSlides(committedScene);
      setSlides(nextSlides);
      const selectedSlideId = currentSlideIdRef.current;
      if (!nextSlides.some((slide) => slide.id === selectedSlideId)) {
        selectSlide(nextSlides[0]?.id ?? null);
      }
      if (
        projectReadyRef.current &&
        !programmaticSceneChangeRef.current
      ) {
        projectFileDirtyRef.current = true;
        autosaveRef.current?.queue(
          snapshotFrom(normalizedElements, appState, files),
        );
      }
      if (!currentFrameRef.current || !compositorRef.current) {
        return;
      }
      const frame = normalizedElements.find(
        (element) =>
          element.id === currentSlideIdRef.current &&
          element.type === "frame" &&
          !element.isDeleted,
      );
      if (!frame) {
        return;
      }
      if (focusActive) {
        setFocusRect(getFrameViewportRect(frame, appState));
      }
      void latestRenderRef.current
        .run(
          () =>
            renderFrameToCanvas(
              {
                elements: normalizedElements,
                appState: {
                  ...appState,
                  exportBackground: false,
                } as unknown as Readonly<Record<string, unknown>>,
                files,
                frame,
                profile,
              },
              exportToCanvas as unknown as SceneExporter,
            ),
          (whiteboard) => {
            compositorRef.current?.setWhiteboard(whiteboard);
            compositorRef.current?.draw();
            whiteboardCompositorRef.current?.setWhiteboard(whiteboard);
            whiteboardCompositorRef.current?.draw();
            currentFrameRef.current = {
              id: frame.id,
              x: frame.x,
              y: frame.y,
              width: frame.width,
              height: frame.height,
            };
          },
        )
        .catch((error) => {
          setNotice(
            error instanceof Error
              ? `白板画面更新失败：${error.message}`
              : "白板画面更新失败",
          );
        });
    },
    [focusActive, selectSlide, snapshotFrom],
  );

  const handlePointerUpdate = useCallback(
    ({
      pointer,
      button,
    }: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      lastEditorPointerRef.current = { x: pointer.x, y: pointer.y };
      const frame = currentFrameRef.current;
      if (!frame || !compositorRef.current) {
        return;
      }
      if (pointer.tool === "laser") {
        for (const compositor of [
          compositorRef.current,
          whiteboardCompositorRef.current,
        ]) {
          compositor?.setCursor(null);
          compositor?.updateLaser({
            editorX: pointer.x,
            editorY: pointer.y,
            frame,
            button,
            visible: settings.cursor.enabled,
            color: settings.cursor.color,
          });
          compositor?.draw();
        }
        return;
      }
      for (const compositor of [
        compositorRef.current,
        whiteboardCompositorRef.current,
      ]) {
        compositor?.setCursor({
          editorX: pointer.x,
          editorY: pointer.y,
          frame,
          visible: settings.cursor.enabled,
          color: settings.cursor.color,
        });
        compositor?.draw();
      }
    },
    [settings.cursor],
  );

  const handleEditorPointerUp = useCallback(
    (_activeTool: AppState["activeTool"], pointerDownState: PointerDownState) => {
      if (!pointerDownState.drag.hasOccurred) {
        return;
      }
      const originalElements = pointerDownState.originalElements;
      queueMicrotask(() => {
        const api = apiRef.current;
        if (!mountedRef.current || !api) {
          return;
        }
        const currentElements = api.getSceneElements();
        const currentScene = sceneElements(currentElements);
        const targetSlide = lastEditorPointerRef.current
          ? getSlideAtPoint(currentScene, lastEditorPointerRef.current)
          : null;
        const selectedElementIds = api.getAppState().selectedElementIds ?? {};
        let changed = false;
        const nextElements = currentElements.map((element) => {
          if (
            element.type === "frame" ||
            element.isDeleted ||
            !selectedElementIds[element.id]
          ) {
            return element;
          }
          if (targetSlide) {
            if (element.frameId === targetSlide.id) {
              return element;
            }
            changed = true;
            return { ...element, frameId: targetSlide.id };
          }
          const original = originalElements.get(element.id);
          if (!original?.frameId) {
            return element;
          }
          changed = true;
          return {
            ...element,
            x: original.x,
            y: original.y,
            frameId: original.frameId,
          };
        });
        if (!changed) {
          return;
        }
        const versionedElements = versionChangedElements(
          currentElements,
          sceneElements(nextElements),
        );
        api.updateScene({
          elements: excalidrawElements(versionedElements),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        if (!targetSlide) {
          setNotice(SLIDE_ONLY_PLACEMENT_NOTICE);
        }
      });
    },
    [],
  );

  const openSettings = useCallback(() => {
    if (
      recordingStateRef.current !== "idle" &&
      recordingStateRef.current !== "completed" &&
      recordingStateRef.current !== "failed"
    ) {
      return;
    }
    setSettingsOpen(true);
    if (navigator.mediaDevices) {
      void enumerateMediaDevices(
        navigator.mediaDevices as unknown as MediaDevicesPort,
      )
        .then(setDevices)
        .catch(() => undefined);
    }
  }, []);

  const changePreparationDevices = useCallback(() => {
    if (startingRef.current) {
      return;
    }
    cancelRecordingPreparation();
    openSettings();
  }, [cancelRecordingPreparation, openSettings]);

  const applySettings = useCallback(
    (nextSettings: ProductSettings) => {
      if (
        recordingStateRef.current !== "idle" &&
        recordingStateRef.current !== "completed" &&
        recordingStateRef.current !== "failed"
      ) {
        setNotice("录制期间不能修改画幅和录制设置");
        return;
      }
      const nextProfile = resolveOutputProfile(nextSettings);
      profileRef.current = nextProfile;
      const api = apiRef.current;
      if (api) {
        const currentExcalidrawElements = api.getSceneElements();
        const currentElements = sceneElements(currentExcalidrawElements);
        const frameSizeChanged = currentElements.some(
          (element) =>
            element.type === "frame" &&
            !element.isDeleted &&
            (element.width !== nextProfile.width ||
              element.height !== nextProfile.height),
        );
        const resizedElements = frameSizeChanged
          ? resizeSlideFrames(currentElements, nextProfile)
          : normalizeSlideFrames(currentElements, nextProfile);
        const normalizedElements = frameSizeChanged
          ? versionChangedElements(currentExcalidrawElements, resizedElements)
          : resizedElements;
        programmaticSceneChangeRef.current = true;
        if (programmaticSceneTimerRef.current) {
          window.clearTimeout(programmaticSceneTimerRef.current);
        }
        api.updateScene({
          elements: excalidrawElements(normalizedElements),
          appState: {
            currentItemFontSize: defaultPresentationFontSize(
              Math.min(nextProfile.width, nextProfile.height),
            ),
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        setSlides(getSlides(normalizedElements));
        latestSceneRef.current = {
          elements: excalidrawElements(normalizedElements),
          appState: api.getAppState(),
          files: api.getFiles(),
        };
        projectFileDirtyRef.current = true;
        autosaveRef.current?.queue(
          snapshotFrom(
            excalidrawElements(normalizedElements),
            api.getAppState(),
            api.getFiles(),
          ),
        );
        programmaticSceneTimerRef.current = window.setTimeout(() => {
          programmaticSceneChangeRef.current = false;
          programmaticSceneTimerRef.current = null;
        }, PROGRAMMATIC_SCENE_SETTLE_MS);
      }
      setSettings(nextSettings);
      saveProductSettings(localStorage, nextSettings);
      setSettingsOpen(false);
      requestAnimationFrame(() => {
        productShellRef.current
          ?.querySelector<HTMLElement>(".excalidraw-container")
          ?.focus({ preventScroll: true });
      });
      compositorRef.current?.dispose();
      compositorRef.current = null;
      whiteboardCompositorRef.current?.dispose();
      whiteboardCompositorRef.current = null;
      setNotice("设置已应用；现有 Slide 已统一为所选画幅");
    },
    [snapshotFrom],
  );

  const updateCameraSettings = useCallback(
    (camera: CameraSettings) => {
      if (startingRef.current) {
        return;
      }
      setSettings((current) => {
        const nextSettings = { ...current, camera };
        saveProductSettings(localStorage, nextSettings);
        return nextSettings;
      });
      const source = cameraVideoRef.current;
      if (!source || !acquiredMediaRef.current?.cameraStream) {
        return;
      }
      const cameraRect = getCameraRect(
        getSlideRect(profile, settings.canvas.padding),
        camera.size,
        camera.positionX,
        camera.positionY,
      );
      compositorRef.current?.setCamera({
        source,
        ...cameraRect,
        shape: camera.shape,
        mirrored: camera.mirrored,
      });
      compositorRef.current?.draw();
    },
    [profile, settings.canvas.padding],
  );

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const gesture = cameraGestureRef.current;
      if (
        !gesture ||
        event.pointerId !== gesture.pointerId ||
        !focusRect
      ) {
        return;
      }
      if (gesture.kind === "drag") {
        updateCameraSettings({
          ...gesture.camera,
          positionX: Math.min(
            1,
            Math.max(
              0,
              gesture.camera.positionX +
                (event.clientX - gesture.startX) / focusRect.width,
            ),
          ),
          positionY: Math.min(
            1,
            Math.max(
              0,
              gesture.camera.positionY +
                (event.clientY - gesture.startY) / focusRect.height,
            ),
          ),
        });
        return;
      }
      const delta = Math.max(
        event.clientX - gesture.startX,
        event.clientY - gesture.startY,
      );
      updateCameraSettings({
        ...gesture.camera,
        size: Math.min(
          480,
          Math.max(160, gesture.camera.size + (delta * 1080) / focusRect.width),
        ),
      });
    };
    const onPointerUp = (event: PointerEvent) => {
      if (cameraGestureRef.current?.pointerId === event.pointerId) {
        cameraGestureRef.current = undefined;
      }
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [focusRect, updateCameraSettings]);

  useEffect(() => {
    if (
      recordingState !== "recording" &&
      recordingState !== "paused"
    ) {
      return;
    }
    const timer = window.setInterval(
      () => setClockPulse((value) => value + 1),
      250,
    );
    return () => window.clearInterval(timer);
  }, [recordingState]);

  useEffect(() => {
    const onVisibilityChange = () => {
      if (
        document.hidden &&
        recordingState === "recording"
      ) {
        void pauseRecording();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", onVisibilityChange);
  }, [pauseRecording, recordingState]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const recordingState = recordingStateRef.current;
      if (
        recordingState !== "preparing" &&
        recordingState !== "recording" &&
        recordingState !== "paused"
      ) {
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const index = slides.findIndex((slide) => slide.id === currentSlideId);
      const nextIndex =
        event.key === "ArrowRight"
          ? Math.min(slides.length - 1, index + 1)
          : Math.max(0, index - 1);
      const target = slides[nextIndex];
      if (target && target.id !== currentSlideId) {
        navigateToSlide(target.id);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [currentSlideId, navigateToSlide, slides]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        if (programmaticSceneTimerRef.current) {
          window.clearTimeout(programmaticSceneTimerRef.current);
          programmaticSceneTimerRef.current = null;
        }
        autosaveRef.current?.dispose();
        void recordingSessionRef.current?.abort();
        void retainedRecordingSessionRef.current
          ?.cleanup()
          .catch(() => undefined);
        stopCaptureStream();
        stopCompositionLoop();
        stopDevices();
        compositorRef.current?.dispose();
        whiteboardCompositorRef.current?.dispose();
      };
    },
    [stopCaptureStream, stopCompositionLoop, stopDevices],
  );

  useEffect(() => {
    return () => {
      revokeRecordingResult(recordingResult);
    };
  }, [recordingResult]);

  const projectMenu = useMemo(
    () => (
      <MainMenu>
        {showProjectFileActions && (
          <>
            <MainMenu.Item onSelect={() => void newProject()}>
              新建项目
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => void openProject()}>
              打开项目…
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => void saveProject(false)}>
              保存
            </MainMenu.Item>
            <MainMenu.Item onSelect={() => void saveProject(true)}>
              另存为…
            </MainMenu.Item>
            <MainMenu.Separator />
          </>
        )}
        <MainMenu.Item
          icon={<Icon name="copy" />}
          onSelect={() => void copyAiDrawingPrompt()}
        >
          复制 AI 绘图提示词
        </MainMenu.Item>
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    ),
    [
      copyAiDrawingPrompt,
      newProject,
      openProject,
      saveProject,
      showProjectFileActions,
    ],
  );

  const elapsedText = formatRecordingTime(
    recordingState === "idle"
      ? 0
      : clockRef.current.elapsed(performance.now() + clockPulse * 0),
  );
  const productHostRect = productShellRef.current?.getBoundingClientRect();
  const productHostOrigin = productHostRect
    ? { left: productHostRect.left, top: productHostRect.top }
    : null;
  const overlayRect = (() => {
    if (!focusRect) {
      return null;
    }
    return productHostOrigin
      ? toHostViewportRect(focusRect, productHostOrigin)
      : focusRect;
  })();
  const cameraPreviewStyle = (() => {
    if (!overlayRect) {
      return undefined;
    }
    const cameraRect = getCameraRect(
      {
        x: overlayRect.left,
        y: overlayRect.top,
        width: overlayRect.width,
        height: overlayRect.height,
      },
      settings.camera.size,
      settings.camera.positionX,
      settings.camera.positionY,
    );
    return {
      left: cameraRect.x,
      top: cameraRect.y,
      width: cameraRect.width,
      height: cameraRect.height,
      borderRadius: settings.camera.shape === "circle" ? "50%" : "16%",
    };
  })();
  const cameraVisible = Boolean(
    focusActive &&
      focusRect &&
      acquiredMediaRef.current?.cameraStream,
  );
  const cameraAdjustable = cameraVisible && recordingState === "preparing";

  return (
    <main
      className="product-shell"
      data-recording-focus={focusActive}
      data-theme={settings.theme}
      ref={productShellRef}
    >
      <div className="editor-canvas" data-selection-hint="hidden">
        <Excalidraw
          excalidrawAPI={configureApi}
          generateIdForFile={generateIdForFile}
          initialData={initialData}
          langCode="zh-CN"
          name="Excalicap"
          onChange={handleSceneChange}
          onLibraryChange={handleLibraryChange}
          onPaste={handlePaste}
          onPointerUpdate={handlePointerUpdate}
          onPointerUp={handleEditorPointerUp}
          theme={settings.theme}
        >
          {projectMenu}
        </Excalidraw>
      </div>

      <CanvasSlideSorter
        currentSlideId={currentSlideId}
        disabled={
          focusActive ||
          settingsOpen ||
          recordingResultOpen ||
          slides.length < 2
        }
        hostOrigin={productHostOrigin}
        slides={slides}
        viewport={slideViewport}
        onAutoPan={autoPanSlides}
        onPreview={createSlideDragPreview}
        onReorder={handleReorder}
        onSelect={selectCanvasSlide}
      />

      {focusActive && overlayRect && (
        <div
          aria-hidden="true"
          className="recording-focus-frame"
          style={{
            left: overlayRect.left,
            top: overlayRect.top,
            width: overlayRect.width,
            height: overlayRect.height,
          }}
        />
      )}

      <div
        aria-label="右侧控制栏"
        className="product-right-stack"
        role="group"
      >
        <ProductTopbar
          elapsedText={elapsedText}
          hasRecordingResult={Boolean(recordingResult)}
          recordingState={recordingState}
          saveStatus={saveStatus}
          onOpenRecordingResult={() => {
            setRecordingError(null);
            setRecordingResultOpen(true);
          }}
          onOpenSettings={openSettings}
          onOpenTeleprompter={() => setTeleprompterOpen((value) => !value)}
          onPause={pauseRecording}
          onRecord={prepareRecording}
          onResume={resumeRecording}
          onStop={stopRecording}
        />

        <SlideRail
          currentSlideId={currentSlideId}
          slides={slides}
          theme={settings.theme}
          onAdd={addSlide}
          onDelete={handleDeleteSlide}
          onDuplicate={handleDuplicateSlide}
          onExport={(slideId) => void handleExportSlide(slideId)}
          onNavigate={navigateToSlide}
          onReorder={handleReorder}
        />
      </div>

      <SettingsDialog
        devices={devices}
        open={settingsOpen}
        settings={settings}
        onApply={applySettings}
        onClose={() => setSettingsOpen(false)}
      />

      <Teleprompter
        open={teleprompterOpen}
        settings={settings.teleprompter}
        onChange={(teleprompter) => {
          teleprompterTextRef.current = teleprompter.text;
          setSettings((current) => {
            const next = { ...current, teleprompter };
            saveProductSettings(localStorage, next);
            return next;
          });
          const api = apiRef.current;
          if (api && projectReadyRef.current) {
            projectFileDirtyRef.current = true;
            autosaveRef.current?.queue(
              snapshotFrom(
                api.getSceneElements(),
                api.getAppState(),
                api.getFiles(),
              ),
            );
          }
        }}
        onClose={() => setTeleprompterOpen(false)}
      />

      <RecordingPreparation
        blockingIssues={preparation?.blockingIssues ?? []}
        camera={settings.camera}
        cameraDeviceName={preparation?.cameraDeviceName ?? null}
        hasCamera={preparation?.hasCamera ?? false}
        hasMicrophone={preparation?.hasMicrophone ?? false}
        mimeType={
          preparation?.capability.supported
            ? (preparation.capability.mimeType ?? "不可用")
            : "不可用"
        }
        microphoneDeviceName={preparation?.microphoneDeviceName ?? null}
        microphoneEnabled={settings.microphone.enabled}
        open={Boolean(preparation)}
        profile={profile}
        starting={recordingState === "starting"}
        warnings={preparation?.warnings ?? []}
        onCameraChange={updateCameraSettings}
        onCameraReset={() =>
          updateCameraSettings({
            ...settings.camera,
            size: DEFAULT_SETTINGS.camera.size,
            positionX: DEFAULT_SETTINGS.camera.positionX,
            positionY: DEFAULT_SETTINGS.camera.positionY,
          })
        }
        onCancel={cancelRecordingPreparation}
        onChangeDevices={changePreparationDevices}
        onStart={startRecording}
      />

      <RecordingResult
        error={recordingError}
        open={recordingResultOpen}
        result={recordingResult}
        onClose={() => {
          setRecordingError(null);
          setRecordingState("idle");
          setRecordingResultOpen(false);
        }}
      />

      {notice && (
        <button
          className="product-notice"
          onClick={() => setNotice(null)}
          type="button"
        >
          {notice}
        </button>
      )}

      <canvas
        aria-label="录制目标 Canvas"
        className="recording-canvas"
        height={profile.height}
        ref={recordingCanvasRef}
        width={profile.width}
      />
      <canvas
        aria-label="白板素材 Canvas"
        className="recording-canvas"
        height={profile.height}
        ref={whiteboardRecordingCanvasRef}
        width={profile.width}
      />
      <div
        aria-label="调整摄像头"
        className="camera-overlay"
        data-shape={settings.camera.shape}
        data-visible={cameraVisible}
        onPointerDown={(event) => {
          if (!cameraAdjustable) {
            return;
          }
          event.preventDefault();
          cameraGestureRef.current = {
            kind: "drag",
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            camera: settings.camera,
          };
        }}
        style={cameraPreviewStyle}
      >
        <video
          autoPlay
          className="camera-overlay-source"
          muted
          playsInline
          ref={cameraVideoRef}
          style={{
            transform: settings.camera.mirrored ? "scaleX(-1)" : "none",
          }}
        />
        <button
          aria-label="调整摄像头大小"
          className="camera-resize-handle"
          disabled={!cameraAdjustable}
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            cameraGestureRef.current = {
              kind: "resize",
              pointerId: event.pointerId,
              startX: event.clientX,
              startY: event.clientY,
              camera: settings.camera,
            };
          }}
          type="button"
        />
      </div>
    </main>
  );
}
