import {
  DEFAULT_SETTINGS,
  resolveOutputProfile,
  validateCustomOutput,
} from "./output-presets";

describe("product output presets", () => {
  it("resolves the publication presets to exact target pixels", () => {
    expect(
      resolveOutputProfile({ ...DEFAULT_SETTINGS, outputPreset: "16:9" }),
    ).toEqual({ width: 1920, height: 1080, fps: 30 });
    expect(
      resolveOutputProfile({ ...DEFAULT_SETTINGS, outputPreset: "3:4" }),
    ).toEqual({ width: 1080, height: 1440, fps: 30 });
    expect(
      resolveOutputProfile({ ...DEFAULT_SETTINGS, outputPreset: "9:16" }),
    ).toEqual({ width: 1080, height: 1920, fps: 30 });
  });

  it("uses validated custom dimensions without silently changing them", () => {
    const settings = {
      ...DEFAULT_SETTINGS,
      outputPreset: "custom" as const,
      customWidth: 2560,
      customHeight: 1440,
    };

    expect(resolveOutputProfile(settings)).toEqual({
      width: 2560,
      height: 1440,
      fps: 30,
    });
    expect(validateCustomOutput(2560, 1440)).toEqual([]);
  });

  it("reports every invalid custom dimension in pixels", () => {
    expect(validateCustomOutput(639, 2161)).toEqual([
      "输出宽度必须在 640–3840 px 之间",
      "输出高度必须在 480–2160 px 之间",
    ]);
  });
});
