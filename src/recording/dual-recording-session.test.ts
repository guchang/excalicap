import { vi } from "vitest";
import {
  DualRecordingSession,
  type RecordingTask,
} from "./dual-recording-session";
import type { MediaRecorderStartOptions } from "./media-recorder-engine";

function createTask(
  stopResult: Blob | Error = new Blob(["video"]),
): RecordingTask & {
  start: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  resume: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
} {
  return {
    start: vi.fn(async () => undefined),
    pause: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    stop: vi.fn(async () => {
      if (stopResult instanceof Error) {
        throw stopResult;
      }
      return stopResult;
    }),
    abort: vi.fn(async () => undefined),
    cleanup: vi.fn(async () => undefined),
  };
}

const compositeOptions = {
  videoStream: {
    getVideoTracks: () => [],
    getAudioTracks: () => [],
  },
  microphoneStream: null,
  recorder: { mimeType: "video/webm" },
} satisfies MediaRecorderStartOptions;

const cameraOptions = {
  ...compositeOptions,
  recorder: { mimeType: "video/webm", videoBitsPerSecond: 8_000_000 },
} satisfies MediaRecorderStartOptions;

describe("DualRecordingSession", () => {
  it("controls only the composite task when no camera task exists", async () => {
    const composite = createTask(new Blob(["composite"]));
    const whiteboard = createTask(new Blob(["whiteboard"]));
    const session = new DualRecordingSession(composite, whiteboard, null, null);

    await session.start(compositeOptions, compositeOptions, null, null);
    await session.pause();
    await session.resume();
    const result = await session.stop();

    expect(composite.start).toHaveBeenCalledWith(compositeOptions);
    expect(composite.pause).toHaveBeenCalledOnce();
    expect(composite.resume).toHaveBeenCalledOnce();
    expect(await result.composite.text()).toBe("composite");
    expect(await result.whiteboard?.text()).toBe("whiteboard");
    expect(result.camera).toBeNull();
    expect(result.cameraError).toBeNull();
  });

  it("starts and transports both recording tasks together", async () => {
    const composite = createTask(new Blob(["composite"]));
    const camera = createTask(new Blob(["camera"]));
    const whiteboard = createTask(new Blob(["whiteboard"]));
    const audio = createTask(new Blob(["audio"]));
    const session = new DualRecordingSession(composite, whiteboard, camera, audio);

    await session.start(
      compositeOptions,
      compositeOptions,
      cameraOptions,
      compositeOptions,
    );
    await session.pause();
    await session.resume();
    const result = await session.stop();

    expect(composite.start).toHaveBeenCalledWith(compositeOptions);
    expect(camera.start).toHaveBeenCalledWith(cameraOptions);
    expect(whiteboard.start).toHaveBeenCalledWith(compositeOptions);
    expect(audio.start).toHaveBeenCalledWith(compositeOptions);
    expect(composite.pause).toHaveBeenCalledOnce();
    expect(camera.pause).toHaveBeenCalledOnce();
    expect(composite.resume).toHaveBeenCalledOnce();
    expect(camera.resume).toHaveBeenCalledOnce();
    expect(await result.composite.text()).toBe("composite");
    expect(await result.camera?.text()).toBe("camera");
    expect(await result.audio?.text()).toBe("audio");
    expect(result.cameraError).toBeNull();
  });

  it("keeps the composite result when the camera task fails", async () => {
    const composite = createTask(new Blob(["composite"]));
    const cameraError = new Error("摄像头编码失败");
    const camera = createTask(cameraError);
    const whiteboard = createTask(new Blob(["whiteboard"]));
    const session = new DualRecordingSession(composite, whiteboard, camera, null);

    await session.start(compositeOptions, compositeOptions, cameraOptions, null);
    const result = await session.stop();

    expect(await result.composite.text()).toBe("composite");
    expect(result.camera).toBeNull();
    expect(result.cameraError).toBe(cameraError);
  });

  it("fails the recording and discards the camera task when composite fails", async () => {
    const compositeError = new Error("合成录制失败");
    const composite = createTask(compositeError);
    const camera = createTask(new Blob(["camera"]));
    const whiteboard = createTask(new Blob(["whiteboard"]));
    const session = new DualRecordingSession(composite, whiteboard, camera, null);

    await session.start(compositeOptions, compositeOptions, cameraOptions, null);

    await expect(session.stop()).rejects.toThrow("合成录制失败");
    expect(camera.abort).toHaveBeenCalledOnce();
  });

  it("cleans up retained temporary data only when explicitly requested", async () => {
    const composite = createTask(new Blob(["composite"]));
    const camera = createTask(new Blob(["camera"]));
    const whiteboard = createTask(new Blob(["whiteboard"]));
    const session = new DualRecordingSession(composite, whiteboard, camera, null);

    await session.start(compositeOptions, compositeOptions, cameraOptions, null);
    await session.stop();

    expect(composite.cleanup).not.toHaveBeenCalled();
    expect(whiteboard.cleanup).not.toHaveBeenCalled();
    expect(camera.cleanup).not.toHaveBeenCalled();

    await session.cleanup();
    expect(composite.cleanup).toHaveBeenCalledOnce();
    expect(whiteboard.cleanup).toHaveBeenCalledOnce();
    expect(camera.cleanup).toHaveBeenCalledOnce();
  });

  it("reports a retained temporary-data cleanup failure", async () => {
    const cleanupError = new Error("无法删除临时文件");
    const composite = createTask();
    composite.cleanup.mockRejectedValue(cleanupError);
    const whiteboard = createTask();
    const session = new DualRecordingSession(composite, whiteboard, null, null);

    await expect(session.cleanup()).rejects.toBe(cleanupError);
  });
});
