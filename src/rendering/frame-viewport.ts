export interface SceneFrameRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportState {
  readonly scrollX: number;
  readonly scrollY: number;
  readonly zoom: number | { readonly value: number };
  readonly offsetLeft: number;
  readonly offsetTop: number;
}

export interface ViewportRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ViewportOrigin {
  readonly left: number;
  readonly top: number;
}

export function getFrameViewportRect(
  frame: SceneFrameRect,
  appState: ViewportState,
): ViewportRect {
  const zoomState = appState.zoom ?? 1;
  const zoom =
    typeof zoomState === "number" ? zoomState : zoomState.value;
  const scrollX = appState.scrollX ?? 0;
  const scrollY = appState.scrollY ?? 0;
  const offsetLeft = appState.offsetLeft ?? 0;
  const offsetTop = appState.offsetTop ?? 0;
  return {
    left: (frame.x + scrollX) * zoom + offsetLeft,
    top: (frame.y + scrollY) * zoom + offsetTop,
    width: frame.width * zoom,
    height: frame.height * zoom,
  };
}

export function toHostViewportRect(
  rect: ViewportRect,
  host: ViewportOrigin,
): ViewportRect {
  return {
    left: rect.left - host.left,
    top: rect.top - host.top,
    width: rect.width,
    height: rect.height,
  };
}
