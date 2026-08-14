import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Slide Frame selection panel", () => {
  it("does not carry the obsolete selectable-Frame panel workaround", () => {
    expect(styles).not.toMatch(
      /\.editor-canvas\[data-slide-frame-selected="true"\]/,
    );
    expect(styles).not.toContain(".canvas-slide-selected-top-border");
  });
});
