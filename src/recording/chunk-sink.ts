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

export function createMemoryChunkSink(): ChunkSink {
  const chunks: Blob[] = [];

  return createSerialChunkSink({
    async write(blob) {
      chunks.push(blob);
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
      await directory.removeEntry(fileName);
    },
  });
}
