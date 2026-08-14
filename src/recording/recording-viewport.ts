import type { Offsets } from "@excalidraw/excalidraw/types";

export interface ViewportRectLike {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

export interface RecordingViewportObstacles {
  readonly top?: ViewportRectLike | null;
  readonly right?: ViewportRectLike | null;
  readonly bottom?: ViewportRectLike | null;
}

export interface RecordingViewportFrame {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RecordingViewportAppState {
  readonly offsetLeft?: number;
  readonly offsetTop?: number;
}

export interface RecordingViewportState {
  readonly zoom: number;
  readonly scrollX: number;
  readonly scrollY: number;
}

function overlapsContainer(
  container: ViewportRectLike,
  obstacle: ViewportRectLike,
) {
  return (
    obstacle.right > container.left &&
    obstacle.left < container.right &&
    obstacle.bottom > container.top &&
    obstacle.top < container.bottom
  );
}

export function calculateRecordingViewportOffsets(
  container: ViewportRectLike,
  obstacles: RecordingViewportObstacles,
): Offsets {
  const margin = Math.max(
    16,
    Math.min(32, Math.round(Math.min(container.width, container.height) * 0.025)),
  );
  const visible = (rect: ViewportRectLike | null | undefined) =>
    rect && rect.width > 0 && rect.height > 0 && overlapsContainer(container, rect)
      ? rect
      : null;
  const top = visible(obstacles.top);
  const right = visible(obstacles.right);
  const bottom = visible(obstacles.bottom);

  return {
    left: margin,
    top: top ? Math.max(margin, top.bottom - container.top + margin) : margin,
    right: right
      ? Math.max(margin, container.right - right.left + margin)
      : margin,
    bottom: bottom
      ? Math.max(margin, container.bottom - bottom.top + margin)
      : margin,
  };
}

export function calculateRecordingViewportState(
  frame: RecordingViewportFrame,
  container: ViewportRectLike,
  offsets: Offsets,
  appState: RecordingViewportAppState,
): RecordingViewportState {
  const left = offsets.left ?? 0;
  const right = offsets.right ?? 0;
  const top = offsets.top ?? 0;
  const bottom = offsets.bottom ?? 0;
  const availableWidth = Math.max(1, container.width - left - right);
  const availableHeight = Math.max(1, container.height - top - bottom);
  const zoom = Math.min(
    availableWidth / frame.width,
    availableHeight / frame.height,
  );
  const safeCenterX = left + availableWidth / 2;
  const safeCenterY = top + availableHeight / 2;
  const appOffsetX = (appState.offsetLeft ?? container.left) - container.left;
  const appOffsetY = (appState.offsetTop ?? container.top) - container.top;

  return {
    zoom,
    scrollX:
      (safeCenterX - appOffsetX) / zoom - (frame.x + frame.width / 2),
    scrollY:
      (safeCenterY - appOffsetY) / zoom - (frame.y + frame.height / 2),
  };
}

export interface RecordingViewportMeasurement {
  readonly container: ViewportRectLike;
  readonly offsets: Offsets;
}

export function measureRecordingViewport(
  root: HTMLElement,
): RecordingViewportMeasurement | null {
  const container = root.querySelector<HTMLElement>(".excalidraw-container");
  if (!container) {
    return null;
  }
  const containerRect = container.getBoundingClientRect();
  return {
    container: containerRect,
    offsets: calculateRecordingViewportOffsets(containerRect, {
    top: root
      .querySelector<HTMLElement>(".App-toolbar-container")
      ?.getBoundingClientRect(),
    right: root
      .querySelector<HTMLElement>(".product-right-stack")
      ?.getBoundingClientRect(),
    bottom: root
      .querySelector<HTMLElement>(".App-menu_bottom")
      ?.getBoundingClientRect(),
    }),
  };
}
