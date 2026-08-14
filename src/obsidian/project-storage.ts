import {
  createProjectStorage,
  type ProjectSnapshot,
  type ProjectStorage,
} from "../project/project-storage";

export interface ObsidianProjectFilePort {
  read(): string;
  readPersisted?(): Promise<string>;
  write(data: string): void;
  requestSave(): void;
  persist?(): Promise<void>;
}

export interface ObsidianProjectStorage extends ProjectStorage {
  acceptExternalData(data: string): void;
}

function projectContent(snapshot: ProjectSnapshot) {
  const { updatedAt: _updatedAt, ...content } = snapshot;
  return JSON.stringify(content);
}

function hasSameProjectContent(data: string, snapshot: ProjectSnapshot) {
  if (!data.trim()) {
    return false;
  }
  try {
    const current = JSON.parse(data) as ProjectSnapshot;
    return projectContent(current) === projectContent(snapshot);
  } catch {
    return false;
  }
}

export function createObsidianProjectStorage(
  file: ObsidianProjectFilePort,
): ObsidianProjectStorage {
  let loadedContents = file.read().trim();

  const storage = createProjectStorage({
    async load() {
      const data = file.read().trim();
      loadedContents = data;
      if (!data) {
        return null;
      }
      try {
        return JSON.parse(data) as ProjectSnapshot;
      } catch {
        throw new Error("当前 .excalicap 文件不是有效的项目文件");
      }
    },
    async save(snapshot) {
      if (hasSameProjectContent(file.read(), snapshot)) {
        return;
      }
      if (loadedContents !== null && file.readPersisted) {
        const persistedContents = (await file.readPersisted()).trim();
        if (persistedContents !== loadedContents) {
          throw new Error(
            "检测到磁盘文件被另一个程序、同步服务或脚本修改。为避免覆盖外部修改，本次自动保存已停止；请检查文件的最新内容后再继续编辑。",
          );
        }
      }
      const nextContents = JSON.stringify(snapshot, null, 2);
      file.write(nextContents);
      if (file.persist) {
        await file.persist();
      } else {
        file.requestSave();
      }
      loadedContents = nextContents;
    },
    async clear() {
      file.write("");
      if (file.persist) {
        await file.persist();
      } else {
        file.requestSave();
      }
      loadedContents = "";
    },
  });
  return {
    ...storage,
    acceptExternalData(data) {
      loadedContents = data.trim();
    },
  };
}
