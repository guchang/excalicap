import type { OutputProfile } from "../rendering/output-profile";

export interface RecordingOptions extends OutputProfile {
  readonly videoBitsPerSecond: number;
  readonly audioBitsPerSecond: number;
}

export interface RecorderCapability {
  readonly supported: boolean;
  readonly mimeType: string | null;
  readonly smooth: boolean | null;
  readonly powerEfficient: boolean | null;
  readonly options: RecordingOptions;
}

export interface RecordingDiagnostics {
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
  readonly fps: number;
  readonly videoBitsPerSecond: number;
  readonly audioBitsPerSecond: number;
  readonly temporaryBytes: number;
}
