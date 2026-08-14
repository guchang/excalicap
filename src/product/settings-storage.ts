import {
  DEFAULT_SETTINGS,
  validateCustomOutput,
} from "./output-presets";
import type {
  CameraSettings,
  ProductSettings,
  TeleprompterSettings,
} from "./types";

export const SETTINGS_STORAGE_KEY = "excalicap:settings:v1";

export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const outputPresets = new Set([
  "16:9",
  "4:3",
  "3:4",
  "9:16",
  "1:1",
  "portraitHigh",
  "custom",
]);
const backgrounds = new Set([
  "#f4f1ea",
  "#ffffff",
  "#111827",
  "linear-gradient(135deg, #fde68a, #fca5a5)",
  "linear-gradient(135deg, #bfdbfe, #ddd6fe)",
  "linear-gradient(135deg, #bbf7d0, #bae6fd)",
]);
const cursorColors = new Set(["#ef4444", "#f59e0b", "#2563eb", "#111827"]);

function finiteInRange(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  return typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : fallback;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === "string" ? value : fallback;
}

export function loadProductSettings(
  storage: SettingsStorage,
): ProductSettings {
  const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!serialized) {
    return DEFAULT_SETTINGS;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = objectValue(JSON.parse(serialized));
  } catch {
    return DEFAULT_SETTINGS;
  }

  const canvas = objectValue(parsed.canvas);
  const camera = objectValue(parsed.camera);
  const microphone = objectValue(parsed.microphone);
  const cursor = objectValue(parsed.cursor);
  const teleprompter = objectValue(parsed.teleprompter);
  const customWidth = finiteInRange(
    parsed.customWidth,
    640,
    3840,
    DEFAULT_SETTINGS.customWidth,
  );
  const customHeight = finiteInRange(
    parsed.customHeight,
    480,
    2160,
    DEFAULT_SETTINGS.customHeight,
  );
  const outputPreset = outputPresets.has(String(parsed.outputPreset))
    ? (parsed.outputPreset as ProductSettings["outputPreset"])
    : DEFAULT_SETTINGS.outputPreset;
  const background = stringValue(
    canvas.background,
    DEFAULT_SETTINGS.canvas.background,
  );
  const cameraShape = camera.shape;
  const legacyCameraSizes: Readonly<Record<string, number>> = {
    small: 210,
    medium: 280,
    large: 360,
  };
  const cameraSize =
    typeof camera.size === "string"
      ? legacyCameraSizes[camera.size]
      : camera.size;
  const teleprompterSettings: TeleprompterSettings = {
    text: DEFAULT_SETTINGS.teleprompter.text,
    fontSize: finiteInRange(
      teleprompter.fontSize,
      8,
      40,
      DEFAULT_SETTINGS.teleprompter.fontSize,
    ),
    speed: finiteInRange(
      teleprompter.speed,
      1,
      20,
      DEFAULT_SETTINGS.teleprompter.speed,
    ),
    opacity: finiteInRange(
      teleprompter.opacity,
      0.4,
      1,
      DEFAULT_SETTINGS.teleprompter.opacity,
    ),
    width: finiteInRange(
      teleprompter.width,
      300,
      800,
      DEFAULT_SETTINGS.teleprompter.width,
    ),
    height: finiteInRange(
      teleprompter.height,
      180,
      600,
      DEFAULT_SETTINGS.teleprompter.height,
    ),
  };
  const cameraSettings: CameraSettings = {
    enabled: booleanValue(camera.enabled, DEFAULT_SETTINGS.camera.enabled),
    deviceId: stringValue(camera.deviceId, DEFAULT_SETTINGS.camera.deviceId),
    mirrored: booleanValue(
      camera.mirrored,
      DEFAULT_SETTINGS.camera.mirrored,
    ),
    shape:
      cameraShape === "circle" || cameraShape === "rounded"
        ? cameraShape
        : DEFAULT_SETTINGS.camera.shape,
    size: finiteInRange(
      cameraSize,
      160,
      480,
      DEFAULT_SETTINGS.camera.size,
    ),
    positionX: finiteInRange(
      camera.positionX,
      0,
      1,
      DEFAULT_SETTINGS.camera.positionX,
    ),
    positionY: finiteInRange(
      camera.positionY,
      0,
      1,
      DEFAULT_SETTINGS.camera.positionY,
    ),
  };

  return {
    theme: parsed.theme === "dark" ? "dark" : DEFAULT_SETTINGS.theme,
    outputPreset,
    customWidth:
      validateCustomOutput(customWidth, customHeight).some((error) =>
        error.includes("宽度"),
      )
        ? DEFAULT_SETTINGS.customWidth
        : customWidth,
    customHeight:
      validateCustomOutput(customWidth, customHeight).some((error) =>
        error.includes("高度"),
      )
        ? DEFAULT_SETTINGS.customHeight
        : customHeight,
    canvas: {
      background: backgrounds.has(background)
        ? background
        : DEFAULT_SETTINGS.canvas.background,
      padding: finiteInRange(
        canvas.padding,
        0,
        96,
        DEFAULT_SETTINGS.canvas.padding,
      ),
      slideRadius: finiteInRange(
        canvas.slideRadius,
        0,
        48,
        DEFAULT_SETTINGS.canvas.slideRadius,
      ),
    },
    camera: cameraSettings,
    microphone: {
      enabled: booleanValue(
        microphone.enabled,
        DEFAULT_SETTINGS.microphone.enabled,
      ),
      deviceId: stringValue(
        microphone.deviceId,
        DEFAULT_SETTINGS.microphone.deviceId,
      ),
    },
    cursor: {
      enabled: booleanValue(cursor.enabled, DEFAULT_SETTINGS.cursor.enabled),
      color: cursorColors.has(String(cursor.color))
        ? String(cursor.color)
        : DEFAULT_SETTINGS.cursor.color,
    },
    teleprompter: teleprompterSettings,
  };
}

export function takeLegacyTeleprompterText(storage: SettingsStorage) {
  const serialized = storage.getItem(SETTINGS_STORAGE_KEY);
  if (!serialized) {
    return "";
  }
  try {
    const parsed = objectValue(JSON.parse(serialized));
    const teleprompter = objectValue(parsed.teleprompter);
    const text = stringValue(teleprompter.text, "");
    if (!text) {
      return "";
    }
    storage.setItem(
      SETTINGS_STORAGE_KEY,
      JSON.stringify({
        ...parsed,
        teleprompter: { ...teleprompter, text: "" },
      }),
    );
    return text;
  } catch {
    return "";
  }
}

export function saveProductSettings(
  storage: SettingsStorage,
  settings: ProductSettings,
) {
  storage.setItem(
    SETTINGS_STORAGE_KEY,
    JSON.stringify({
      ...settings,
      teleprompter: {
        ...settings.teleprompter,
        text: DEFAULT_SETTINGS.teleprompter.text,
      },
    }),
  );
}
