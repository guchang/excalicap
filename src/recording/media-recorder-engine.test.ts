import { createMemoryChunkSink, type ChunkSink } from "./chunk-sink";
import {
  MediaRecorderEngine,
  type MediaRecorderLike,
  type MediaStreamLike,
  type MediaTrackLike,
} from "./media-recorder-engine";

class FakeTrack implements MediaTrackLike {
  public stopped = false;

  public constructor(public readonly kind: "video" | "audio") {}

  public stop() {
    this.stopped = true;
  }
}

class FakeStream implements MediaStreamLike {
  public constructor(private readonly tracks: readonly MediaTrackLike[]) {}

  public getVideoTracks() {
    return this.tracks.filter((track) => track.kind === "video");
  }

  public getAudioTracks() {
    return this.tracks.filter((track) => track.kind === "audio");
  }
}

class FakeRecorder implements MediaRecorderLike {
  public state: RecordingState = "inactive";
  public readonly mimeType = "video/webm";
  public ondataavailable: ((event: { data: Blob }) => void) | null = null;
  public onstop: (() => void) | null = null;
  public onerror: ((event: { error: Error }) => void) | null = null;
  public startTimeslice: number | null = null;

  public start(timeslice: number) {
    this.state = "recording";
    this.startTimeslice = timeslice;
  }

  public pause() {
    this.state = "paused";
  }

  public resume() {
    this.state = "recording";
  }

  public stop() {
    this.state = "inactive";
    this.onstop?.();
  }

  public emitData(blob: Blob) {
    this.ondataavailable?.({ data: blob });
  }
}

function createEngine(sink: ChunkSink = createMemoryChunkSink()) {
  let recorder: FakeRecorder | null = null;
  let combinedTracks: readonly MediaTrackLike[] = [];
  let recorderOptions: MediaRecorderOptions | null = null;
  const engine = new MediaRecorderEngine({
    sink,
    createMediaStream: (tracks) => {
      combinedTracks = tracks;
      return new FakeStream(tracks);
    },
    createRecorder: (_stream, options) => {
      recorderOptions = options;
      recorder = new FakeRecorder();
      return recorder;
    },
  });

  return {
    engine,
    getRecorder: () => recorder!,
    getCombinedTracks: () => combinedTracks,
    getRecorderOptions: () => recorderOptions,
  };
}

const startOptions = {
  mimeType: "video/webm",
  videoBitsPerSecond: 8_000_000,
  audioBitsPerSecond: 192_000,
};

describe("MediaRecorderEngine", () => {
  it("records one canvas video track and at most one microphone track", async () => {
    const canvasVideo = new FakeTrack("video");
    const extraCanvasVideo = new FakeTrack("video");
    const microphone = new FakeTrack("audio");
    const extraMicrophone = new FakeTrack("audio");
    const { engine, getRecorder, getCombinedTracks, getRecorderOptions } =
      createEngine();

    await engine.start({
      videoStream: new FakeStream([canvasVideo, extraCanvasVideo]),
      microphoneStream: new FakeStream([microphone, extraMicrophone]),
      recorder: startOptions,
    });

    expect(getCombinedTracks()).toEqual([canvasVideo, microphone]);
    expect(getRecorderOptions()).toEqual(startOptions);
    expect(getRecorder().startTimeslice).toBe(1000);
    expect(engine.state).toBe("recording");
  });

  it("records an audio-only material when no video stream is provided", async () => {
    const microphone = new FakeTrack("audio");
    const { engine, getCombinedTracks } = createEngine();

    await engine.start({
      videoStream: null,
      microphoneStream: new FakeStream([microphone]),
      recorder: { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 192_000 },
    });

    expect(getCombinedTracks()).toEqual([microphone]);
  });

  it("writes every non-empty chunk and waits for the final recording", async () => {
    const { engine, getRecorder } = createEngine();
    await engine.start({
      videoStream: new FakeStream([new FakeTrack("video")]),
      microphoneStream: null,
      recorder: startOptions,
    });
    getRecorder().emitData(new Blob(["one"]));
    getRecorder().emitData(new Blob([]));
    getRecorder().emitData(new Blob(["two"]));

    const result = await engine.stop();

    expect(await result.text()).toBe("onetwo");
    expect(result.type).toBe("video/webm");
    expect(engine.state).toBe("completed");
  });

  it("rejects pause and resume from invalid states", async () => {
    const { engine } = createEngine();

    await expect(engine.pause()).rejects.toThrow(
      "Cannot pause while recorder is idle",
    );
    await expect(engine.resume()).rejects.toThrow(
      "Cannot resume while recorder is idle",
    );
  });

  it("aborts temporary data without stopping borrowed source tracks", async () => {
    const video = new FakeTrack("video");
    const microphone = new FakeTrack("audio");
    let aborted = false;
    const memorySink = createMemoryChunkSink();
    const sink: ChunkSink = {
      get temporaryBytes() {
        return memorySink.temporaryBytes;
      },
      write: (blob) => memorySink.write(blob),
      finish: (mimeType) => memorySink.finish(mimeType),
      abort: async () => {
        aborted = true;
        await memorySink.abort();
      },
    };
    const { engine } = createEngine(sink);
    await engine.start({
      videoStream: new FakeStream([video]),
      microphoneStream: new FakeStream([microphone]),
      recorder: startOptions,
    });

    await engine.abort();

    expect(video.stopped).toBe(false);
    expect(microphone.stopped).toBe(false);
    expect(aborted).toBe(true);
    expect(engine.state).toBe("failed");
  });

  it("finishes recording without stopping borrowed source tracks", async () => {
    const video = new FakeTrack("video");
    const microphone = new FakeTrack("audio");
    const { engine } = createEngine();
    await engine.start({
      videoStream: new FakeStream([video]),
      microphoneStream: new FakeStream([microphone]),
      recorder: startOptions,
    });

    await engine.stop();

    expect(video.stopped).toBe(false);
    expect(microphone.stopped).toBe(false);
  });

  it("retains completed temporary data until cleanup is requested", async () => {
    let aborted = false;
    const memorySink = createMemoryChunkSink();
    const sink: ChunkSink = {
      get temporaryBytes() {
        return memorySink.temporaryBytes;
      },
      write: (blob) => memorySink.write(blob),
      finish: (mimeType) => memorySink.finish(mimeType),
      abort: async () => {
        aborted = true;
        await memorySink.abort();
      },
    };
    const { engine } = createEngine(sink);
    await engine.start({
      videoStream: new FakeStream([new FakeTrack("video")]),
      microphoneStream: null,
      recorder: startOptions,
    });

    await engine.stop();

    expect(aborted).toBe(false);

    await engine.cleanup();
    expect(aborted).toBe(true);
  });
});
