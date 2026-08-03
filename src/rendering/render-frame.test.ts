import { OUTPUT_PROFILES } from "./output-profile";
import {
  renderFrameToCanvas,
  type SceneExportOptions,
} from "./render-frame";

describe("renderFrameToCanvas", () => {
  it("passes scene data, the current frame, and exact dimensions to the exporter", async () => {
    const outputCanvas = document.createElement("canvas");
    const elements = [
      { id: "frame-1", type: "frame" },
      { id: "frame-1-text", type: "text", frameId: "frame-1" },
      { id: "frame-2", type: "frame" },
      { id: "frame-2-diamond", type: "diamond", frameId: "frame-2" },
      {
        id: "deleted-frame-1-shape",
        type: "rectangle",
        frameId: "frame-1",
        isDeleted: true,
      },
    ];
    const appState = { exportBackground: false };
    const files = {
      "file-1": { id: "file-1", dataURL: "data:image/png;base64,image" },
    };
    const frame = { id: "frame-1", width: 1080, height: 1440 };
    const receivedOptions: SceneExportOptions[] = [];

    const result = await renderFrameToCanvas(
      {
        elements,
        appState,
        files,
        frame,
        profile: OUTPUT_PROFILES.portraitHigh,
      },
      async (options) => {
        receivedOptions.push(options);
        return outputCanvas;
      },
    );

    const exported = receivedOptions[0]!;
    expect(result).toBe(outputCanvas);
    expect(exported).toBeDefined();
    expect(exported.elements).toEqual([
      elements[0],
      elements[1],
    ]);
    expect(exported.appState).toBe(appState);
    expect(exported.files).toBe(files);
    expect(exported.exportingFrame).toBe(frame);
    expect(exported.getDimensions(1080, 1440)).toEqual({
      width: 1620,
      height: 2160,
      scale: 1.5,
    });
  });
});
