import { describe, expect, it } from "vitest";
import {
  createRecordingFileNames,
  createStoredZip,
} from "./recording-artifacts";

describe("recording artifact names", () => {
  it("uses the current project name, download type, and one timestamp", () => {
    const names = createRecordingFileNames(
      "Excalicap介绍.excalicap",
      "video/mp4;codecs=avc1",
      "video/webm;codecs=vp9",
      "audio/webm;codecs=opus",
      new Date(2026, 7, 12, 19, 48, 0),
    );

    expect(names).toEqual({
      composite: "Excalicap介绍-合成成片-20260812-194800.mp4",
      materials: "Excalicap介绍-原始素材-20260812-194800.zip",
      whiteboard: "Excalicap介绍-白板激光笔-20260812-194800.webm",
      camera: "Excalicap介绍-摄像头-20260812-194800.webm",
      audio: "Excalicap介绍-声音-20260812-194800.webm",
    });
  });

  it("removes the extension and replaces unsafe filename characters", () => {
    const names = createRecordingFileNames(
      "演示: 第一版?.excalidraw",
      "video/webm",
      "video/webm",
      "audio/mp4",
      new Date(2026, 0, 2, 3, 4, 5),
    );

    expect(names.composite).toBe("演示- 第一版-合成成片-20260102-030405.webm");
    expect(names.audio).toBe("演示- 第一版-声音-20260102-030405.m4a");
  });
});

describe("stored ZIP", () => {
  it("packages all named recording materials into a valid ZIP blob", async () => {
    const zip = await createStoredZip([
      { name: "白板激光笔.webm", blob: new Blob(["whiteboard"]) },
      { name: "摄像头.webm", blob: new Blob(["camera"]) },
      { name: "声音.webm", blob: new Blob(["audio"]) },
    ]);
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const text = new TextDecoder().decode(bytes);

    expect(zip.type).toBe("application/zip");
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(text).toContain("白板激光笔.webm");
    expect(text).toContain("摄像头.webm");
    expect(text).toContain("声音.webm");
    expect(Array.from(bytes.slice(-22, -18))).toEqual([0x50, 0x4b, 0x05, 0x06]);
  });

  it("rejects material packages that cannot be represented by ZIP32", async () => {
    const oversized = {
      size: 0x1_0000_0000,
    } as Blob;

    await expect(
      createStoredZip([{ name: "摄像头.webm", blob: oversized }]),
    ).rejects.toThrow("超过 4 GiB");
  });
});
