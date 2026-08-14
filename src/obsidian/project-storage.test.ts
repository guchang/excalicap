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

  it("keeps teleprompter text isolated between Excalicap files", async () => {
    const fileA = JSON.stringify({
      ...snapshot,
      projectTitle: "文件 A",
      teleprompterText: "A 的讲稿",
    });
    const fileB = JSON.stringify({
      ...snapshot,
      projectTitle: "文件 B",
      teleprompterText: "B 的讲稿",
    });
    const storageA = createObsidianProjectStorage({
      read: () => fileA,
      write: vi.fn(),
      requestSave: vi.fn(),
    });
    const storageB = createObsidianProjectStorage({
      read: () => fileB,
      write: vi.fn(),
      requestSave: vi.fn(),
    });

    await expect(storageA.load()).resolves.toMatchObject({
      teleprompterText: "A 的讲稿",
    });
    await expect(storageB.load()).resolves.toMatchObject({
      teleprompterText: "B 的讲稿",
    });
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

  it("does not report success until Obsidian has persisted the view", async () => {
    let finishPersist: (() => void) | undefined;
    const persist = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishPersist = resolve;
        }),
    );
    const storage = createObsidianProjectStorage({
      read: () => "",
      write: vi.fn(),
      requestSave: vi.fn(),
      persist,
    });
    let resolved = false;

    const saving = storage.save(snapshot).then(() => {
      resolved = true;
    });
    await Promise.resolve();

    expect(persist).toHaveBeenCalledOnce();
    expect(resolved).toBe(false);
    finishPersist?.();
    await saving;
    expect(resolved).toBe(true);
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

  it("does not overwrite a project that changed on disk after the view opened", async () => {
    const write = vi.fn();
    const requestSave = vi.fn();
    let persisted = JSON.stringify(snapshot);
    const storage = createObsidianProjectStorage({
      read: () => JSON.stringify(snapshot),
      readPersisted: async () => persisted,
      write,
      requestSave,
    } as Parameters<typeof createObsidianProjectStorage>[0]);

    persisted = JSON.stringify({
      ...snapshot,
      updatedAt: 2,
      elements: [{ id: "external-element", type: "rectangle" }],
    });

    await expect(
      storage.save({
        ...snapshot,
        updatedAt: 3,
        currentSlideId: "slide-2",
      }),
    ).rejects.toThrow("为避免覆盖外部修改，本次自动保存已停止");
    expect(write).not.toHaveBeenCalled();
    expect(requestSave).not.toHaveBeenCalled();
  });

  it("uses an externally loaded version as the baseline for later edits", async () => {
    const write = vi.fn();
    const requestSave = vi.fn();
    const external = {
      ...snapshot,
      updatedAt: 2,
      currentSlideId: "external-slide",
    };
    let persisted = JSON.stringify(external);
    const storage = createObsidianProjectStorage({
      read: () => JSON.stringify(external),
      readPersisted: async () => persisted,
      write: (data) => {
        persisted = data;
        write(data);
      },
      requestSave,
    });
    storage.acceptExternalData(JSON.stringify(external));

    await storage.save({
      ...external,
      updatedAt: 3,
      currentSlideId: "edited-after-external-load",
    });

    expect(write).toHaveBeenCalledOnce();
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
