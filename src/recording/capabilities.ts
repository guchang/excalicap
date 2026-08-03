import type { RecorderCapability, RecordingOptions } from "./types";

export interface EncodingInfoResult {
  readonly supported: boolean;
  readonly smooth: boolean;
  readonly powerEfficient: boolean;
}

export interface CapabilityProbe {
  isTypeSupported(mimeType: string): boolean;
  encodingInfo?(
    mimeType: string,
    options: RecordingOptions,
  ): Promise<EncodingInfoResult>;
}

export async function selectRecorderCapability(
  options: RecordingOptions,
  probe: CapabilityProbe,
): Promise<RecorderCapability> {
  const candidates = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/webm;codecs="vp9,opus"',
    'video/webm;codecs="vp8,opus"',
  ] as const;

  for (const mimeType of candidates) {
    if (!probe.isTypeSupported(mimeType)) {
      continue;
    }

    if (!probe.encodingInfo) {
      return {
        supported: true,
        mimeType,
        smooth: null,
        powerEfficient: null,
        options,
      };
    }

    try {
      const info = await probe.encodingInfo(mimeType, options);
      if (!info.supported || !info.smooth) {
        continue;
      }
      return {
        supported: true,
        mimeType,
        smooth: info.smooth,
        powerEfficient: info.powerEfficient,
        options,
      };
    } catch {
      return {
        supported: true,
        mimeType,
        smooth: null,
        powerEfficient: null,
        options,
      };
    }
  }

  return {
    supported: false,
    mimeType: null,
    smooth: null,
    powerEfficient: null,
    options,
  };
}
