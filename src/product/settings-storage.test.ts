import { DEFAULT_SETTINGS } from "./output-presets";
import {
  SETTINGS_STORAGE_KEY,
  loadProductSettings,
  saveProductSettings,
  takeLegacyTeleprompterText,
} from "./settings-storage";

function createStorage(initial: string | null = null) {
  const values = new Map<string, string>();
  if (initial !== null) {
    values.set(SETTINGS_STORAGE_KEY, initial);
  }
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    value: () => values.get(SETTINGS_STORAGE_KEY) ?? null,
  };
}

describe("product settings storage", () => {
  it("returns defaults when storage is empty or malformed", () => {
    expect(loadProductSettings(createStorage())).toEqual(DEFAULT_SETTINGS);
    expect(loadProductSettings(createStorage("{broken"))).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it("keeps valid fields and repairs invalid fields individually", () => {
    const storage = createStorage(
      JSON.stringify({
        outputPreset: "16:9",
        customWidth: 20,
        customHeight: 1080,
        canvas: { padding: 48, slideRadius: -1 },
        camera: { enabled: false, mirrored: false, shape: "triangle" },
        teleprompter: { text: "讲稿", speed: 99, opacity: 0.7 },
      }),
    );

    const settings = loadProductSettings(storage);

    expect(settings.theme).toBe("light");
    expect(settings.outputPreset).toBe("16:9");
    expect(settings.customWidth).toBe(DEFAULT_SETTINGS.customWidth);
    expect(settings.customHeight).toBe(1080);
    expect(settings.canvas.padding).toBe(48);
    expect(settings.canvas.slideRadius).toBe(
      DEFAULT_SETTINGS.canvas.slideRadius,
    );
    expect(settings.camera.enabled).toBe(false);
    expect(settings.camera.mirrored).toBe(false);
    expect(settings.camera.shape).toBe(DEFAULT_SETTINGS.camera.shape);
    expect(settings.teleprompter.text).toBe("");
    expect(settings.teleprompter.speed).toBe(
      DEFAULT_SETTINGS.teleprompter.speed,
    );
    expect(settings.teleprompter.opacity).toBe(0.7);
  });

  it("enables camera mirroring when loading settings saved before the option existed", () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      camera: {
        enabled: true,
        deviceId: "",
        shape: "circle",
        size: "medium",
      },
    };

    expect(
      loadProductSettings(createStorage(JSON.stringify(legacy))).camera
        .mirrored,
    ).toBe(true);
  });

  it("loads teleprompter range boundaries and defaults legacy settings", () => {
    const atBoundaries = {
      ...DEFAULT_SETTINGS,
      teleprompter: {
        ...DEFAULT_SETTINGS.teleprompter,
        fontSize: 8,
        speed: 20,
      },
    };
    const aboveBoundaries = {
      ...DEFAULT_SETTINGS,
      teleprompter: {
        ...DEFAULT_SETTINGS.teleprompter,
        fontSize: 41,
        speed: 21,
      },
    };
    const legacy = {
      ...DEFAULT_SETTINGS,
      teleprompter: {
        text: "旧讲稿",
        speed: 8,
        opacity: 0.88,
        width: 420,
        height: 260,
      },
    };

    expect(
      loadProductSettings(createStorage(JSON.stringify(atBoundaries)))
        .teleprompter.fontSize,
    ).toBe(8);
    expect(
      loadProductSettings(createStorage(JSON.stringify(atBoundaries)))
        .teleprompter.speed,
    ).toBe(20);
    expect(
      loadProductSettings(createStorage(JSON.stringify(aboveBoundaries)))
        .teleprompter,
    ).toMatchObject({
      fontSize: DEFAULT_SETTINGS.teleprompter.fontSize,
      speed: DEFAULT_SETTINGS.teleprompter.speed,
    });
    expect(
      loadProductSettings(createStorage(JSON.stringify(legacy))).teleprompter
        .fontSize,
    ).toBe(DEFAULT_SETTINGS.teleprompter.fontSize);
    expect(
      loadProductSettings(createStorage(JSON.stringify(legacy))).teleprompter
        .text,
    ).toBe("");
  });

  it("migrates legacy camera sizes and repairs invalid camera placement", () => {
    const legacy = {
      ...DEFAULT_SETTINGS,
      camera: {
        ...DEFAULT_SETTINGS.camera,
        size: "large",
        positionX: -1,
        positionY: 2,
      },
    };

    expect(
      loadProductSettings(createStorage(JSON.stringify(legacy))).camera,
    ).toEqual({
      ...DEFAULT_SETTINGS.camera,
      size: 360,
    });
  });

  it("round-trips the complete settings object", () => {
    const storage = createStorage();
    const settings = {
      ...DEFAULT_SETTINGS,
      theme: "dark" as const,
      outputPreset: "1:1" as const,
      camera: { ...DEFAULT_SETTINGS.camera, enabled: false },
      cursor: { ...DEFAULT_SETTINGS.cursor, color: "#2563eb" },
    };

    saveProductSettings(storage, settings);

    expect(JSON.parse(storage.value() ?? "")).toEqual(settings);
    expect(loadProductSettings(storage)).toEqual(settings);
  });

  it("never persists document-specific teleprompter text globally", () => {
    const storage = createStorage();

    saveProductSettings(storage, {
      ...DEFAULT_SETTINGS,
      teleprompter: {
        ...DEFAULT_SETTINGS.teleprompter,
        text: "只属于当前文件的讲稿",
      },
    });

    expect(
      JSON.parse(storage.value() ?? "{}").teleprompter.text,
    ).toBe("");
  });

  it("moves legacy shared text out of global settings exactly once", () => {
    const storage = createStorage(
      JSON.stringify({
        ...DEFAULT_SETTINGS,
        teleprompter: {
          ...DEFAULT_SETTINGS.teleprompter,
          text: "升级前的共享讲稿",
        },
      }),
    );

    expect(takeLegacyTeleprompterText(storage)).toBe("升级前的共享讲稿");
    expect(takeLegacyTeleprompterText(storage)).toBe("");
  });
});
