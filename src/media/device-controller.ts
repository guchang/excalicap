import type { ProductSettings } from "../product/types";

export interface DeviceMediaTrack {
  readonly kind: "video" | "audio";
  readonly label: string;
  stop(): void;
  addEventListener?(type: "ended", listener: () => void): void;
}

export interface DeviceMediaStream {
  getTracks(): readonly DeviceMediaTrack[];
  getVideoTracks(): readonly DeviceMediaTrack[];
  getAudioTracks(): readonly DeviceMediaTrack[];
}

export interface MediaDeviceInfoLike {
  readonly deviceId: string;
  readonly kind: MediaDeviceKind;
  readonly label: string;
}

export interface MediaDevicesPort {
  enumerateDevices(): Promise<readonly MediaDeviceInfoLike[]>;
  getUserMedia(constraints: MediaStreamConstraints): Promise<DeviceMediaStream>;
}

export interface DeviceCatalog {
  readonly cameras: readonly { deviceId: string; label: string }[];
  readonly microphones: readonly { deviceId: string; label: string }[];
}

export interface AcquiredMedia {
  readonly stream: DeviceMediaStream | null;
  readonly cameraStream: DeviceMediaStream | null;
  readonly microphoneStream: DeviceMediaStream | null;
  readonly warnings: readonly string[];
}

export async function enumerateMediaDevices(
  mediaDevices: MediaDevicesPort,
): Promise<DeviceCatalog> {
  const devices = await mediaDevices.enumerateDevices();
  return {
    cameras: devices
      .filter((device) => device.kind === "videoinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `摄像头 ${index + 1}`,
      })),
    microphones: devices
      .filter((device) => device.kind === "audioinput")
      .map((device, index) => ({
        deviceId: device.deviceId,
        label: device.label || `麦克风 ${index + 1}`,
      })),
  };
}

function videoConstraint(deviceId: string): MediaTrackConstraints | true {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

function audioConstraint(deviceId: string): MediaTrackConstraints | true {
  return deviceId ? { deviceId: { exact: deviceId } } : true;
}

export async function acquireEnabledMedia(
  mediaDevices: MediaDevicesPort,
  settings: ProductSettings,
  createStream: (
    tracks: readonly DeviceMediaTrack[],
  ) => DeviceMediaStream = (tracks) =>
    new MediaStream(tracks as MediaStreamTrack[]) as unknown as DeviceMediaStream,
): Promise<AcquiredMedia> {
  const warnings: string[] = [];
  let cameraStream: DeviceMediaStream | null = null;
  let microphoneStream: DeviceMediaStream | null = null;

  if (settings.camera.enabled) {
    try {
      cameraStream = await mediaDevices.getUserMedia({
        video: videoConstraint(settings.camera.deviceId),
        audio: false,
      });
    } catch {
      warnings.push("未检测到摄像头，将只录制白板和声音");
    }
  }

  if (settings.microphone.enabled) {
    try {
      microphoneStream = await mediaDevices.getUserMedia({
        video: false,
        audio: audioConstraint(settings.microphone.deviceId),
      });
    } catch {
      warnings.push("未检测到麦克风，将进行无声录制");
    }
  }

  const tracks = [
    ...(cameraStream?.getVideoTracks() ?? []),
    ...(microphoneStream?.getAudioTracks() ?? []),
  ];

  return {
    cameraStream,
    microphoneStream,
    stream: tracks.length > 0 ? createStream(tracks) : null,
    warnings,
  };
}

export function stopAcquiredMedia(media: AcquiredMedia | null) {
  if (!media) {
    return;
  }
  const tracks = new Set<DeviceMediaTrack>([
    ...(media.cameraStream?.getTracks() ?? []),
    ...(media.microphoneStream?.getTracks() ?? []),
    ...(media.stream?.getTracks() ?? []),
  ]);
  tracks.forEach((track) => track.stop());
}
