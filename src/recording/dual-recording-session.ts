import type { MediaRecorderStartOptions } from "./media-recorder-engine";

export interface RecordingTask {
  start(options: MediaRecorderStartOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<Blob>;
  abort(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface DualRecordingResult {
  readonly composite: Blob;
  readonly whiteboard: Blob | null;
  readonly camera: Blob | null;
  readonly audio: Blob | null;
  readonly whiteboardError: Error | null;
  readonly cameraError: Error | null;
  readonly audioError: Error | null;
}

export class DualRecordingSession {
  public constructor(
    private readonly compositeTask: RecordingTask,
    private readonly whiteboardTask: RecordingTask,
    private readonly cameraTask: RecordingTask | null,
    private readonly audioTask: RecordingTask | null,
  ) {}

  public async start(
    compositeOptions: MediaRecorderStartOptions,
    whiteboardOptions: MediaRecorderStartOptions,
    cameraOptions: MediaRecorderStartOptions | null,
    audioOptions: MediaRecorderStartOptions | null,
  ): Promise<void> {
    if (this.cameraTask && !cameraOptions) {
      throw new Error("Camera recording options are required");
    }
    try {
      await Promise.all([
        this.compositeTask.start(compositeOptions),
        this.whiteboardTask.start(whiteboardOptions),
        ...(this.cameraTask && cameraOptions
          ? [this.cameraTask.start(cameraOptions)]
          : []),
        ...(this.audioTask && audioOptions
          ? [this.audioTask.start(audioOptions)]
          : []),
      ]);
    } catch (error) {
      await this.abort();
      throw error;
    }
  }

  public async pause(): Promise<void> {
    await Promise.all([
      this.compositeTask.pause(),
      this.whiteboardTask.pause(),
      ...(this.cameraTask ? [this.cameraTask.pause()] : []),
      ...(this.audioTask ? [this.audioTask.pause()] : []),
    ]);
  }

  public async resume(): Promise<void> {
    await Promise.all([
      this.compositeTask.resume(),
      this.whiteboardTask.resume(),
      ...(this.cameraTask ? [this.cameraTask.resume()] : []),
      ...(this.audioTask ? [this.audioTask.resume()] : []),
    ]);
  }

  public async stop(): Promise<DualRecordingResult> {
    const [compositeResult, whiteboardResult, cameraResult, audioResult] =
      await Promise.all([
        settle(this.compositeTask),
        settle(this.whiteboardTask),
        this.cameraTask ? settle(this.cameraTask) : Promise.resolve(null),
        this.audioTask ? settle(this.audioTask) : Promise.resolve(null),
      ]);

    if (compositeResult.status === "rejected") {
      await Promise.allSettled([
        this.whiteboardTask.abort(),
        this.cameraTask?.abort(),
        this.audioTask?.abort(),
      ]);
      throw compositeResult.reason;
    }

    return {
      composite: compositeResult.value,
      whiteboard:
        whiteboardResult.status === "fulfilled" ? whiteboardResult.value : null,
      camera: cameraResult?.status === "fulfilled" ? cameraResult.value : null,
      audio: audioResult?.status === "fulfilled" ? audioResult.value : null,
      whiteboardError:
        whiteboardResult.status === "rejected" ? whiteboardResult.reason : null,
      cameraError:
        cameraResult?.status === "rejected" ? cameraResult.reason : null,
      audioError: audioResult?.status === "rejected" ? audioResult.reason : null,
    };
  }

  public async abort(): Promise<void> {
    await Promise.allSettled([
      this.compositeTask.abort(),
      this.whiteboardTask.abort(),
      ...(this.cameraTask ? [this.cameraTask.abort()] : []),
      ...(this.audioTask ? [this.audioTask.abort()] : []),
    ]);
  }

  public async cleanup(): Promise<void> {
    await Promise.all([
      this.compositeTask.cleanup(),
      this.whiteboardTask.cleanup(),
      ...(this.cameraTask ? [this.cameraTask.cleanup()] : []),
      ...(this.audioTask ? [this.audioTask.cleanup()] : []),
    ]);
  }
}

function settle(task: RecordingTask) {
  return task.stop().then(
    (blob) => ({ status: "fulfilled" as const, value: blob }),
    (error: unknown) => ({
      status: "rejected" as const,
      reason: toError(error),
    }),
  );
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
