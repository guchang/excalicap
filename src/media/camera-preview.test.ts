import { attachCameraPreview } from "./camera-preview";

class PreviewVideo extends EventTarget {
  srcObject: MediaProvider | null = null;
  readyState = 1;
  videoWidth = 1280;
  videoHeight = 720;
  play = vi.fn().mockResolvedValue(undefined);
}

class PreviewTrack extends EventTarget {
  muted = false;
}

describe("attachCameraPreview", () => {
  it("retries playback when Electron interrupts the first play request", async () => {
    const stream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const video = new PreviewVideo();
    video.play
      .mockRejectedValueOnce(new DOMException("interrupted", "AbortError"))
      .mockResolvedValueOnce(undefined);

    await expect(attachCameraPreview(video, stream)).resolves.toBeNull();
    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalledTimes(2);
  });

  it("reports a real playback failure without discarding the stream", async () => {
    const stream = { getVideoTracks: () => [] } as unknown as MediaStream;
    const video = new PreviewVideo();
    video.play.mockRejectedValue(
      new DOMException("denied", "NotAllowedError"),
    );

    await expect(attachCameraPreview(video, stream)).resolves.toBe(
      "摄像头已连接，但实时预览暂时不可用",
    );
    expect(video.srcObject).toBe(stream);
    expect(video.play).toHaveBeenCalledTimes(1);
  });

  it("waits for a muted camera track and recovers when the device sends frames", async () => {
    const track = new PreviewTrack();
    track.muted = true;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = new PreviewVideo();
    video.readyState = 0;
    video.videoWidth = 0;
    video.videoHeight = 0;
    const onReady = vi.fn();

    await expect(
      attachCameraPreview(video, stream, { onReady }),
    ).resolves.toBe("摄像头已连接，正在等待设备送出画面");

    track.muted = false;
    video.readyState = 1;
    video.videoWidth = 1920;
    video.videoHeight = 1080;
    track.dispatchEvent(new Event("unmute"));

    await vi.waitFor(() => {
      expect(video.play).toHaveBeenCalledTimes(2);
      expect(onReady).toHaveBeenCalledTimes(1);
    });
  });

  it("reports a muted track without waiting for a pending play request", async () => {
    const track = new PreviewTrack();
    track.muted = true;
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = new PreviewVideo();
    video.readyState = 0;
    video.videoWidth = 0;
    video.videoHeight = 0;
    video.play.mockReturnValue(new Promise(() => undefined));

    await expect(
      attachCameraPreview(video, stream),
    ).resolves.toBe("摄像头已连接，正在等待设备送出画面");
  });

  it("stops waiting when an initially unmuted play request stays pending", async () => {
    const track = new PreviewTrack();
    const stream = {
      getVideoTracks: () => [track],
    } as unknown as MediaStream;
    const video = new PreviewVideo();
    video.readyState = 0;
    video.videoWidth = 0;
    video.videoHeight = 0;
    video.play.mockReturnValue(new Promise(() => undefined));

    await expect(
      attachCameraPreview(video, stream, { playTimeoutMs: 1 }),
    ).resolves.toBe("摄像头已连接，正在等待设备送出画面");
  });
});
