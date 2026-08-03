import type { LibraryItems } from "@excalidraw/excalidraw/types";
import { createObsidianLibraryAdapter } from "./library-storage";

describe("createObsidianLibraryAdapter", () => {
  it("persists the personal library in plugin data without dropping other fields", async () => {
    let pluginData: unknown = { settings: { theme: "light" } };
    const adapter = createObsidianLibraryAdapter({
      loadData: async () => pluginData,
      saveData: async (data) => {
        pluginData = data;
      },
    });
    const libraryItems = [{ id: "library-item" }] as unknown as LibraryItems;

    await adapter.save({ libraryItems });
    await expect(adapter.load({ source: "load" })).resolves.toEqual({
      libraryItems,
    });
    expect(pluginData).toMatchObject({
      settings: { theme: "light" },
      library: { version: 1, libraryItems },
    });
  });
});
