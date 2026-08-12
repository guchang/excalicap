import type { OutputProfile } from "../rendering/output-profile";
import type { OutputPresetId, ProductSettings } from "./types";

export const OUTPUT_PRESETS: Readonly<
  Record<Exclude<OutputPresetId, "custom">, OutputProfile>
> = {
  "16:9": { width: 1920, height: 1080, fps: 30 },
  "4:3": { width: 1440, height: 1080, fps: 30 },
  "3:4": { width: 1080, height: 1440, fps: 30 },
  "9:16": { width: 1080, height: 1920, fps: 30 },
  "1:1": { width: 1080, height: 1080, fps: 30 },
  portraitHigh: { width: 1620, height: 2160, fps: 30 },
};

export const DEFAULT_SETTINGS: ProductSettings = {
  theme: "light",
  outputPreset: "3:4",
  customWidth: 1920,
  customHeight: 1080,
  canvas: {
    background: "#f4f1ea",
    padding: 24,
    slideRadius: 18,
  },
  camera: {
    enabled: true,
    deviceId: "",
    mirrored: true,
    shape: "circle",
    size: 280,
    positionX: 5 / 6,
    positionY: 7 / 8,
  },
  microphone: {
    enabled: true,
    deviceId: "",
  },
  cursor: {
    enabled: true,
    color: "#ef4444",
  },
  teleprompter: {
    text: "",
    fontSize: 22,
    speed: 8,
    opacity: 0.88,
    width: 420,
    height: 260,
  },
};

export function validateCustomOutput(width: number, height: number): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(width) || width < 640 || width > 3840) {
    errors.push("输出宽度必须在 640–3840 px 之间");
  }
  if (!Number.isInteger(height) || height < 480 || height > 2160) {
    errors.push("输出高度必须在 480–2160 px 之间");
  }
  return errors;
}

export function resolveOutputProfile(
  settings: ProductSettings,
): OutputProfile {
  if (settings.outputPreset !== "custom") {
    return OUTPUT_PRESETS[settings.outputPreset];
  }
  const errors = validateCustomOutput(
    settings.customWidth,
    settings.customHeight,
  );
  if (errors.length > 0) {
    throw new Error(errors.join("；"));
  }
  return {
    width: settings.customWidth,
    height: settings.customHeight,
    fps: 30,
  };
}
