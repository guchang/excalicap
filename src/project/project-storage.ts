export interface ProjectSnapshot {
  readonly version: 1;
  readonly updatedAt: number;
  readonly projectTitle: string;
  readonly currentSlideId: string | null;
  readonly elements: readonly unknown[];
  readonly appState: Readonly<Record<string, unknown>>;
  readonly files: Readonly<Record<string, unknown>>;
}

export interface ProjectStorageBackend {
  load(): Promise<ProjectSnapshot | null>;
  save(snapshot: ProjectSnapshot): Promise<void>;
  clear(): Promise<void>;
}

export interface ProjectStorage extends ProjectStorageBackend {}

export function createProjectStorage(
  backend: ProjectStorageBackend,
): ProjectStorage {
  return {
    async load() {
      const snapshot = await backend.load();
      if (snapshot && snapshot.version !== 1) {
        throw new Error("本地项目版本不受支持");
      }
      return snapshot;
    },
    save: (snapshot) => backend.save(snapshot),
    clear: () => backend.clear(),
  };
}

function openProjectDatabase(
  factory: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("projects")) {
        database.createObjectStore("projects");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`无法打开本地项目：${request.error?.message ?? "未知错误"}`));
  });
}

function requestResult<T>(request: IDBRequest<T>, failure: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`${failure}：${request.error?.message ?? "未知错误"}`));
  });
}

export function createBrowserProjectStorage(
  factory: IDBFactory,
  databaseName = "excalicap",
): ProjectStorage {
  const database = openProjectDatabase(factory, databaseName);
  return createProjectStorage({
    async load() {
      const db = await database;
      const request = db
        .transaction("projects", "readonly")
        .objectStore("projects")
        .get("current");
      return (await requestResult(
        request,
        "无法读取本地项目",
      )) as ProjectSnapshot | null;
    },
    async save(snapshot) {
      const db = await database;
      const request = db
        .transaction("projects", "readwrite")
        .objectStore("projects")
        .put(snapshot, "current");
      await requestResult(request, "无法保存本地项目");
    },
    async clear() {
      const db = await database;
      const request = db
        .transaction("projects", "readwrite")
        .objectStore("projects")
        .delete("current");
      await requestResult(request, "无法清除本地项目");
    },
  });
}

export type AutosaveStatus =
  | "idle"
  | "dirty"
  | "saving"
  | "saved"
  | "failed";

export interface AutosaveController {
  queue(snapshot: ProjectSnapshot): void;
  flush(snapshot?: ProjectSnapshot): Promise<void>;
  dispose(): void;
}

export function createAutosaveController(options: {
  readonly delayMs: number;
  readonly save: (snapshot: ProjectSnapshot) => Promise<void>;
  readonly onStatusChange: (status: AutosaveStatus) => void;
}): AutosaveController {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: ProjectSnapshot | null = null;

  const flush = async (snapshot?: ProjectSnapshot) => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const target = snapshot ?? latest;
    if (!target) {
      return;
    }
    latest = target;
    options.onStatusChange("saving");
    try {
      await options.save(target);
      options.onStatusChange("saved");
    } catch (error) {
      options.onStatusChange("failed");
      throw error;
    }
  };

  return {
    queue(snapshot) {
      latest = snapshot;
      options.onStatusChange("dirty");
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => {
        void flush().catch(() => undefined);
      }, options.delayMs);
    },
    flush,
    dispose() {
      if (timer) {
        clearTimeout(timer);
      }
      timer = null;
      latest = null;
    },
  };
}
