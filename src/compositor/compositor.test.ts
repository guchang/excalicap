import { OUTPUT_PROFILES } from "../rendering/output-profile";
import {
  createCompositor,
  getCameraRect,
  getCoverSourceRect,
  getSlideRect,
} from "./compositor";

function createContextRecorder() {
  const calls: string[] = [];
  const context = {
    fillStyle: "",
    shadowBlur: 0,
    shadowColor: "",
    shadowOffsetY: 0,
    beginPath: () => calls.push("cursor:begin"),
    arc: () => calls.push("cursor:arc"),
    moveTo: () => undefined,
    lineTo: () => undefined,
    quadraticCurveTo: () => undefined,
    closePath: () => undefined,
    clip: () => calls.push("clip"),
    fill: () =>
      calls.push(`fill:${context.fillStyle}:${context.shadowColor}`),
    fillRect: () => calls.push(`background:${context.fillStyle}`),
    drawImage: (source: CanvasImageSource, ...dimensions: number[]) => {
      const element = source as HTMLElement;
      calls.push(`image:${element.dataset.layer}:${dimensions.join(",")}`);
    },
    save: () => calls.push("save"),
    restore: () => calls.push("restore"),
    translate: () => calls.push("translate"),
    scale: () => calls.push("scale"),
    stroke: () => calls.push("laser:stroke"),
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
  };
  return { calls, context };
}

describe("createCompositor", () => {
  it("sizes the backing canvas and draws layers in recording order", () => {
    const target = document.createElement("canvas");
    const whiteboard = document.createElement("canvas");
    const camera = document.createElement("video");
    Object.defineProperties(camera, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    });
    whiteboard.dataset.layer = "whiteboard";
    camera.dataset.layer = "camera";
    const { calls, context } = createContextRecorder();
    vi.spyOn(target, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );

    const compositor = createCompositor(target, OUTPUT_PROFILES.portraitHigh, {
      padding: 24,
      slideRadius: 18,
    });
    compositor.setBackground("#0f172a");
    compositor.setWhiteboard(whiteboard);
    compositor.setCamera({
      source: camera,
      x: 1260,
      y: 1800,
      width: 280,
      height: 280,
      shape: "circle",
      mirrored: true,
    });
    compositor.setCursor({
      editorX: 540,
      editorY: 720,
      frame: { x: 0, y: 0, width: 1080, height: 1440 },
      visible: true,
      color: "#ff2d55",
    });
    compositor.draw();

    expect({ width: target.width, height: target.height }).toEqual({
      width: 1620,
      height: 2160,
    });
    expect(calls[0]).toBe("background:#0f172a");
    expect(calls).toContain("image:whiteboard:36,48,1548,2064");
    expect(calls).toContain("image:camera:280,0,720,720,0,0,268,268");
    expect(calls).toContain("translate");
    expect(calls).toContain("scale");
    expect(calls.slice(-3)).toEqual([
      "cursor:begin",
      "cursor:arc",
      "fill:#ff2d55:transparent",
    ]);
    expect(calls).toContain("fill:#ffffff:rgba(19, 22, 29, 0.24)");
  });

  it("does not draw a cursor outside the current frame", () => {
    const target = document.createElement("canvas");
    const { calls, context } = createContextRecorder();
    vi.spyOn(target, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const compositor = createCompositor(
      target,
      OUTPUT_PROFILES.portraitStandard,
    );
    compositor.setCursor({
      editorX: 1200,
      editorY: 720,
      frame: { x: 0, y: 0, width: 1080, height: 1440 },
      visible: true,
      color: "#ff2d55",
    });

    compositor.draw();

    expect(calls).toEqual(["background:#f8f9fa"]);
  });

  it("keeps camera orientation when mirroring is disabled", () => {
    const target = document.createElement("canvas");
    const camera = document.createElement("video");
    camera.dataset.layer = "camera";
    Object.defineProperties(camera, {
      videoWidth: { configurable: true, value: 1280 },
      videoHeight: { configurable: true, value: 720 },
    });
    const { calls, context } = createContextRecorder();
    vi.spyOn(target, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const compositor = createCompositor(
      target,
      OUTPUT_PROFILES.portraitStandard,
    );
    compositor.setCamera({
      source: camera,
      x: 700,
      y: 1_000,
      width: 280,
      height: 280,
      shape: "circle",
      mirrored: false,
    });

    compositor.draw();

    expect(calls).toContain(
      "image:camera:280,0,720,720,704,1004,272,272",
    );
    expect(calls).not.toContain("scale");
  });

  it("records a laser path while pressed and fades it after one second", () => {
    let now = 100;
    const target = document.createElement("canvas");
    const { calls, context } = createContextRecorder();
    vi.spyOn(target, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    const compositor = createCompositor(
      target,
      OUTPUT_PROFILES.portraitStandard,
      undefined,
      () => now,
    );
    const frame = { x: 0, y: 0, width: 1080, height: 1440 };

    compositor.updateLaser({
      editorX: 100,
      editorY: 100,
      frame,
      button: "down",
      visible: true,
      color: "#ef4444",
    });
    now = 180;
    compositor.updateLaser({
      editorX: 300,
      editorY: 300,
      frame,
      button: "down",
      visible: true,
      color: "#ef4444",
    });
    compositor.draw();

    expect(calls).toContain("laser:stroke");

    calls.length = 0;
    now = 1_181;
    compositor.draw();

    expect(calls).not.toContain("laser:stroke");
  });
});

describe("getSlideRect", () => {
  it("scales settings padding with the output profile and preserves its ratio", () => {
    expect(getSlideRect(OUTPUT_PROFILES.portraitHigh, 24)).toEqual({
      x: 36,
      y: 48,
      width: 1548,
      height: 2064,
    });
  });

  it("places the camera relative to the visible slide card", () => {
    const camera = getCameraRect(
      getSlideRect(OUTPUT_PROFILES.portraitHigh, 24),
      280,
    );

    expect(camera.x).toBeCloseTo(1125.33, 2);
    expect(camera.y).toBeCloseTo(1653.33, 2);
    expect(camera.width).toBeCloseTo(401.33, 2);
    expect(camera.height).toBeCloseTo(401.33, 2);
  });

  it("places and clamps a continuously sized camera using normalized center coordinates", () => {
    const slide = { x: 20, y: 40, width: 1080, height: 1440 };

    expect(getCameraRect(slide, 320, 0.5, 0.25)).toEqual({
      x: 400,
      y: 240,
      width: 320,
      height: 320,
    });
    expect(getCameraRect(slide, 320, 0, 1)).toEqual({
      x: 20,
      y: 1160,
      width: 320,
      height: 320,
    });
  });
});

describe("getCoverSourceRect", () => {
  it("center-crops a landscape camera without changing its aspect ratio", () => {
    expect(getCoverSourceRect(1280, 720, 280, 280)).toEqual({
      x: 280,
      y: 0,
      width: 720,
      height: 720,
    });
  });
});
