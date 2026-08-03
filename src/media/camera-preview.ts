export interface CameraPreviewElement {
  srcObject: MediaProvider | null;
  readonly readyState: number;
  readonly videoWidth: number;
  readonly videoHeight: number;
  addEventListener(
    type: "loadedmetadata" | "canplay",
    listener: EventListener,
  ): void;
  removeEventListener(
    type: "loadedmetadata" | "canplay",
    listener: EventListener,
  ): void;
  play(): Promise<void>;
}

export interface CameraPreviewOptions {
  readonly onReady?: () => void;
  readonly playTimeoutMs?: number;
}

export const CAMERA_PREVIEW_WAITING_WARNING =
  "摄像头已连接，正在等待设备送出画面";

function isInterruptedPlayback(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function hasFrame(video: CameraPreviewElement) {
  return (
    video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0
  );
}

async function playCamera(video: CameraPreviewElement) {
  try {
    await video.play();
    return true;
  } catch (error) {
    if (!isInterruptedPlayback(error)) {
      return false;
    }
    try {
      await Promise.resolve();
      await video.play();
      return true;
    } catch {
      return false;
    }
  }
}

async function playCameraWithin(
  video: CameraPreviewElement,
  timeoutMs: number,
): Promise<"playing" | "failed" | "pending"> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      resolve("pending");
    }, timeoutMs);
    void playCamera(video).then((playing) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve(playing ? "playing" : "failed");
    });
  });
}

export async function attachCameraPreview(
  video: CameraPreviewElement,
  stream: MediaStream,
  options: CameraPreviewOptions = {},
): Promise<string | null> {
  if (video.srcObject !== stream) {
    video.srcObject = stream;
  }
  const track = stream.getVideoTracks()[0];
  const playTimeoutMs = options.playTimeoutMs ?? 250;
  const canObserveTrack =
    typeof track?.addEventListener === "function" &&
    typeof track?.removeEventListener === "function";
  const waitForFrames = () => {
    let ready = false;
    let recovering = false;
    const recover = async () => {
      if (ready || recovering) {
        return;
      }
      recovering = true;
      const playback = await playCameraWithin(video, playTimeoutMs);
      recovering = false;
      if (playback === "failed" || !hasFrame(video)) {
        return;
      }
      ready = true;
      video.removeEventListener("loadedmetadata", recover);
      video.removeEventListener("canplay", recover);
      if (canObserveTrack) {
        track.removeEventListener("unmute", recover);
      }
      options.onReady?.();
    };
    video.addEventListener("loadedmetadata", recover);
    video.addEventListener("canplay", recover);
    if (canObserveTrack) {
      track.addEventListener("unmute", recover);
    }
    return CAMERA_PREVIEW_WAITING_WARNING;
  };

  if (track?.muted) {
    void playCamera(video);
    return waitForFrames();
  }
  const playback = await playCameraWithin(video, playTimeoutMs);
  if (playback === "failed") {
    return "摄像头已连接，但实时预览暂时不可用";
  }
  if (playback === "playing" && hasFrame(video)) {
    return null;
  }
  return waitForFrames();
}
