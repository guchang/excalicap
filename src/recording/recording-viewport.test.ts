import { describe, expect, it } from "vitest";
import {
  calculateRecordingViewportOffsets,
  calculateRecordingViewportState,
} from "./recording-viewport";

const rect = (
  left: number,
  top: number,
  width: number,
  height: number,
) => ({
  left,
  top,
  width,
  height,
  right: left + width,
  bottom: top + height,
});

describe("calculateRecordingViewportOffsets", () => {
  it("reserves the actual toolbar, recording rail, and footer space", () => {
    expect(
      calculateRecordingViewportOffsets(rect(0, 0, 1080, 1440), {
        top: rect(300, 16, 480, 48),
        right: rect(980, 240, 80, 960),
        bottom: rect(16, 1384, 184, 40),
      }),
    ).toEqual({ left: 27, top: 91, right: 127, bottom: 83 });
  });

  it("adapts the safe margin to the current pane instead of a fixed zoom", () => {
    expect(
      calculateRecordingViewportOffsets(rect(0, 0, 640, 480), {
        right: rect(560, 80, 64, 320),
      }),
    ).toEqual({ left: 16, top: 16, right: 96, bottom: 16 });
  });

  it("uses the exact maximum zoom and centers the Slide in the safe area", () => {
    const container = rect(45, 71, 1854, 958);
    const offsets = { left: 24, top: 84, right: 100, bottom: 69 };

    const state = calculateRecordingViewportState(
      { x: 0, y: 0, width: 1620, height: 2160 },
      container,
      offsets,
      { offsetLeft: 45, offsetTop: 71 },
    );

    expect(state.zoom).toBeCloseTo(805 / 2160, 6);
    expect((0 + state.scrollX) * state.zoom + 45).toBeCloseTo(632.125, 5);
    expect((0 + state.scrollY) * state.zoom + 71).toBeCloseTo(155, 5);
  });
});
