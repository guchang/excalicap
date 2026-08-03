import type { OutputProfile } from "../rendering/output-profile";

export interface CameraLayer {
  readonly source: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly shape: "circle" | "rounded";
  readonly mirrored: boolean;
}

export interface CursorLayer {
  readonly editorX: number;
  readonly editorY: number;
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly visible: boolean;
  readonly color: string;
}

export interface LaserPointerUpdate {
  readonly editorX: number;
  readonly editorY: number;
  readonly frame: CursorLayer["frame"];
  readonly button: "down" | "up";
  readonly visible: boolean;
  readonly color: string;
}

export interface Compositor {
  setBackground(background: string): void;
  setWhiteboard(canvas: HTMLCanvasElement | null): void;
  setCamera(camera: CameraLayer | null): void;
  setCursor(cursor: CursorLayer | null): void;
  updateLaser(update: LaserPointerUpdate): void;
  clearLaser(): void;
  draw(): void;
  dispose(): void;
}

export interface CompositorLayout {
  readonly padding: number;
  readonly slideRadius: number;
}

export interface SlideRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface LaserPoint {
  readonly x: number;
  readonly y: number;
  readonly timestamp: number;
}

interface LaserTrail {
  points: LaserPoint[];
  readonly color: string;
}

export function getCoverSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  destinationWidth: number,
  destinationHeight: number,
): SlideRect {
  const sourceRatio = sourceWidth / sourceHeight;
  const destinationRatio = destinationWidth / destinationHeight;
  if (sourceRatio > destinationRatio) {
    const width = sourceHeight * destinationRatio;
    return {
      x: (sourceWidth - width) / 2,
      y: 0,
      width,
      height: sourceHeight,
    };
  }
  const height = sourceWidth / destinationRatio;
  return {
    x: 0,
    y: (sourceHeight - height) / 2,
    width: sourceWidth,
    height,
  };
}

export function getCameraRect(
  slideRect: SlideRect,
  baseSize: number,
  positionX?: number,
  positionY?: number,
): SlideRect {
  const scale = slideRect.width / 1080;
  const size = baseSize * scale;
  const margin = 40 * scale;
  if (positionX === undefined || positionY === undefined) {
    return {
      x: slideRect.x + slideRect.width - size - margin,
      y: slideRect.y + slideRect.height - size - margin,
      width: size,
      height: size,
    };
  }
  return {
    x: Math.min(
      slideRect.x + slideRect.width - size,
      Math.max(slideRect.x, slideRect.x + slideRect.width * positionX - size / 2),
    ),
    y: Math.min(
      slideRect.y + slideRect.height - size,
      Math.max(slideRect.y, slideRect.y + slideRect.height * positionY - size / 2),
    ),
    width: size,
    height: size,
  };
}

export function getSlideRect(
  profile: OutputProfile,
  padding: number,
): SlideRect {
  const scale = profile.width / 1080;
  const x = Math.round(padding * scale);
  const width = profile.width - x * 2;
  const height = Math.round((width * profile.height) / profile.width);
  return {
    x,
    y: Math.round((profile.height - height) / 2),
    width,
    height,
  };
}

function roundedRect(
  context: CanvasRenderingContext2D,
  rect: SlideRect,
  radius: number,
) {
  const resolvedRadius = Math.min(radius, rect.width / 2, rect.height / 2);
  const right = rect.x + rect.width;
  const bottom = rect.y + rect.height;
  context.beginPath();
  context.moveTo(rect.x + resolvedRadius, rect.y);
  context.lineTo(right - resolvedRadius, rect.y);
  context.quadraticCurveTo(right, rect.y, right, rect.y + resolvedRadius);
  context.lineTo(right, bottom - resolvedRadius);
  context.quadraticCurveTo(right, bottom, right - resolvedRadius, bottom);
  context.lineTo(rect.x + resolvedRadius, bottom);
  context.quadraticCurveTo(rect.x, bottom, rect.x, bottom - resolvedRadius);
  context.lineTo(rect.x, rect.y + resolvedRadius);
  context.quadraticCurveTo(
    rect.x,
    rect.y,
    rect.x + resolvedRadius,
    rect.y,
  );
  context.closePath();
}

export function createCompositor(
  canvas: HTMLCanvasElement,
  profile: OutputProfile,
  layout: CompositorLayout = { padding: 0, slideRadius: 0 },
  now: () => number = () => performance.now(),
): Compositor {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("2D Canvas context is unavailable");
  }

  canvas.width = profile.width;
  canvas.height = profile.height;

  let whiteboard: HTMLCanvasElement | null = null;
  let camera: CameraLayer | null = null;
  let cursor: CursorLayer | null = null;
  let laserTrails: LaserTrail[] = [];
  let activeLaserTrail: LaserTrail | null = null;
  let background = "#f8f9fa";
  const slideRect = getSlideRect(profile, layout.padding);
  const slideRadius = layout.slideRadius * (profile.width / 1080);
  const laserLifetime = 1_000;

  const backgroundStyle = () => {
    if (!background.startsWith("linear-gradient")) {
      return background;
    }
    const colors = background.match(/#[0-9a-fA-F]{6}/g);
    if (!colors || colors.length < 2) {
      return "#f8f9fa";
    }
    const gradient = context.createLinearGradient(
      0,
      0,
      profile.width,
      profile.height,
    );
    gradient.addColorStop(0, colors[0]);
    gradient.addColorStop(1, colors[1]);
    return gradient;
  };

  const sourceDimensions = (source: CanvasImageSource) => {
    const candidate = source as {
      readonly videoWidth?: number;
      readonly videoHeight?: number;
      readonly naturalWidth?: number;
      readonly naturalHeight?: number;
      readonly width?: number;
      readonly height?: number;
    };
    return {
      width:
        candidate.videoWidth ||
        candidate.naturalWidth ||
        candidate.width ||
        1,
      height:
        candidate.videoHeight ||
        candidate.naturalHeight ||
        candidate.height ||
        1,
    };
  };

  const appendLaserPoint = (update: LaserPointerUpdate) => {
    const relativeX = (update.editorX - update.frame.x) / update.frame.width;
    const relativeY = (update.editorY - update.frame.y) / update.frame.height;
    if (
      relativeX < 0 ||
      relativeX > 1 ||
      relativeY < 0 ||
      relativeY > 1
    ) {
      return;
    }
    activeLaserTrail?.points.push({
      x: slideRect.x + relativeX * slideRect.width,
      y: slideRect.y + relativeY * slideRect.height,
      timestamp: now(),
    });
  };

  const drawLaserTrails = () => {
    const currentTime = now();
    laserTrails.forEach((trail) => {
      trail.points = trail.points.filter(
        (point) => currentTime - point.timestamp <= laserLifetime,
      );
    });
    laserTrails = laserTrails.filter((trail) => trail.points.length > 0);
    if (laserTrails.every((trail) => trail.points.length < 2)) {
      return;
    }

    context.save();
    roundedRect(context, slideRect, slideRadius);
    context.clip();
    for (const trail of laserTrails) {
      for (let index = 1; index < trail.points.length; index += 1) {
        const previous = trail.points[index - 1]!;
        const point = trail.points[index]!;
        const alpha = Math.max(
          0,
          1 - (currentTime - point.timestamp) / laserLifetime,
        );
        context.save();
        context.globalAlpha = alpha;
        context.strokeStyle = trail.color;
        context.lineWidth = Math.max(
          2,
          10 * (profile.width / 1080) * alpha,
        );
        context.lineCap = "round";
        context.lineJoin = "round";
        context.beginPath();
        context.moveTo(previous.x, previous.y);
        context.lineTo(point.x, point.y);
        context.stroke();
        context.restore();
      }
    }
    context.restore();
  };

  return {
    setBackground(nextBackground) {
      background = nextBackground;
    },
    setWhiteboard(nextWhiteboard) {
      whiteboard = nextWhiteboard;
    },
    setCamera(nextCamera) {
      camera = nextCamera;
    },
    setCursor(nextCursor) {
      cursor = nextCursor;
    },
    updateLaser(update) {
      if (!update.visible) {
        laserTrails = [];
        activeLaserTrail = null;
        return;
      }
      if (update.button === "down") {
        if (!activeLaserTrail) {
          activeLaserTrail = { points: [], color: update.color };
          laserTrails.push(activeLaserTrail);
        }
        appendLaserPoint(update);
        return;
      }
      if (activeLaserTrail) {
        appendLaserPoint(update);
        activeLaserTrail = null;
      }
    },
    clearLaser() {
      laserTrails = [];
      activeLaserTrail = null;
    },
    draw() {
      context.fillStyle = backgroundStyle();
      context.fillRect(0, 0, profile.width, profile.height);

      if (whiteboard) {
        context.save();
        context.shadowColor = "rgba(20, 24, 32, 0.18)";
        context.shadowBlur = Math.max(12, 24 * (profile.width / 1080));
        context.shadowOffsetY = Math.max(4, 8 * (profile.width / 1080));
        context.fillStyle = "#ffffff";
        roundedRect(context, slideRect, slideRadius);
        context.fill();
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        roundedRect(context, slideRect, slideRadius);
        context.clip();
        context.drawImage(
          whiteboard,
          slideRect.x,
          slideRect.y,
          slideRect.width,
          slideRect.height,
        );
        context.restore();
      }

      if (camera) {
        context.save();
        context.shadowColor = "rgba(19, 22, 29, 0.24)";
        context.shadowBlur = Math.max(10, 24 * (profile.width / 1080));
        context.shadowOffsetY = Math.max(4, 8 * (profile.width / 1080));
        context.fillStyle = "#ffffff";
        context.beginPath();
        if (camera.shape === "circle") {
          context.arc(
            camera.x + camera.width / 2,
            camera.y + camera.height / 2,
            Math.min(camera.width, camera.height) / 2,
            0,
            Math.PI * 2,
          );
        } else {
          roundedRect(
            context,
            {
              x: camera.x,
              y: camera.y,
              width: camera.width,
              height: camera.height,
            },
            Math.min(camera.width, camera.height) * 0.16,
          );
        }
        context.fill();
        context.shadowColor = "transparent";
        context.shadowBlur = 0;
        context.shadowOffsetY = 0;
        const borderWidth = Math.max(3, 4 * (profile.width / 1080));
        const cameraContent = {
          x: camera.x + borderWidth,
          y: camera.y + borderWidth,
          width: Math.max(1, camera.width - borderWidth * 2),
          height: Math.max(1, camera.height - borderWidth * 2),
        };
        context.beginPath();
        if (camera.shape === "circle") {
          context.arc(
            cameraContent.x + cameraContent.width / 2,
            cameraContent.y + cameraContent.height / 2,
            Math.min(cameraContent.width, cameraContent.height) / 2,
            0,
            Math.PI * 2,
          );
        } else {
          roundedRect(
            context,
            cameraContent,
            Math.min(cameraContent.width, cameraContent.height) * 0.14,
          );
        }
        context.clip();
        const dimensions = sourceDimensions(camera.source);
        const sourceRect = getCoverSourceRect(
          dimensions.width,
          dimensions.height,
          cameraContent.width,
          cameraContent.height,
        );
        if (camera.mirrored) {
          context.translate(
            cameraContent.x + cameraContent.width,
            cameraContent.y,
          );
          context.scale(-1, 1);
          context.drawImage(
            camera.source,
            sourceRect.x,
            sourceRect.y,
            sourceRect.width,
            sourceRect.height,
            0,
            0,
            cameraContent.width,
            cameraContent.height,
          );
        } else {
          context.drawImage(
            camera.source,
            sourceRect.x,
            sourceRect.y,
            sourceRect.width,
            sourceRect.height,
            cameraContent.x,
            cameraContent.y,
            cameraContent.width,
            cameraContent.height,
          );
        }
        context.restore();
      }

      drawLaserTrails();

      if (!cursor?.visible) {
        return;
      }

      const { frame } = cursor;
      const relativeX = (cursor.editorX - frame.x) / frame.width;
      const relativeY = (cursor.editorY - frame.y) / frame.height;
      const isInside =
        relativeX >= 0 && relativeX <= 1 && relativeY >= 0 && relativeY <= 1;

      if (!isInside) {
        return;
      }

      context.fillStyle = cursor.color;
      context.beginPath();
      context.arc(
        slideRect.x + relativeX * slideRect.width,
        slideRect.y + relativeY * slideRect.height,
        12,
        0,
        Math.PI * 2,
      );
      context.fill();
    },
    dispose() {
      whiteboard = null;
      camera = null;
      cursor = null;
      laserTrails = [];
      activeLaserTrail = null;
    },
  };
}
