import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../product/output-presets";
import { Teleprompter } from "./Teleprompter";

afterEach(() => {
  vi.useRealTimers();
});

describe("Teleprompter", () => {
  it("collapses settings while keeping playback controls available", () => {
    render(
      <Teleprompter
        open
        settings={DEFAULT_SETTINGS.teleprompter}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    const collapse = screen.getByRole("button", { name: "收起设置" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(collapse);

    expect(screen.getByLabelText("滚动速度")).not.toBeVisible();
    expect(screen.getByLabelText("字体大小")).not.toBeVisible();
    expect(screen.getByLabelText("背景透明度")).not.toBeVisible();
    expect(screen.getByRole("button", { name: "开始滚动" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "展开设置" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );

    fireEvent.click(screen.getByRole("button", { name: "展开设置" }));

    expect(screen.getByLabelText("滚动速度")).toBeInTheDocument();
    expect(screen.getByLabelText("字体大小")).toBeInTheDocument();
    expect(screen.getByLabelText("背景透明度")).toBeInTheDocument();
  });

  it("changes and applies the script font size", () => {
    const changes: number[] = [];
    render(
      <Teleprompter
        open
        settings={DEFAULT_SETTINGS.teleprompter}
        onChange={(settings) => changes.push(settings.fontSize)}
        onClose={() => undefined}
      />,
    );

    const script = screen.getByLabelText("提词器文字");
    const fontSize = screen.getByLabelText("字体大小");

    expect(fontSize).toHaveAttribute("min", "8");
    expect(fontSize).toHaveAttribute("max", "40");
    expect(script).toHaveStyle({ fontSize: "22px" });

    fireEvent.change(fontSize, { target: { value: "32" } });

    expect(changes).toEqual([32]);
  });

  it("accumulates subpixel movement so 8 px/s scrolls in integer-only hosts", () => {
    vi.useFakeTimers();
    render(
      <Teleprompter
        open
        settings={{ ...DEFAULT_SETTINGS.teleprompter, speed: 8, text: "长讲稿" }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );
    const script = screen.getByLabelText("提词器文字");
    const speed = screen.getByLabelText("滚动速度");
    let integerScrollTop = 0;
    Object.defineProperty(script, "scrollTop", {
      configurable: true,
      get: () => integerScrollTop,
      set: (value: number) => {
        integerScrollTop = Math.trunc(value);
      },
    });

    expect(speed).toHaveAttribute("min", "1");
    expect(speed).toHaveAttribute("max", "20");
    fireEvent.click(screen.getByRole("button", { name: "开始滚动" }));
    act(() => vi.advanceTimersByTime(1_000));

    expect(script.scrollTop).toBe(8);
  });
});
