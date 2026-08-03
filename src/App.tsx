import {
  Excalidraw,
  MainMenu,
  convertToExcalidrawElements,
  exportToCanvas,
  getDataURL,
  loadFromBlob,
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
} from "@excalidraw/excalidraw/types";
import type { OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
} from "./product/settings-storage";
import type { ProductSettings } from "./product/types";
import type { CameraSettings } from "./product/types";
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
import { selectRecorderCapability } from "./recording/capabilities";
import {
  createMemoryChunkSink,
  createOpfsChunkSink,
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
import { RecordingClock, formatRecordingTime } from "./recording/recording-clock";
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
  getSlides,
  normalizeSlideFrames,
  reorderSlides,
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

const EDITING_SLIDE_VIEWPORT_FACTOR = 0.7;
const RECORDING_SLIDE_VIEWPORT_FACTOR = 0.9;
const SLIDE_TRANSITION_DURATION_MS = 500;

function focusSlide(
  api: ExcalidrawImperativeAPI,
  frame: OrderedExcalidrawElement,
  viewportFactor: number,
) {
  const container = document.querySelector<HTMLElement>(
    ".excalidraw-container",
  );
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
        `excalicap-${crypto.randomUUID()}.tmp`,
        {
          getDirectory: async () =>
            (await navigator.storage.getDirectory()) as unknown as OpfsDirectory,
        },
      );
      return { sink, kind: "OPFS" };
    } catch {
      return { sink: createMemoryChunkSink(), kind: "内存" };
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

function recordingFileNames(type: string, now = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate(),
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const extension = type.includes("mp4") ? "mp4" : "webm";
  return {
    composite: `Excalicap-${stamp}.${extension}`,
    camera: `Excalicap-camera-${stamp}.${extension}`,
  };
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
  if (result.camera) {
    URL.revokeObjectURL(result.camera.url);
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
  readonly libraryAdapter?: PermanentLibraryAdapter;
  readonly showProjectFileActions?: boolean;
  readonly onProjectSaveHandleChange?: (
    handle: ProjectSaveHandle | null,
  ) => void;
}

export interface ProjectSaveHandle {
  flush(): Promise<void>;
}

export default function App({
  projectStorage,
  libraryAdapter,
  showProjectFileActions = true,
  onProjectSaveHandleChange,
}: AppProps = {}) {
  const [settings, setSettings] = useState<ProductSettings>(() =>
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function"
      ? DEFAULT_SETTINGS
      : loadProductSettings(localStorage),
  );
  const [slides, setSlides] = useState(() =>
    getSlides(sceneElements(initialElements)),
  );
  const [currentSlideId, setCurrentSlideId] = useState<string | null>(
    slides[0]?.id ?? null,
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
  const currentFrameRef = useRef<ActiveFrameBounds | null>(null);
  const recordingSessionRef = useRef<DualRecordingSession | null>(null);
  const retainedRecordingSessionRef = useRef<DualRecordingSession | null>(null);
  const preparingRef = useRef(false);
  const startingRef = useRef(false);
  const stoppingRef = useRef(false);
  const captureStreamRef = useRef<MediaStreamLike | null>(null);
  const acquiredMediaRef = useRef<AcquiredMedia | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const currentSlideIdRef = useRef(currentSlideId);
  const latestRenderRef = useRef(createLatestRenderCoordinator<HTMLCanvasElement>());
  const latestSceneRef = useRef<PendingScene | null>(null);
  const projectReadyRef = useRef(false);
  const mountedRef = useRef(true);
  const projectStorageRef = useRef<ProjectStorage | null>(null);
  const libraryAdapterRef = useRef<PermanentLibraryAdapter | null>(null);
  const projectFileGatewayRef = useRef<ProjectFileGateway | null>(null);
  const projectFileHandleRef = useRef<ProjectFileHandle | null>(null);
  const projectFileNameRef = useRef<string | null>(null);
  const projectFileDirtyRef = useRef(true);
  const programmaticSceneChangeRef = useRef(false);
  const autosaveRef = useRef<AutosaveController | null>(null);
  const clockRef = useRef(new RecordingClock());
  const profile = useMemo(() => resolveOutputProfile(settings), [settings]);
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
      onStatusChange: setSaveStatus,
    });
  }

  useEffect(() => {
    const handle = {
      flush: () => autosaveRef.current?.flush() ?? Promise.resolve(),
    };
    onProjectSaveHandleChange?.(handle);
    return () => onProjectSaveHandleChange?.(null);
  }, [onProjectSaveHandleChange]);

  const initialData = useMemo(
    () => ({
      elements: initialElements,
      appState: { viewBackgroundColor: "#ffffff" },
      scrollToContent: true,
    }),
    [],
  );

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
      elements,
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files,
    }),
    [],
  );

  const replaceProjectScene = useCallback(
    async (
      elements: readonly SlideSceneElement[],
      appState: Partial<AppState>,
      files: BinaryFiles,
      nextSlideId: string | null,
    ) => {
      const api = apiRef.current;
      if (!api) {
        throw new Error("Excalidraw API 尚未初始化");
      }
      const normalized = normalizeSlideFrames(elements, profile);
      const normalizedElements = excalidrawElements(
        hydrateNewFrames(normalized),
      );
      programmaticSceneChangeRef.current = true;
      api.resetScene();
      api.updateScene({
        elements: normalizedElements,
        appState: {
          ...api.getAppState(),
          ...appState,
          isLoading: false,
        },
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
      await autosaveRef.current?.flush(
        snapshotFrom(normalizedElements, api.getAppState(), files),
      );
      window.setTimeout(() => {
        programmaticSceneChangeRef.current = false;
      }, 0);
      requestAnimationFrame(() => {
        api.scrollToContent(api.getSceneElements(), {
          fitToContent: true,
        });
      });
    },
    [profile, selectSlide, snapshotFrom],
  );

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
    setLibraryApi((current) => (current === api ? current : api));
    setSlideViewport(api.getAppState() as unknown as ViewportState);
    const currentElements = api.getSceneElements();
    const currentScene = sceneElements(currentElements);
    const normalizedElements = normalizeSlideFrames(currentScene, profile);
    if (normalizedElements !== currentScene) {
      api.updateScene({
        elements: excalidrawElements(normalizedElements),
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
    void projectStorageRef.current!
      .load()
      .then((saved) => {
        if (!mountedRef.current) {
          return;
        }
        if (saved) {
          const restoredElements = normalizeSlideFrames(
            saved.elements as unknown as readonly SlideSceneElement[],
            profile,
          );
          api.updateScene({
            elements: excalidrawElements(restoredElements),
            appState: {
              ...api.getAppState(),
              ...saved.appState,
              isLoading: false,
            },
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
  }, [profile, selectSlide]);

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
  }, []);

  const stopCaptureStream = useCallback(() => {
    const tracks = [
      ...(captureStreamRef.current?.getVideoTracks() ?? []),
      ...(captureStreamRef.current?.getAudioTracks() ?? []),
    ];
    new Set(tracks).forEach((track) => track.stop());
    captureStreamRef.current = null;
  }, []);

  const ensureCompositor = useCallback(() => {
    const canvas = recordingCanvasRef.current;
    if (!canvas) {
      throw new Error("录制画布尚未初始化");
    }
    compositorRef.current?.dispose();
    const compositor = createCompositor(canvas, profile, {
      padding: settings.canvas.padding,
      slideRadius: settings.canvas.slideRadius,
    });
    compositor.setBackground(settings.canvas.background);
    compositorRef.current = compositor;
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
        focusSlide(
          api,
          selectedFrame,
          RECORDING_SLIDE_VIEWPORT_FACTOR,
        );
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            updateFocusRect(selectedFrame.id);
            resolve();
          });
        });
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
    setPreparation(null);
    setRecordingState("idle");
    stopDevices();
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
      focusSlide(api, frame, EDITING_SLIDE_VIEWPORT_FACTOR);
    }
  }, [stopDevices]);

  const startRecording = useCallback(async () => {
    if (startingRef.current || recordingSessionRef.current) {
      return;
    }
    const canvas = recordingCanvasRef.current;
    const capability = preparation?.capability;
    if (!canvas || !capability?.supported || !capability.mimeType) {
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
      const [compositeTask, cameraTask] = await Promise.all([
        createTask(),
        cameraStream ? createTask() : Promise.resolve(null),
      ]);
      const session = new DualRecordingSession(compositeTask, cameraTask);
      recordingSessionRef.current = session;
      await autosaveRef.current?.flush();
      const captureStream =
        canvas.captureStream(profile.fps) as unknown as MediaStreamLike;
      captureStreamRef.current = captureStream;
      const microphoneStream =
        acquiredMediaRef.current
          ?.microphoneStream as unknown as MediaStreamLike | null;
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
        cameraStream
          ? {
              videoStream: cameraStream,
              microphoneStream,
              recorder,
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
      const names = recordingFileNames(result.composite.type);
      const composite = createRecordingAsset(
        result.composite,
        names.composite,
      );
      let camera: RecordingAsset | null = null;
      try {
        camera = result.camera
          ? createRecordingAsset(result.camera, names.camera)
          : null;
      } catch (error) {
        URL.revokeObjectURL(composite.url);
        throw error;
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
        camera,
        cameraError: result.cameraError?.message ?? null,
        completedAt: Date.now(),
      });
      setRecordingError(null);
      setRecordingResultOpen(true);
      setRecordingState("completed");
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
      setRecordingResultOpen(true);
      setRecordingError(
        error instanceof Error ? error.message : "停止录制失败",
      );
    } finally {
      stoppingRef.current = false;
    }
  }, [snapshotFrom, stopCaptureStream, stopCompositionLoop, stopDevices]);

  const navigateToSlide = useCallback(
    (slideId: string) => {
      const api = apiRef.current;
      const frame = api
        ?.getSceneElements()
        .find((element) => element.id === slideId && element.type === "frame");
      selectSlide(slideId);
      latestRenderRef.current.invalidate();
      compositorRef.current?.clearLaser();
      if (api && frame) {
        focusSlide(
          api,
          frame,
          focusActive
            ? RECORDING_SLIDE_VIEWPORT_FACTOR
            : EDITING_SLIDE_VIEWPORT_FACTOR,
        );
        requestAnimationFrame(() => updateFocusRect(slideId));
      }
      if (compositorRef.current) {
        void renderCurrentFrame(slideId);
      }
    },
    [focusActive, renderCurrentFrame, selectSlide, updateFocusRect],
  );

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
      compositorRef.current?.clearLaser();
      api.updateScene({ elements: excalidrawElements(hydratedElements) });
      setSlides(getSlides(hydratedElements));
      selectSlide(mutation.currentSlideId);
      const frame = hydratedElements.find(
        (element) => element.id === mutation.currentSlideId,
      );
      if (frame && viewport === "comfortable") {
        focusSlide(
          api,
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

  const handleReorder = useCallback((orderedIds: string[]) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    const arranged = reorderSlides(
      sceneElements(api.getSceneElements()),
      orderedIds,
    );
    api.updateScene({ elements: excalidrawElements(arranged) });
    setSlides(getSlides(arranged));
  }, []);

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
      const lockedScene = normalizeSlideFrames(scene, profile);
      const lockedElements = excalidrawElements(lockedScene);
      if (lockedScene !== scene) {
        apiRef.current?.updateScene({ elements: lockedElements });
      }
      latestSceneRef.current = { elements: lockedElements, appState, files };
      const nextSlides = getSlides(lockedScene);
      setSlides(nextSlides);
      const selectedSlideId = currentSlideIdRef.current;
      if (!nextSlides.some((slide) => slide.id === selectedSlideId)) {
        selectSlide(nextSlides[0]?.id ?? null);
      }
      if (projectReadyRef.current) {
        if (!programmaticSceneChangeRef.current) {
          projectFileDirtyRef.current = true;
        }
        autosaveRef.current?.queue(
          snapshotFrom(lockedElements, appState, files),
        );
      }
      if (!currentFrameRef.current || !compositorRef.current) {
        return;
      }
      const frame = lockedElements.find(
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
                elements: lockedElements,
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
    [focusActive, profile, selectSlide, snapshotFrom],
  );

  const handlePointerUpdate = useCallback(
    ({
      pointer,
      button,
    }: {
      pointer: { x: number; y: number; tool: "pointer" | "laser" };
      button: "down" | "up";
    }) => {
      const frame = currentFrameRef.current;
      if (!frame || !compositorRef.current) {
        return;
      }
      if (pointer.tool === "laser") {
        compositorRef.current.setCursor(null);
        compositorRef.current.updateLaser({
          editorX: pointer.x,
          editorY: pointer.y,
          frame,
          button,
          visible: settings.cursor.enabled,
          color: settings.cursor.color,
        });
        compositorRef.current.draw();
        return;
      }
      compositorRef.current.setCursor({
        editorX: pointer.x,
        editorY: pointer.y,
        frame,
        visible: settings.cursor.enabled,
        color: settings.cursor.color,
      });
      compositorRef.current.draw();
    },
    [settings.cursor],
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
      const api = apiRef.current;
      if (api) {
        const normalizedElements = normalizeSlideFrames(
          sceneElements(api.getSceneElements()),
          nextProfile,
        );
        api.updateScene({
          elements: excalidrawElements(normalizedElements),
        });
        setSlides(getSlides(normalizedElements));
      }
      setSettings(nextSettings);
      saveProductSettings(localStorage, nextSettings);
      setSettingsOpen(false);
      compositorRef.current?.dispose();
      compositorRef.current = null;
      setNotice("设置已应用；现有 Slide 已统一为所选画幅");
    },
    [],
  );

  const updateCameraSettings = useCallback(
    (camera: CameraSettings) => {
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
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [currentSlideId, navigateToSlide, slides]);

  useEffect(
    () => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
        autosaveRef.current?.dispose();
        void recordingSessionRef.current?.abort();
        void retainedRecordingSessionRef.current
          ?.cleanup()
          .catch(() => undefined);
        stopCaptureStream();
        stopCompositionLoop();
        stopDevices();
        compositorRef.current?.dispose();
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
        <MainMenu.DefaultItems.SaveAsImage />
        <MainMenu.DefaultItems.Help />
      </MainMenu>
    ),
    [newProject, openProject, saveProject, showProjectFileActions],
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
          onPointerUpdate={handlePointerUpdate}
          theme={settings.theme}
        >
          {projectMenu}
        </Excalidraw>
      </div>

      <CanvasSlideSorter
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
          const next = { ...settings, teleprompter };
          setSettings(next);
          saveProductSettings(localStorage, next);
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
      <div
        aria-label="调整摄像头"
        className="camera-overlay"
        data-shape={settings.camera.shape}
        data-visible={cameraVisible}
        onPointerDown={(event) => {
          if (!cameraVisible) {
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
