import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("Obsidian settings range alignment", () => {
  it("lets Electron vertically center the range thumb on its track", () => {
    const thumbRule = styles.match(
      /\.range-setting input\[type="range"\]::-webkit-slider-thumb \{([^}]*)\}/,
    );

    expect(thumbRule?.[1]).toBeDefined();
    expect(thumbRule?.[1]).not.toMatch(/margin-top:\s*-\d/);
  });
});
