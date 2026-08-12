import type { RecordingOptions } from "./types";
import {
  selectAudioRecorderMimeType,
  selectRecorderCapability,
} from "./capabilities";

describe("selectAudioRecorderMimeType", () => {
  it("selects the first supported audio-only container", () => {
    expect(
      selectAudioRecorderMimeType((mimeType) => mimeType === "audio/webm"),
    ).toBe("audio/webm");
  });

  it("returns null when audio-only recording is unsupported", () => {
    expect(selectAudioRecorderMimeType(() => false)).toBeNull();
  });
});

const options: RecordingOptions = {
  width: 1620,
  height: 2160,
  fps: 30,
  videoBitsPerSecond: 12_000_000,
  audioBitsPerSecond: 192_000,
};

describe("selectRecorderCapability", () => {
  it("selects the first supported smooth candidate", async () => {
    const result = await selectRecorderCapability(options, {
      isTypeSupported: (mimeType) => mimeType.startsWith("video/mp4"),
      encodingInfo: async () => ({
        supported: true,
        smooth: true,
        powerEfficient: true,
      }),
    });

    expect(result).toEqual({
      supported: true,
      mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      smooth: true,
      powerEfficient: true,
      options,
    });
  });

  it("skips unsupported candidates and selects WebM VP9", async () => {
    const result = await selectRecorderCapability(options, {
      isTypeSupported: (mimeType) => mimeType.includes("vp9"),
    });

    expect(result.mimeType).toBe('video/webm;codecs="vp9,opus"');
    expect(result.supported).toBe(true);
  });

  it("keeps an isTypeSupported candidate when MediaCapabilities throws", async () => {
    const result = await selectRecorderCapability(options, {
      isTypeSupported: (mimeType) => mimeType.startsWith("video/mp4"),
      encodingInfo: async () => {
        throw new Error("MediaCapabilities unavailable");
      },
    });

    expect(result).toMatchObject({
      supported: true,
      mimeType: 'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
      smooth: null,
      powerEfficient: null,
    });
  });

  it("returns a blocking result when no candidate is supported", async () => {
    const result = await selectRecorderCapability(options, {
      isTypeSupported: () => false,
    });

    expect(result).toEqual({
      supported: false,
      mimeType: null,
      smooth: null,
      powerEfficient: null,
      options,
    });
  });
});
