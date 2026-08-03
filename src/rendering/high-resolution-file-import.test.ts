import { createHighResolutionFileImporter } from "./high-resolution-file-import";

describe("createHighResolutionFileImporter", () => {
  it("stores the original file before Excalidraw runs its image resize path", async () => {
    const storedFiles: Array<{
      id: string;
      dataURL: string;
      mimeType: string;
      created: number;
    }> = [];
    const importer = createHighResolutionFileImporter({
      createId: async () => "original-file-id",
      getDataURL: async () =>
        "data:image/png;base64,original-high-resolution-pixels",
      addFiles: (files) => {
        storedFiles.push(...files);
      },
      now: () => 1_754_000_000_000,
    });
    const source = new File(["original"], "capture.png", {
      type: "image/png",
    });

    const id = await importer(source);

    expect(id).toBe("original-file-id");
    expect(storedFiles).toEqual([
      {
        id: "original-file-id",
        dataURL:
          "data:image/png;base64,original-high-resolution-pixels",
        mimeType: "image/png",
        created: 1_754_000_000_000,
      },
    ]);
  });
});
