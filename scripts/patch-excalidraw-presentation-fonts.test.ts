import { describe, expect, it } from "vitest";
import { patchExcalidrawJavaScript } from "./patch-excalidraw-presentation-fonts.mjs";

describe("patchExcalidrawJavaScript", () => {
  it("adds a font-size imperative API and replaces the four base presets", () => {
    const source = `
      const actionChangeFontSize = register({ name: "changeFontSize" });
      const api = {
        updateScene: this.updateScene,
        registerAction: (action) => {
          this.actionManager.registerAction(action);
        },
      };
      options: [
        { value: 16, testId: "fontSize-small" },
        { value: 20, testId: "fontSize-medium" },
        { value: 28, testId: "fontSize-large" },
        { value: 36, testId: "fontSize-veryLarge" }
      ]
    `;

    const patched = patchExcalidrawJavaScript(source);

    expect(patched).toContain("setFontSize: (fontSize) =>");
    expect(patched).toContain("executeAction(actionChangeFontSize");
    expect(patched).toContain('value: 48, testId: "fontSize-medium"');
    expect(patched).toContain('value: 88, testId: "fontSize-veryLarge"');
  });
});
