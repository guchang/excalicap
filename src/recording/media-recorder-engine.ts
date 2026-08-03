import type { ChunkSink } from "./chunk-sink";

export interface MediaTrackLike {
  readonly kind: "video" | "audio";
  stop(): void;
}

export interface MediaStreamLike {
  getVideoTracks(): readonly MediaTrackLike[];
  getAudioTracks(): readonly MediaTrackLike[];
}

export interface MediaRecorderLike {
  state: RecordingState;
  readonly mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  onerror: ((event: { error: Error }) => void) | null;
  start(timeslice: number): void;
  pause(): void;
  resume(): void;
  stop(): void;
}

export type MediaRecorderEngineState =
  | "idle"
  | "recording"
  | "paused"
  | "stopping"
  | "completed"
  | "failed";

export interface MediaRecorderEngineDependencies {
  readonly sink: ChunkSink;
  createMediaStream(tracks: readonly MediaTrackLike[]): MediaStreamLike;
  createRecorder(
    stream: MediaStreamLike,
    options: MediaRecorderOptions,
  ): MediaRecorderLike;
}

export interface MediaRecorderStartOptions {
  readonly videoStream: MediaStreamLike;
  readonly microphoneStream: MediaStreamLike | null;
  readonly recorder: MediaRecorderOptions & { mimeType: string };
}

export class MediaRecorderEngine {
  private currentState: MediaRecorderEngineState = "idle";
  private recorder: MediaRecorderLike | null = null;
  private stopPromise: Promise<void> | null = null;
  private resolveStop: (() => void) | null = null;
  private rejectStop: ((error: Error) => void) | null = null;
  private writeError: Error | null = null;
  private cleanedUp = false;

  public constructor(
    private readonly dependencies: MediaRecorderEngineDependencies,
  ) {}

  public get state(): MediaRecorderEngineState {
    return this.currentState;
  }

  public async start(options: MediaRecorderStartOptions): Promise<void> {
    if (this.currentState !== "idle") {
      throw new Error(`Cannot start while recorder is ${this.currentState}`);
    }

    const video = options.videoStream.getVideoTracks()[0];
    if (!video) {
      throw new Error("Video stream has no video track");
    }
    const microphoneAudio = options.microphoneStream?.getAudioTracks()[0];
    const tracks = microphoneAudio ? [video, microphoneAudio] : [video];

    const stream = this.dependencies.createMediaStream(tracks);
    this.recorder = this.dependencies.createRecorder(stream, options.recorder);
    this.stopPromise = new Promise<void>((resolve, reject) => {
      this.resolveStop = resolve;
      this.rejectStop = reject;
    });
    this.recorder.ondataavailable = ({ data }) => {
      if (data.size === 0) {
        return;
      }
      void this.dependencies.sink.write(data).catch((error: unknown) => {
        this.writeError =
          error instanceof Error ? error : new Error(String(error));
        this.currentState = "failed";
      });
    };
    this.recorder.onstop = () => {
      this.resolveStop?.();
    };
    this.recorder.onerror = ({ error }) => {
      this.currentState = "failed";
      this.rejectStop?.(error);
    };

    this.recorder.start(1000);
    this.currentState = "recording";
  }

  public async pause(): Promise<void> {
    if (this.currentState !== "recording" || !this.recorder) {
      throw new Error(`Cannot pause while recorder is ${this.currentState}`);
    }
    this.recorder.pause();
    this.currentState = "paused";
  }

  public async resume(): Promise<void> {
    if (this.currentState !== "paused" || !this.recorder) {
      throw new Error(`Cannot resume while recorder is ${this.currentState}`);
    }
    this.recorder.resume();
    this.currentState = "recording";
  }

  public async stop(): Promise<Blob> {
    if (
      (this.currentState !== "recording" &&
        this.currentState !== "paused") ||
      !this.recorder ||
      !this.stopPromise
    ) {
      throw new Error(`Cannot stop while recorder is ${this.currentState}`);
    }

    this.currentState = "stopping";
    this.recorder.stop();
    await this.stopPromise;

    if (this.writeError) {
      this.currentState = "failed";
      throw this.writeError;
    }

    const result = await this.dependencies.sink.finish(
      this.recorder.mimeType || "application/octet-stream",
    );
    this.currentState = "completed";
    return result;
  }

  public async cleanup(): Promise<void> {
    if (this.cleanedUp) {
      return;
    }
    await this.dependencies.sink.abort();
    this.cleanedUp = true;
  }

  public async abort(): Promise<void> {
    if (this.recorder && this.recorder.state !== "inactive") {
      this.recorder.stop();
    }
    await this.cleanup();
    this.currentState = "failed";
  }
}
