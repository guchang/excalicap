import { DEFAULT_SETTINGS } from "../product/output-presets";
import {
  acquireEnabledMedia,
  enumerateMediaDevices,
  stopAcquiredMedia,
  type DeviceMediaStream,
  type DeviceMediaTrack,
  type MediaDevicesPort,
} from "./device-controller";

function track(
  kind: "video" | "audio",
): DeviceMediaTrack & { stopped: boolean } {
  return {
    kind,
    label: kind === "video" ? "Camera" : "Microphone",
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

function stream(tracks: DeviceMediaTrack[]): DeviceMediaStream {
  return {
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter((item) => item.kind === "video"),
    getAudioTracks: () => tracks.filter((item) => item.kind === "audio"),
  };
}

describe("device controller", () => {
  it("groups available input devices", async () => {
    const mediaDevices: MediaDevicesPort = {
      enumerateDevices: async () => [
        { deviceId: "cam", kind: "videoinput", label: "Camera" },
        { deviceId: "mic", kind: "audioinput", label: "Microphone" },
        { deviceId: "speaker", kind: "audiooutput", label: "Speaker" },
      ],
      getUserMedia: async () => stream([]),
    };

    await expect(enumerateMediaDevices(mediaDevices)).resolves.toEqual({
      cameras: [{ deviceId: "cam", label: "Camera" }],
      microphones: [{ deviceId: "mic", label: "Microphone" }],
    });
  });

  it("acquires camera and microphone independently", async () => {
    const calls: MediaStreamConstraints[] = [];
    const cameraTrack = track("video");
    const microphoneTrack = track("audio");
    const mediaDevices: MediaDevicesPort = {
      enumerateDevices: async () => [],
      getUserMedia: async (constraints) => {
        calls.push(constraints);
        return constraints.video
          ? stream([cameraTrack])
          : stream([microphoneTrack]);
      },
    };

    const acquired = await acquireEnabledMedia(
      mediaDevices,
      DEFAULT_SETTINGS,
      (tracks) => stream([...tracks]),
    );

    expect(calls).toEqual([
      { video: true, audio: false },
      { video: false, audio: true },
    ]);
    expect(acquired.stream?.getTracks()).toEqual([
      cameraTrack,
      microphoneTrack,
    ]);
    expect(acquired.warnings).toEqual([]);
  });

  it("continues with microphone when no camera exists", async () => {
    const microphoneTrack = track("audio");
    const mediaDevices: MediaDevicesPort = {
      enumerateDevices: async () => [],
      getUserMedia: async (constraints) => {
        if (constraints.video) {
          throw new DOMException("Requested device not found", "NotFoundError");
        }
        return stream([microphoneTrack]);
      },
    };

    const acquired = await acquireEnabledMedia(
      mediaDevices,
      DEFAULT_SETTINGS,
      (tracks) => stream([...tracks]),
    );

    expect(acquired.cameraStream).toBeNull();
    expect(acquired.microphoneStream?.getAudioTracks()).toEqual([
      microphoneTrack,
    ]);
    expect(acquired.warnings).toEqual([
      "未检测到摄像头，将只录制白板和声音",
    ]);
  });

  it("allows whiteboard-only recording when devices are disabled or missing", async () => {
    const disabled = {
      ...DEFAULT_SETTINGS,
      camera: { ...DEFAULT_SETTINGS.camera, enabled: false },
      microphone: { ...DEFAULT_SETTINGS.microphone, enabled: false },
    };
    const mediaDevices: MediaDevicesPort = {
      enumerateDevices: async () => [],
      getUserMedia: async () => {
        throw new Error("must not request devices");
      },
    };

    const acquired = await acquireEnabledMedia(
      mediaDevices,
      disabled,
      (tracks) => stream([...tracks]),
    );

    expect(acquired.stream).toBeNull();
    expect(acquired.warnings).toEqual([]);
  });

  it("stops every acquired track exactly once", async () => {
    const cameraTrack = track("video");
    const microphoneTrack = track("audio");
    const acquired = {
      cameraStream: stream([cameraTrack]),
      microphoneStream: stream([microphoneTrack]),
      stream: stream([cameraTrack, microphoneTrack]),
      warnings: [],
    };

    stopAcquiredMedia(acquired);

    expect(cameraTrack.stopped).toBe(true);
    expect(microphoneTrack.stopped).toBe(true);
  });
});
