interface NamedWindow {
  name: string;
}

export function ensureLibraryReturnTarget(
  targetWindow: NamedWindow,
  createId: () => string = () => crypto.randomUUID(),
): string {
  if (!targetWindow.name) {
    targetWindow.name = `excalicap-editor-${createId()}`;
  }
  return targetWindow.name;
}
