import {
  OUTPUT_PROFILES,
  getFrameRenderDimensions,
} from "./output-profile";

describe("getFrameRenderDimensions", () => {
  it("returns exact high-resolution pixels and scale for a matching 3:4 frame", () => {
    expect(
      getFrameRenderDimensions(
        { width: 1080, height: 1440 },
        OUTPUT_PROFILES.portraitHigh,
      ),
    ).toEqual({
      width: 1620,
      height: 2160,
      scale: 1.5,
    });
  });

  it("returns scale one for the standard portrait profile", () => {
    expect(
      getFrameRenderDimensions(
        { width: 1080, height: 1440 },
        OUTPUT_PROFILES.portraitStandard,
      ),
    ).toEqual({
      width: 1080,
      height: 1440,
      scale: 1,
    });
  });

  it("rejects a mismatched frame ratio instead of stretching it", () => {
    expect(() =>
      getFrameRenderDimensions(
        { width: 1920, height: 1080 },
        OUTPUT_PROFILES.portraitHigh,
      ),
    ).toThrow("Frame ratio");
  });
});
