import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  installPresentationFontSizeControls,
  presentationFontSizePresets,
} from "./font-size-presets";

describe("presentationFontSizePresets", () => {
  it("uses readable video-presentation sizes at a 1080 px short side", () => {
    expect(presentationFontSizePresets(1080)).toEqual([
      { id: "small", label: "注释", size: 36 },
      { id: "medium", label: "正文", size: 48 },
      { id: "large", label: "小标题", size: 64 },
      { id: "veryLarge", label: "大标题", size: 88 },
    ]);
  });

  it("scales the presets with the Slide short side", () => {
    expect(presentationFontSizePresets(1620).map(({ size }) => size)).toEqual([
      54, 72, 96, 132,
    ]);
  });
});

describe("installPresentationFontSizeControls", () => {
  it("relabels and routes the native buttons to presentation sizes", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <label><input data-testid="fontSize-small" type="radio"><svg></svg></label>
      <label><input data-testid="fontSize-medium" type="radio"><svg></svg></label>
      <label><input data-testid="fontSize-large" type="radio"><svg></svg></label>
      <label><input data-testid="fontSize-veryLarge" type="radio"><svg></svg></label>
    `;
    const onSelect = vi.fn();
    const dispose = installPresentationFontSizeControls(root, 1080, onSelect);

    const bodyInput = root.querySelector<HTMLInputElement>(
      '[data-testid="fontSize-medium"]',
    )!;
    const bodyControl = bodyInput.closest("label")!;
    expect(bodyInput).toHaveAttribute("aria-label", "正文 48 px");
    expect(bodyControl).toHaveAttribute("title", "正文 48 px");
    expect(bodyControl).toHaveAttribute("data-presentation-font-size", "48");

    fireEvent.click(bodyControl.querySelector("svg")!);
    expect(onSelect).toHaveBeenCalledWith(48);
    dispose();
  });
});
