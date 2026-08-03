import { runScenePreflight } from "./preflight";

const highResolutionFile = {
  id: "file-1",
  dataURL: "data:image/png;base64,high-resolution",
};

const imageElement = {
  id: "image-1",
  type: "image" as const,
  fileId: "file-1",
  width: 800,
  height: 600,
};

describe("runScenePreflight", () => {
  it("blocks an image element that has no file reference", async () => {
    const result = await runScenePreflight(
      {
        images: [{ ...imageElement, fileId: null }],
        files: {},
        scale: 1.5,
        fonts: [],
      },
      {
        decodeImage: async () => ({ width: 2400, height: 1800 }),
        checkFont: () => true,
      },
    );

    expect(result.blocking).toEqual([
      {
        code: "image-file-id-missing",
        elementId: "image-1",
        message: "图片 image-1 缺少 fileId",
      },
    ]);
  });

  it("blocks an image whose referenced binary file is absent", async () => {
    const result = await runScenePreflight(
      {
        images: [imageElement],
        files: {},
        scale: 1.5,
        fonts: [],
      },
      {
        decodeImage: async () => ({ width: 2400, height: 1800 }),
        checkFont: () => true,
      },
    );

    expect(result.blocking[0]).toEqual({
      code: "image-file-missing",
      elementId: "image-1",
      message: "图片 image-1 引用的文件 file-1 不存在",
    });
  });

  it("warns when decoded source pixels are below target display pixels", async () => {
    const result = await runScenePreflight(
      {
        images: [imageElement],
        files: { "file-1": highResolutionFile },
        scale: 2,
        fonts: [],
      },
      {
        decodeImage: async () => ({ width: 1200, height: 900 }),
        checkFont: () => true,
      },
    );

    expect(result.warnings).toEqual([
      {
        code: "image-resolution-low",
        elementId: "image-1",
        message: "图片 image-1 原图 1200×900 px，小于目标显示 1600×1200 px",
      },
    ]);
  });

  it("accepts a decoded source that covers its target display size", async () => {
    const result = await runScenePreflight(
      {
        images: [imageElement],
        files: { "file-1": highResolutionFile },
        scale: 1.5,
        fonts: [],
      },
      {
        decodeImage: async () => ({ width: 2400, height: 1800 }),
        checkFont: () => true,
      },
    );

    expect(result).toEqual({ blocking: [], warnings: [] });
  });

  it("blocks recording when a required font is unavailable", async () => {
    const result = await runScenePreflight(
      {
        images: [],
        files: {},
        scale: 1,
        fonts: [{ family: "Excalifont", text: "中文 ABC 123" }],
      },
      {
        decodeImage: async () => ({ width: 1, height: 1 }),
        checkFont: () => false,
      },
    );

    expect(result.blocking).toEqual([
      {
        code: "font-unavailable",
        message: "字体 Excalifont 无法渲染测试文本：中文 ABC 123",
      },
    ]);
  });
});
