import {
  createPermanentLibraryAdapter,
  deduplicateLibraryItems,
} from "./library-storage";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

const libraryItem = {
  id: "software-architecture",
  status: "published" as const,
  created: 1,
  elements: [{ id: "shape-1", type: "rectangle" }],
};

describe("permanent library storage", () => {
  it("deduplicates imported items whose content only differs in identity metadata", () => {
    const newest = {
      ...libraryItem,
      id: "newest-copy",
      created: 3,
      elements: [
        {
          ...libraryItem.elements[0],
          versionNonce: 300,
          updated: 3,
        },
      ],
    };
    const older = {
      ...libraryItem,
      id: "older-copy",
      created: 2,
      elements: [
        {
          ...libraryItem.elements[0],
          versionNonce: 200,
          updated: 2,
        },
      ],
    };

    expect(
      deduplicateLibraryItems([newest, older] as unknown as LibraryItems),
    ).toEqual([newest]);
  });

  it("preserves items when their visible content differs", () => {
    const rectangle = {
      ...libraryItem,
      id: "rectangle-item",
      elements: [{ ...libraryItem.elements[0], versionNonce: 100 }],
    };
    const ellipse = {
      ...libraryItem,
      id: "ellipse-item",
      elements: [
        {
          ...libraryItem.elements[0],
          type: "ellipse",
          versionNonce: 200,
        },
      ],
    };

    expect(
      deduplicateLibraryItems([
        rectangle,
        ellipse,
      ] as unknown as LibraryItems),
    ).toEqual([rectangle, ellipse]);
  });

  it("treats a missing IndexedDB record as an empty library", async () => {
    const adapter = createPermanentLibraryAdapter({
      load: async () => undefined,
      save: async () => undefined,
    });

    await expect(adapter.load({ source: "load" })).resolves.toBeNull();
  });

  it("restores installed items from a newly opened adapter", async () => {
    let record: unknown = null;
    const backend = {
      load: async () => structuredClone(record),
      save: async (next: unknown) => {
        record = structuredClone(next);
      },
    };

    const firstSession = createPermanentLibraryAdapter(backend);
    await firstSession.save({
      libraryItems: [libraryItem] as unknown as LibraryItems,
    });

    const reopenedSession = createPermanentLibraryAdapter(backend);
    await expect(reopenedSession.load({ source: "load" })).resolves.toEqual({
      libraryItems: [libraryItem],
    });
  });
});
