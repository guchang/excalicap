import {
  createProjectStorage,
  type ProjectSnapshot,
  type ProjectStorage,
} from "../project/project-storage";

export interface ObsidianProjectFilePort {
  read(): string;
  write(data: string): void;
  requestSave(): void;
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
): ProjectStorage {
  return createProjectStorage({
    async load() {
      const data = file.read().trim();
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
      file.write(JSON.stringify(snapshot, null, 2));
      file.requestSave();
    },
    async clear() {
      file.write("");
      file.requestSave();
    },
  });
}
