export interface OutputProfile {
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
}

export const OUTPUT_PROFILES = {
  landscape: {
    width: 1920,
    height: 1080,
    fps: 30,
  },
  classic: {
    width: 1440,
    height: 1080,
    fps: 30,
  },
  portraitStandard: {
    width: 1080,
    height: 1440,
    fps: 30,
  },
  portraitHigh: {
    width: 1620,
    height: 2160,
    fps: 30,
  },
  vertical: {
    width: 1080,
    height: 1920,
    fps: 30,
  },
  square: {
    width: 1080,
    height: 1080,
    fps: 30,
  },
} as const satisfies Record<string, OutputProfile>;

export function getFrameRenderDimensions(
  frame: { width: number; height: number },
  profile: OutputProfile,
): { width: number; height: number; scale: number } {
  const widthScale = profile.width / frame.width;
  const heightScale = profile.height / frame.height;

  if (Math.abs(widthScale - heightScale) > 0.0001) {
    throw new Error(
      `Frame ratio ${frame.width}:${frame.height} does not match output ${profile.width}:${profile.height}`,
    );
  }

  return {
    width: profile.width,
    height: profile.height,
    scale: widthScale,
  };
}
