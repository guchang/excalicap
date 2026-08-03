import { ensureLibraryReturnTarget } from "./library-return-target";

describe("library return target", () => {
  it("assigns one stable target to an unnamed editor tab", () => {
    const targetWindow = { name: "" };

    expect(
      ensureLibraryReturnTarget(targetWindow, () => "editor-session-1"),
    ).toBe("excalicap-editor-editor-session-1");
    expect(
      ensureLibraryReturnTarget(targetWindow, () => "editor-session-2"),
    ).toBe("excalicap-editor-editor-session-1");
  });

  it("preserves an existing browser window name", () => {
    const targetWindow = { name: "existing-editor" };

    expect(
      ensureLibraryReturnTarget(targetWindow, () => "unused"),
    ).toBe("existing-editor");
  });
});
