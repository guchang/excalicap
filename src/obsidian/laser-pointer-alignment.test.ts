import { describe, expect, it, vi } from "vitest";
import { alignLaserPointerLayer } from "./laser-pointer-alignment";

function createLayer(left: number, top: number) {
  const layer = document.createElement("div");
  layer.className = "SVGLayer";
  layer.getBoundingClientRect = vi.fn(() => ({
    bottom: top + 600,
    height: 600,
    left,
    right: left + 800,
    top,
    width: 800,
    x: left,
    y: top,
    toJSON: () => ({}),
  }));
  return layer;
}

describe("Obsidian laser pointer alignment", () => {
  it("moves a viewport-sized laser layer back to the viewport origin", () => {
    const layer = createLayer(312, 48);

    alignLaserPointerLayer(layer);

    expect(layer.style.transform).toBe("translate(-312px, -48px)");
  });

  it("does not move a laser layer that already starts at the viewport origin", () => {
    const layer = createLayer(0, 0);

    alignLaserPointerLayer(layer);

    expect(layer.style.transform).toBe("");
  });
});
