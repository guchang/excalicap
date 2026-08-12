import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("teleprompter styles", () => {
  it("uses background opacity without blurring content behind the window", () => {
    const teleprompterRule = styles.match(/\.teleprompter\s*\{([^}]*)\}/);

    expect(teleprompterRule?.[1]).toContain(
      "background: rgba(17, 18, 22, var(--teleprompter-opacity, 0.88))",
    );
    expect(teleprompterRule?.[1]).not.toMatch(/backdrop-filter\s*:/);
  });

  it("centers the range thumb on a host-independent track", () => {
    const rangeRule = styles.match(
      /\.teleprompter-settings-panel input\[type="range"\]\s*\{([^}]*)\}/,
    );
    const webkitTrackRule = styles.match(
      /\.teleprompter-settings-panel\s+input\[type="range"\]::\-webkit-slider-runnable-track\s*\{([^}]*)\}/,
    );
    const webkitThumbRule = styles.match(
      /\.teleprompter-settings-panel input\[type="range"\]::\-webkit-slider-thumb\s*\{([^}]*)\}/,
    );

    expect(rangeRule?.[1]).toContain("background-position: center");
    expect(rangeRule?.[1]).toContain("background-size: 100% 4px");
    expect(webkitTrackRule?.[1]).toContain("height: 14px");
    expect(webkitTrackRule?.[1]).toContain("background: transparent");
    expect(webkitThumbRule?.[1]).toContain("margin-top: 0");
    expect(webkitThumbRule?.[1]).not.toMatch(/margin-top:\s*-\d/);
  });
});
