import {
  createAutosaveController,
  createProjectStorage,
  type ProjectSnapshot,
} from "./project-storage";

function snapshot(updatedAt: number): ProjectSnapshot {
  return {
    version: 1,
    updatedAt,
    projectTitle: "我的视频",
    currentSlideId: "slide-1",
    elements: [{ id: "slide-1", type: "frame" }],
    appState: { viewBackgroundColor: "#fff" },
    files: {
      image: { id: "image", dataURL: "data:image/png;base64,a" },
    },
  };
}

describe("project storage", () => {
  it("loads null before save and replaces the current workspace", async () => {
    let stored: ProjectSnapshot | null = null;
    const storage = createProjectStorage({
      load: async () => stored,
      save: async (value) => {
        stored = structuredClone(value);
      },
      clear: async () => {
        stored = null;
      },
    });

    await expect(storage.load()).resolves.toBeNull();
    await storage.save(snapshot(1));
    await storage.save(snapshot(2));

    await expect(storage.load()).resolves.toEqual(snapshot(2));
    await storage.clear();
    await expect(storage.load()).resolves.toBeNull();
  });
});

describe("autosave controller", () => {
  it("debounces scene changes and exposes save status", async () => {
    vi.useFakeTimers();
    const saved: number[] = [];
    const statuses: string[] = [];
    const controller = createAutosaveController({
      delayMs: 800,
      save: async (value) => {
        saved.push(value.updatedAt);
      },
      onStatusChange: (status) => statuses.push(status),
    });

    controller.queue(snapshot(1));
    controller.queue(snapshot(2));
    expect(saved).toEqual([]);
    await vi.advanceTimersByTimeAsync(800);

    expect(saved).toEqual([2]);
    expect(statuses).toEqual(["dirty", "dirty", "saving", "saved"]);
    controller.dispose();
    vi.useRealTimers();
  });

  it("flushes immediately and surfaces save failures", async () => {
    const statuses: string[] = [];
    const errors: unknown[] = [];
    const controller = createAutosaveController({
      delayMs: 800,
      save: async () => {
        throw new Error("quota");
      },
      onError: (error) => errors.push(error),
      onStatusChange: (status) => statuses.push(status),
    });

    await expect(controller.flush(snapshot(3))).rejects.toThrow("quota");
    expect(statuses).toEqual(["saving", "failed"]);
    expect(errors).toEqual([expect.objectContaining({ message: "quota" })]);
  });

  it("discards an obsolete pending save when a newer external version loads", async () => {
    vi.useFakeTimers();
    const save = vi.fn(async () => undefined);
    const controller = createAutosaveController({
      delayMs: 800,
      save,
      onStatusChange: vi.fn(),
    });

    controller.queue(snapshot(1));
    controller.discardPending();
    await vi.advanceTimersByTimeAsync(800);

    expect(save).not.toHaveBeenCalled();
    controller.dispose();
    vi.useRealTimers();
  });
});
