import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const styles = readFileSync(resolve(process.cwd(), "src/styles.css"), "utf8");

describe("teleprompter styles", () => {
  it("uses background opacity without blurring content behind the window", () => {
    const teleprompterRule = styles.match(/\.teleprompter\s*\{([^}]*)\}/);

    expect(teleprompterRule?.[1]).toContain(
      "background: rgba(23, 25, 31, var(--teleprompter-opacity, 0.88))",
    );
    expect(teleprompterRule?.[1]).not.toMatch(/backdrop-filter\s*:/);
  });
});
