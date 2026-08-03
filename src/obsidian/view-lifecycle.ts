export async function flushBeforeViewSave(
  flush: () => Promise<void>,
  save: () => Promise<void>,
) {
  await flush();
  await save();
}
