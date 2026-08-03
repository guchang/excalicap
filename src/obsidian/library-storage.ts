import {
  createPermanentLibraryAdapter,
  type PermanentLibraryAdapter,
} from "../library/library-storage";

export interface ObsidianPluginDataPort {
  loadData(): Promise<unknown>;
  saveData(data: unknown): Promise<void>;
}

function objectData(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function createObsidianLibraryAdapter(
  pluginData: ObsidianPluginDataPort,
): PermanentLibraryAdapter {
  return createPermanentLibraryAdapter({
    async load() {
      return objectData(await pluginData.loadData()).library ?? null;
    },
    async save(record) {
      const current = objectData(await pluginData.loadData());
      await pluginData.saveData({
        ...current,
        library: record,
      });
    },
  });
}
