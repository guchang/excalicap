export type PresentationFontSizePresetId =
  | "small"
  | "medium"
  | "large"
  | "veryLarge";

export interface PresentationFontSizePreset {
  readonly id: PresentationFontSizePresetId;
  readonly label: string;
  readonly size: number;
}

const BASE_SHORT_SIDE = 1080;
const DEFAULT_PRESET_ID: PresentationFontSizePresetId = "medium";
const BASE_PRESETS = [
  { id: "small", label: "注释", size: 36 },
  { id: "medium", label: "正文", size: 48 },
  { id: "large", label: "小标题", size: 64 },
  { id: "veryLarge", label: "大标题", size: 88 },
] as const satisfies readonly PresentationFontSizePreset[];

export function presentationFontSizePresets(
  slideShortSide: number,
): readonly PresentationFontSizePreset[] {
  const scale = slideShortSide / BASE_SHORT_SIDE;
  return BASE_PRESETS.map((preset) => ({
    ...preset,
    size: Math.round(preset.size * scale),
  }));
}

export function defaultPresentationFontSize(slideShortSide: number) {
  return presentationFontSizePresets(slideShortSide).find(
    ({ id }) => id === DEFAULT_PRESET_ID,
  )!.size;
}

export function installPresentationFontSizeControls(
  root: HTMLElement,
  slideShortSide: number,
  onSelect: (fontSize: number) => void,
) {
  const presets = presentationFontSizePresets(slideShortSide);
  const byTestId = new Map<string, PresentationFontSizePreset>(
    presets.map((preset) => [`fontSize-${preset.id}`, preset] as const),
  );

  const labelButtons = () => {
    for (const [testId, preset] of byTestId) {
      const input = root.querySelector<HTMLInputElement>(
        `[data-testid="${testId}"]`,
      );
      if (!input) {
        continue;
      }
      const label = `${preset.label} ${preset.size} px`;
      input.setAttribute("aria-label", label);
      const control = input.closest<HTMLElement>("label") ?? input;
      control.setAttribute("title", label);
      control.dataset.presentationFontSize = String(preset.size);
      control.dataset.presentationFontLabel = preset.label;
      control.dataset.presentationFontPreset = preset.id;
    }
  };

  const handleClick = (event: MouseEvent) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const control = target.closest<HTMLElement>(
      "[data-presentation-font-preset]",
    );
    const preset = presets.find(
      ({ id }) => id === control?.dataset.presentationFontPreset,
    );
    if (!preset) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    onSelect(preset.size);
  };

  labelButtons();
  const observer = new MutationObserver(labelButtons);
  observer.observe(root, { childList: true, subtree: true });
  root.addEventListener("click", handleClick, true);

  return () => {
    observer.disconnect();
    root.removeEventListener("click", handleClick, true);
  };
}
