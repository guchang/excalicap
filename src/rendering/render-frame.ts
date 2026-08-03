import {
  getFrameRenderDimensions,
  type OutputProfile,
} from "./output-profile";

export interface FrameBounds {
  readonly id: string;
  readonly width: number;
  readonly height: number;
}

export interface SceneExportOptions {
  readonly elements: readonly unknown[];
  readonly appState: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
  readonly exportingFrame: unknown;
  readonly getDimensions: (
    width: number,
    height: number,
  ) => { width: number; height: number; scale: number };
}

export interface RenderFrameRequest {
  readonly elements: readonly unknown[];
  readonly appState: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
  readonly frame: FrameBounds;
  readonly profile: OutputProfile;
}

export type SceneExporter = (
  options: SceneExportOptions,
) => Promise<HTMLCanvasElement>;

interface FrameElement {
  readonly id?: string;
  readonly frameId?: string | null;
  readonly isDeleted?: boolean;
}

export function selectFrameElements(
  elements: readonly unknown[],
  frameId: string,
): readonly unknown[] {
  return elements.filter((element) => {
    const candidate = element as FrameElement;
    return (
      !candidate.isDeleted &&
      (candidate.id === frameId || candidate.frameId === frameId)
    );
  });
}

export async function renderFrameToCanvas(
  request: RenderFrameRequest,
  exportScene: SceneExporter,
): Promise<HTMLCanvasElement> {
  const dimensions = getFrameRenderDimensions(request.frame, request.profile);

  return exportScene({
    elements: selectFrameElements(request.elements, request.frame.id),
    appState: request.appState,
    files: request.files,
    exportingFrame: request.frame,
    getDimensions: () => dimensions,
  });
}
