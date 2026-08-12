export interface ChunkSink {
  readonly temporaryBytes: number;
  write(blob: Blob): Promise<void>;
  finish(mimeType: string): Promise<Blob>;
  abort(): Promise<void>;
}

export interface SerialChunkWriter {
  write(blob: Blob): Promise<void>;
  finish(mimeType: string): Promise<Blob>;
  abort(): Promise<void>;
}

export interface OpfsWritable {
  write(blob: Blob): Promise<void>;
  close(): Promise<void>;
  abort(): Promise<void>;
}

export interface OpfsFileHandle {
  createWritable(): Promise<OpfsWritable>;
  getFile(): Promise<File>;
}

export interface OpfsDirectory {
  getFileHandle(
    name: string,
    options: { create: true },
  ): Promise<OpfsFileHandle>;
  removeEntry(name: string): Promise<void>;
  entries?(): AsyncIterableIterator<[string, unknown]>;
}

const activeRecordingChunks = new Set<string>();
const DEFAULT_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;
const ORPHAN_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function removeOrphanedRecordingChunks(
  dependencies: OpfsDependencies,
  now = Date.now(),
) {
  const directory = await dependencies.getDirectory();
  if (!directory.entries) {
    return;
  }
  for await (const [name] of directory.entries()) {
    const createdAt = Number(
      /^excalicap-(\d+)-.+\.tmp$/.exec(name)?.[1] ?? Number.NaN,
    );
    if (
      Number.isFinite(createdAt) &&
      now - createdAt >= ORPHAN_MAX_AGE_MS &&
      !activeRecordingChunks.has(name)
    ) {
      await directory.removeEntry(name);
    }
  }
}

export interface OpfsDependencies {
  getDirectory(): Promise<OpfsDirectory>;
}

export function createSerialChunkSink(
  writer: SerialChunkWriter,
): ChunkSink {
  let queue = Promise.resolve();
  let temporaryBytes = 0;

  return {
    get temporaryBytes() {
      return temporaryBytes;
    },
    write(blob) {
      temporaryBytes += blob.size;
      queue = queue.then(() => writer.write(blob));
      return queue;
    },
    async finish(mimeType) {
      await queue;
      return writer.finish(mimeType);
    },
    async abort() {
      await queue.catch(() => undefined);
      await writer.abort();
    },
  };
}

export function createMemoryChunkSink(
  maxBytes = DEFAULT_MEMORY_LIMIT_BYTES,
): ChunkSink {
  const chunks: Blob[] = [];
  let storedBytes = 0;

  return createSerialChunkSink({
    async write(blob) {
      if (storedBytes + blob.size > maxBytes) {
        throw new Error("录制临时数据超过 512 MiB 内存上限");
      }
      chunks.push(blob);
      storedBytes += blob.size;
    },
    async finish(mimeType) {
      return new Blob(chunks, { type: mimeType });
    },
    async abort() {
      chunks.length = 0;
    },
  });
}

export async function createOpfsChunkSink(
  fileName: string,
  dependencies: OpfsDependencies,
): Promise<ChunkSink> {
  const directory = await dependencies.getDirectory();
  const fileHandle = await directory.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  let closed = false;
  activeRecordingChunks.add(fileName);

  return createSerialChunkSink({
    async write(blob) {
      await writable.write(blob);
    },
    async finish(mimeType) {
      await writable.close();
      closed = true;
      const file = await fileHandle.getFile();
      return file.slice(0, file.size, mimeType);
    },
    async abort() {
      if (!closed) {
        await writable.abort();
      }
      try {
        await directory.removeEntry(fileName);
      } finally {
        activeRecordingChunks.delete(fileName);
      }
    },
  });
}
