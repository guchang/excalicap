export type OutputPresetId =
  | "16:9"
  | "4:3"
  | "3:4"
  | "9:16"
  | "1:1"
  | "portraitHigh"
  | "custom";

export interface CanvasSettings {
  readonly background: string;
  readonly padding: number;
  readonly slideRadius: number;
}

export interface CameraSettings {
  readonly enabled: boolean;
  readonly deviceId: string;
  readonly mirrored: boolean;
  readonly shape: "circle" | "rounded";
  readonly size: number;
  readonly positionX: number;
  readonly positionY: number;
}

export interface MicrophoneSettings {
  readonly enabled: boolean;
  readonly deviceId: string;
}

export interface CursorSettings {
  readonly enabled: boolean;
  readonly color: string;
}

export interface TeleprompterSettings {
  readonly text: string;
  readonly fontSize: number;
  readonly speed: number;
  readonly opacity: number;
  readonly width: number;
  readonly height: number;
}

export interface ProductSettings {
  readonly theme: "light" | "dark";
  readonly outputPreset: OutputPresetId;
  readonly customWidth: number;
  readonly customHeight: number;
  readonly canvas: CanvasSettings;
  readonly camera: CameraSettings;
  readonly microphone: MicrophoneSettings;
  readonly cursor: CursorSettings;
  readonly teleprompter: TeleprompterSettings;
}
