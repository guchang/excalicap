export interface ProjectFileWritable {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
}

export interface ProjectFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<ProjectFileWritable>;
}

export interface OpenedProjectFile {
  readonly file: File;
  readonly handle: ProjectFileHandle | null;
}

export type SavedProjectFile =
  | {
      readonly kind: "written";
      readonly handle: ProjectFileHandle;
    }
  | {
      readonly kind: "downloaded";
    };

export interface ProjectFileGateway {
  open(): Promise<OpenedProjectFile | null>;
  save(
    blob: Blob,
    suggestedName: string,
    handle?: ProjectFileHandle | null,
    forceSaveAs?: boolean,
  ): Promise<SavedProjectFile | null>;
}

export interface ProjectFilePickerWindow {
  showOpenFilePicker?: (options: {
    readonly multiple: false;
    readonly types: readonly FilePickerAcceptType[];
  }) => Promise<readonly ProjectFileHandle[]>;
  showSaveFilePicker?: (options: {
    readonly suggestedName: string;
    readonly types: readonly FilePickerAcceptType[];
  }) => Promise<ProjectFileHandle>;
}

interface FilePickerAcceptType {
  readonly description: string;
  readonly accept: Readonly<Record<string, readonly string[]>>;
}

const EXCALIDRAW_FILE_TYPES: readonly FilePickerAcceptType[] = [
  {
    description: "Excalidraw 项目",
    accept: {
      "application/vnd.excalidraw+json": [".excalidraw"],
      "application/json": [".json"],
    },
  },
];

function isPickerCancellation(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function openWithFileInput(documentRef: Document) {
  return new Promise<OpenedProjectFile | null>((resolve) => {
    const input = documentRef.createElement("input");
    input.type = "file";
    input.accept = ".excalidraw,application/vnd.excalidraw+json,application/json";
    input.onchange = () =>
      resolve(
        input.files?.[0]
          ? {
              file: input.files[0],
              handle: null,
            }
          : null,
      );
    input.addEventListener("cancel", () => resolve(null), { once: true });
    input.click();
  });
}

async function writeToHandle(blob: Blob, handle: ProjectFileHandle) {
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

function downloadProject(
  blob: Blob,
  suggestedName: string,
  documentRef: Document,
) {
  const url = URL.createObjectURL(blob);
  const anchor = documentRef.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function createBrowserProjectFileGateway(
  pickerWindow: ProjectFilePickerWindow,
  documentRef: Document,
): ProjectFileGateway {
  return {
    async open() {
      if (!pickerWindow.showOpenFilePicker) {
        return openWithFileInput(documentRef);
      }
      try {
        const [handle] = await pickerWindow.showOpenFilePicker({
          multiple: false,
          types: EXCALIDRAW_FILE_TYPES,
        });
        if (!handle) {
          return null;
        }
        return {
          file: await handle.getFile(),
          handle,
        };
      } catch (error) {
        if (isPickerCancellation(error)) {
          return null;
        }
        throw error;
      }
    },

    async save(blob, suggestedName, handle = null, forceSaveAs = false) {
      if (handle && !forceSaveAs) {
        await writeToHandle(blob, handle);
        return { kind: "written", handle };
      }
      if (!pickerWindow.showSaveFilePicker) {
        downloadProject(blob, suggestedName, documentRef);
        return { kind: "downloaded" };
      }
      try {
        const selectedHandle = await pickerWindow.showSaveFilePicker({
          suggestedName,
          types: EXCALIDRAW_FILE_TYPES,
        });
        await writeToHandle(blob, selectedHandle);
        return { kind: "written", handle: selectedHandle };
      } catch (error) {
        if (isPickerCancellation(error)) {
          return null;
        }
        throw error;
      }
    },
  };
}
