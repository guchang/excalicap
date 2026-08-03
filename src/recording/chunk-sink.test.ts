import {
  createMemoryChunkSink,
  createOpfsChunkSink,
  createSerialChunkSink,
} from "./chunk-sink";

describe("createSerialChunkSink", () => {
  it("starts the next write only after the previous write resolves", async () => {
    const events: string[] = [];
    let releaseFirstWrite: (() => void) | undefined;
    const firstWriteGate = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let writeIndex = 0;
    const sink = createSerialChunkSink({
      write: async (blob) => {
        writeIndex += 1;
        const currentIndex = writeIndex;
        events.push(`start:${blob.size}`);
        if (currentIndex === 1) {
          await firstWriteGate;
        }
        events.push(`end:${currentIndex}`);
      },
      finish: async (mimeType) => new Blob(["complete"], { type: mimeType }),
      abort: async () => undefined,
    });

    const first = sink.write(new Blob(["one"]));
    const second = sink.write(new Blob(["two"]));
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(["start:3"]);

    releaseFirstWrite?.();
    await Promise.all([first, second]);

    expect(events).toEqual([
      "start:3",
      "end:1",
      "start:3",
      "end:2",
    ]);
  });

  it("waits for queued writes before finishing", async () => {
    const events: string[] = [];
    const sink = createSerialChunkSink({
      write: async () => {
        events.push("write");
      },
      finish: async (mimeType) => {
        events.push("finish");
        return new Blob(["done"], { type: mimeType });
      },
      abort: async () => undefined,
    });

    void sink.write(new Blob(["chunk"]));
    const result = await sink.finish("video/webm");

    expect(events).toEqual(["write", "finish"]);
    expect(await result.text()).toBe("done");
    expect(result.type).toBe("video/webm");
  });
});

describe("createMemoryChunkSink", () => {
  it("returns the concatenated recording and reports temporary bytes", async () => {
    const sink = createMemoryChunkSink();
    await sink.write(new Blob(["one"]));
    await sink.write(new Blob(["two"]));

    const result = await sink.finish("video/webm");

    expect(await result.text()).toBe("onetwo");
    expect(result.type).toBe("video/webm");
    expect(sink.temporaryBytes).toBe(6);
  });
});

describe("createOpfsChunkSink", () => {
  it("returns the temporary file without copying or removing it", async () => {
    const events: string[] = [];
    const storedFile = new File(["stored"], "recording.tmp");
    const arrayBufferSpy = vi.spyOn(storedFile, "arrayBuffer");
    const sink = await createOpfsChunkSink("recording.tmp", {
      getDirectory: async () => ({
        getFileHandle: async () => ({
          createWritable: async () => ({
            write: async (blob) => {
              events.push(`write:${blob.size}`);
            },
            close: async () => {
              events.push("close");
            },
            abort: async () => {
              events.push("abort");
            },
          }),
          getFile: async () => storedFile,
        }),
        removeEntry: async (name) => {
          events.push(`remove:${name}`);
        },
      }),
    });

    await sink.write(new Blob(["one"]));
    const result = await sink.finish("video/webm");

    expect(events).toEqual(["write:3", "close"]);
    expect(arrayBufferSpy).not.toHaveBeenCalled();
    expect(await result.text()).toBe("stored");
    expect(result.type).toBe("video/webm");
    expect(events).not.toContain("remove:recording.tmp");

    await sink.abort();
    expect(events.at(-1)).toBe("remove:recording.tmp");
  });
});
