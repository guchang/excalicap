export interface PreservedImageFile {
  readonly id: string;
  readonly dataURL: string;
  readonly mimeType: string;
  readonly created: number;
}

export interface HighResolutionFileImportDependencies {
  createId(file: File): Promise<string>;
  getDataURL(file: File): Promise<string>;
  addFiles(files: readonly PreservedImageFile[]): void;
  now(): number;
}

export function createHighResolutionFileImporter(
  dependencies: HighResolutionFileImportDependencies,
): (file: File) => Promise<string> {
  return async (file) => {
    const [id, dataURL] = await Promise.all([
      dependencies.createId(file),
      dependencies.getDataURL(file),
    ]);
    dependencies.addFiles([
      {
        id,
        dataURL,
        mimeType: file.type,
        created: dependencies.now(),
      },
    ]);
    return id;
  };
}
