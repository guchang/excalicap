import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Slide title layering", () => {
  it("keeps canvas Slide titles below Excalidraw popovers", () => {
    expect(styles).toMatch(
      /\.canvas-slide-sorter\s*\{[^}]*z-index:\s*2/s,
    );
    expect(styles).not.toMatch(
      /\.canvas-slide-sorter\s*\{[^}]*z-index:\s*(?:1[0-9]|[2-9][0-9])/s,
    );
    expect(styles).not.toMatch(
      /\.product-shell:has\(\.editor-canvas \.popover\)[^{]*(?:\.canvas-slide-title-grip|\.canvas-slide-title-text)[^{]*\{[^}]*visibility:\s*hidden/s,
    );
  });
});
