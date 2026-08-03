import type { MediaRecorderStartOptions } from "./media-recorder-engine";

export interface RecordingTask {
  start(options: MediaRecorderStartOptions): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  stop(): Promise<Blob>;
  abort(): Promise<void>;
}

export interface DualRecordingResult {
  readonly composite: Blob;
  readonly camera: Blob | null;
  readonly cameraError: Error | null;
}

export class DualRecordingSession {
  public constructor(
    private readonly compositeTask: RecordingTask,
    private readonly cameraTask: RecordingTask | null,
  ) {}

  public async start(
    compositeOptions: MediaRecorderStartOptions,
    cameraOptions: MediaRecorderStartOptions | null,
  ): Promise<void> {
    if (this.cameraTask && !cameraOptions) {
      throw new Error("Camera recording options are required");
    }
    try {
      await Promise.all([
        this.compositeTask.start(compositeOptions),
        ...(this.cameraTask && cameraOptions
          ? [this.cameraTask.start(cameraOptions)]
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
      ...(this.cameraTask ? [this.cameraTask.pause()] : []),
    ]);
  }

  public async resume(): Promise<void> {
    await Promise.all([
      this.compositeTask.resume(),
      ...(this.cameraTask ? [this.cameraTask.resume()] : []),
    ]);
  }

  public async stop(): Promise<DualRecordingResult> {
    const [compositeResult, cameraResult] = await Promise.all([
      this.compositeTask.stop().then(
        (blob) => ({ status: "fulfilled" as const, value: blob }),
        (error: unknown) => ({
          status: "rejected" as const,
          reason: toError(error),
        }),
      ),
      this.cameraTask
        ? this.cameraTask.stop().then(
            (blob) => ({ status: "fulfilled" as const, value: blob }),
            (error: unknown) => ({
              status: "rejected" as const,
              reason: toError(error),
            }),
          )
        : Promise.resolve(null),
    ]);

    if (compositeResult.status === "rejected") {
      await this.cameraTask?.abort().catch(() => undefined);
      throw compositeResult.reason;
    }

    if (cameraResult?.status === "rejected") {
      await this.cameraTask?.abort().catch(() => undefined);
      return {
        composite: compositeResult.value,
        camera: null,
        cameraError: cameraResult.reason,
      };
    }

    return {
      composite: compositeResult.value,
      camera: cameraResult?.value ?? null,
      cameraError: null,
    };
  }

  public async abort(): Promise<void> {
    await Promise.allSettled([
      this.compositeTask.abort(),
      ...(this.cameraTask ? [this.cameraTask.abort()] : []),
    ]);
  }
}

function toError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
