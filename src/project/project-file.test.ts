import {
  createBrowserProjectFileGateway,
  type ProjectFileHandle,
} from "./project-file";

function fileHandle(name: string, contents = "{}") {
  const file = new File([contents], name, {
    type: "application/vnd.excalidraw+json",
  });
  const write = vi.fn(async (_data: Blob) => undefined);
  const close = vi.fn(async () => undefined);
  const handle: ProjectFileHandle = {
    name,
    getFile: async () => file,
    createWritable: async () => ({ write, close }),
  };
  return { close, file, handle, write };
}

describe("browser project file gateway", () => {
  it("opens an Excalidraw file and keeps its writable handle", async () => {
    const selected = fileHandle("story.excalidraw");
    const gateway = createBrowserProjectFileGateway(
      {
        showOpenFilePicker: async () => [selected.handle],
      },
      document,
    );

    await expect(gateway.open()).resolves.toEqual({
      file: selected.file,
      handle: selected.handle,
    });
  });

  it("writes Save directly to the bound file handle", async () => {
    const current = fileHandle("story.excalidraw");
    const gateway = createBrowserProjectFileGateway({}, document);
    const blob = new Blob(["serialized"], {
      type: "application/vnd.excalidraw+json",
    });

    await expect(
      gateway.save(blob, "ignored.excalidraw", current.handle),
    ).resolves.toEqual({
      kind: "written",
      handle: current.handle,
    });
    expect(current.write).toHaveBeenCalledWith(blob);
    expect(current.close).toHaveBeenCalledOnce();
  });

  it("asks for a new file on Save As and returns the new binding", async () => {
    const current = fileHandle("old.excalidraw");
    const selected = fileHandle("new.excalidraw");
    const showSaveFilePicker = vi.fn(async () => selected.handle);
    const gateway = createBrowserProjectFileGateway(
      { showSaveFilePicker },
      document,
    );
    const blob = new Blob(["serialized"]);

    await expect(
      gateway.save(blob, "suggested.excalidraw", current.handle, true),
    ).resolves.toEqual({
      kind: "written",
      handle: selected.handle,
    });
    expect(showSaveFilePicker).toHaveBeenCalledWith(
      expect.objectContaining({ suggestedName: "suggested.excalidraw" }),
    );
    expect(current.write).not.toHaveBeenCalled();
    expect(selected.write).toHaveBeenCalledWith(blob);
  });

  it("treats a cancelled picker as no change", async () => {
    const gateway = createBrowserProjectFileGateway(
      {
        showOpenFilePicker: async () => {
          throw new DOMException("cancelled", "AbortError");
        },
        showSaveFilePicker: async () => {
          throw new DOMException("cancelled", "AbortError");
        },
      },
      document,
    );

    await expect(gateway.open()).resolves.toBeNull();
    await expect(
      gateway.save(new Blob(["serialized"]), "story.excalidraw", null, true),
    ).resolves.toBeNull();
  });

  it("downloads a copy when native save access is unavailable", async () => {
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = {
      click,
      download: "",
      href: "",
      remove,
    } as unknown as HTMLAnchorElement;
    const createElement = vi
      .spyOn(document, "createElement")
      .mockReturnValue(anchor);
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:project");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const gateway = createBrowserProjectFileGateway({}, document);

    await expect(
      gateway.save(new Blob(["serialized"]), "story.excalidraw"),
    ).resolves.toEqual({ kind: "downloaded" });
    expect(anchor.download).toBe("story.excalidraw");
    expect(anchor.href).toBe("blob:project");
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:project");

    createElement.mockRestore();
    createObjectURL.mockRestore();
    revokeObjectURL.mockRestore();
  });
});
