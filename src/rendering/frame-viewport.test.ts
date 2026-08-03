import { getFrameViewportRect, toHostViewportRect } from "./frame-viewport";

describe("getFrameViewportRect", () => {
  it("maps scene frame bounds through Excalidraw scroll, zoom, and offsets", () => {
    expect(
      getFrameViewportRect(
        { x: 1200, y: 100, width: 1080, height: 1440 },
        {
          scrollX: -1000,
          scrollY: -50,
          zoom: { value: 0.5 },
          offsetLeft: 12,
          offsetTop: 20,
        },
      ),
    ).toEqual({
      left: 112,
      top: 45,
      width: 540,
      height: 720,
    });
  });
});

describe("toHostViewportRect", () => {
  it("removes the host offset from viewport-relative overlays", () => {
    expect(
      toHostViewportRect(
        { left: 1265, top: 503, width: 219, height: 292 },
        { left: 45, top: 71 },
      ),
    ).toEqual({
      left: 1220,
      top: 432,
      width: 219,
      height: 292,
    });
  });
});
