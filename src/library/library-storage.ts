import type {
  LibraryItems,
  LibraryItems_anyVersion,
} from "@excalidraw/excalidraw/types";

interface StoredLibraryRecord {
  readonly version: 1;
  readonly libraryItems: LibraryItems_anyVersion;
}

export interface LibraryStorageBackend {
  load(): Promise<unknown>;
  save(record: StoredLibraryRecord): Promise<void>;
}

export interface PermanentLibraryAdapter {
  load(metadata: {
    readonly source: "load" | "save";
  }): Promise<{ libraryItems: LibraryItems_anyVersion } | null>;
  save(data: { readonly libraryItems: LibraryItems }): Promise<void>;
}

function libraryItemContentKey(item: LibraryItems[number]): string {
  return JSON.stringify({
    status: item.status,
    elements: item.elements.map(({ versionNonce, updated, ...element }) =>
      element,
    ),
  });
}

export function deduplicateLibraryItems(
  libraryItems: LibraryItems,
): LibraryItems {
  const contentKeys = new Set<string>();
  return libraryItems.filter((item) => {
    const key = libraryItemContentKey(item);
    if (contentKeys.has(key)) {
      return false;
    }
    contentKeys.add(key);
    return true;
  });
}

function isStoredLibraryRecord(value: unknown): value is StoredLibraryRecord {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Partial<StoredLibraryRecord>;
  return record.version === 1 && Array.isArray(record.libraryItems);
}

export function createPermanentLibraryAdapter(
  backend: LibraryStorageBackend,
): PermanentLibraryAdapter {
  return {
    async load() {
      const record = await backend.load();
      if (record == null) {
        return null;
      }
      if (!isStoredLibraryRecord(record)) {
        throw new Error("本地素材库版本不受支持");
      }
      return { libraryItems: record.libraryItems };
    },
    save(data) {
      return backend.save({
        version: 1,
        libraryItems: data.libraryItems,
      });
    },
  };
}

function openLibraryDatabase(
  factory: IDBFactory,
  databaseName: string,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("library")) {
        database.createObjectStore("library");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(
        new Error(
          `无法打开本地素材库：${request.error?.message ?? "未知错误"}`,
        ),
      );
  });
}

function requestResult<T>(request: IDBRequest<T>, failure: string): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error(`${failure}：${request.error?.message ?? "未知错误"}`));
  });
}

export function createBrowserPermanentLibraryAdapter(
  factory: IDBFactory,
  databaseName = "excalicap-library-v1",
): PermanentLibraryAdapter {
  const database = openLibraryDatabase(factory, databaseName);
  return createPermanentLibraryAdapter({
    async load() {
      const db = await database;
      const request = db
        .transaction("library", "readonly")
        .objectStore("library")
        .get("personal");
      return requestResult(request, "无法读取本地素材库");
    },
    async save(record) {
      const db = await database;
      const request = db
        .transaction("library", "readwrite")
        .objectStore("library")
        .put(record, "personal");
      await requestResult(request, "无法保存本地素材库");
    },
  });
}
