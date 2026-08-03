export interface SceneImage {
  readonly id: string;
  readonly type: "image";
  readonly fileId: string | null;
  readonly width: number;
  readonly height: number;
}

export interface SceneBinaryFile {
  readonly id: string;
  readonly dataURL: string;
}

export interface FontRequirement {
  readonly family: string;
  readonly text: string;
}

export interface PreflightIssue {
  readonly code:
    | "image-file-id-missing"
    | "image-file-missing"
    | "image-resolution-low"
    | "font-unavailable";
  readonly message: string;
  readonly elementId?: string;
}

export interface PreflightResult {
  readonly blocking: readonly PreflightIssue[];
  readonly warnings: readonly PreflightIssue[];
}

export interface PreflightDependencies {
  decodeImage(dataUrl: string): Promise<{ width: number; height: number }>;
  checkFont(font: string, text: string): boolean;
}

export interface ScenePreflightInput {
  readonly images: readonly SceneImage[];
  readonly files: Readonly<Record<string, SceneBinaryFile>>;
  readonly scale: number;
  readonly fonts: readonly FontRequirement[];
}

export async function runScenePreflight(
  input: ScenePreflightInput,
  dependencies: PreflightDependencies,
): Promise<PreflightResult> {
  const blocking: PreflightIssue[] = [];
  const warnings: PreflightIssue[] = [];

  for (const image of input.images) {
    if (!image.fileId) {
      blocking.push({
        code: "image-file-id-missing",
        elementId: image.id,
        message: `图片 ${image.id} 缺少 fileId`,
      });
      continue;
    }

    const file = input.files[image.fileId];
    if (!file) {
      blocking.push({
        code: "image-file-missing",
        elementId: image.id,
        message: `图片 ${image.id} 引用的文件 ${image.fileId} 不存在`,
      });
      continue;
    }

    const source = await dependencies.decodeImage(file.dataURL);
    const targetWidth = image.width * input.scale;
    const targetHeight = image.height * input.scale;

    if (source.width < targetWidth || source.height < targetHeight) {
      warnings.push({
        code: "image-resolution-low",
        elementId: image.id,
        message: `图片 ${image.id} 原图 ${source.width}×${source.height} px，小于目标显示 ${targetWidth}×${targetHeight} px`,
      });
    }
  }

  for (const font of input.fonts) {
    if (!dependencies.checkFont(font.family, font.text)) {
      blocking.push({
        code: "font-unavailable",
        message: `字体 ${font.family} 无法渲染测试文本：${font.text}`,
      });
    }
  }

  return { blocking, warnings };
}
