import type { ProjectSnapshot } from "../project/project-storage";
import { createObsidianProjectStorage } from "./project-storage";

const snapshot: ProjectSnapshot = {
  version: 1,
  updatedAt: 1,
  projectTitle: "Obsidian project",
  currentSlideId: "slide-1",
  elements: [],
  appState: { viewBackgroundColor: "#ffffff" },
  files: {},
};

describe("createObsidianProjectStorage", () => {
  it("loads the current .excalicap file contents", async () => {
    const storage = createObsidianProjectStorage({
      read: () => JSON.stringify(snapshot),
      write: vi.fn(),
      requestSave: vi.fn(),
    });

    await expect(storage.load()).resolves.toEqual(snapshot);
  });

  it("writes a snapshot back to the file and asks Obsidian to save", async () => {
    const write = vi.fn();
    const requestSave = vi.fn();
    const storage = createObsidianProjectStorage({
      read: () => "",
      write,
      requestSave,
    });

    await storage.save(snapshot);

    expect(write).toHaveBeenCalledWith(JSON.stringify(snapshot, null, 2));
    expect(requestSave).toHaveBeenCalledOnce();
  });

  it("skips saving when only the snapshot timestamp changed", async () => {
    const write = vi.fn();
    const requestSave = vi.fn();
    const storage = createObsidianProjectStorage({
      read: () => JSON.stringify(snapshot),
      write,
      requestSave,
    });

    await storage.save({ ...snapshot, updatedAt: 2 });

    expect(write).not.toHaveBeenCalled();
    expect(requestSave).not.toHaveBeenCalled();
  });

  it("still saves when the project content changed", async () => {
    const write = vi.fn();
    const requestSave = vi.fn();
    const storage = createObsidianProjectStorage({
      read: () => JSON.stringify(snapshot),
      write,
      requestSave,
    });
    const changed = {
      ...snapshot,
      updatedAt: 2,
      currentSlideId: "slide-2",
    };

    await storage.save(changed);

    expect(write).toHaveBeenCalledWith(JSON.stringify(changed, null, 2));
    expect(requestSave).toHaveBeenCalledOnce();
  });

  it("treats an empty file as a new project", async () => {
    const storage = createObsidianProjectStorage({
      read: () => "  ",
      write: vi.fn(),
      requestSave: vi.fn(),
    });

    await expect(storage.load()).resolves.toBeNull();
  });
});
