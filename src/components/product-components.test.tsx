import {
  act,
  createEvent,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../product/output-presets";
import { ProductTopbar } from "./ProductTopbar";
import { RecordingPreparation } from "./RecordingPreparation";
import { RecordingResult } from "./RecordingResult";
import { SettingsDialog } from "./SettingsDialog";
import { SlideRail } from "./SlideRail";
import { Teleprompter } from "./Teleprompter";

afterEach(() => {
  vi.useRealTimers();
});

describe("ProductTopbar", () => {
  it("shows the original-inspired idle actions without validator chrome", () => {
    render(
      <ProductTopbar
        elapsedText="00:00"
        hasRecordingResult={false}
        recordingState="idle"
        saveStatus="saved"
        onOpenRecordingResult={() => undefined}
        onOpenSettings={() => undefined}
        onOpenTeleprompter={() => undefined}
        onRecord={() => undefined}
        onPause={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "提词器" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "录制" })).toBeEnabled();
    expect(
      screen.queryByRole("button", { name: "素材库" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("创作控制")).toHaveClass(
      "product-control-rail",
    );
    expect(screen.queryByText("已保存")).not.toBeInTheDocument();
  });

  it("only shows the save status when automatic saving fails", () => {
    render(
      <ProductTopbar
        elapsedText="00:00"
        hasRecordingResult={false}
        recordingState="idle"
        saveStatus="failed"
        onOpenRecordingResult={() => undefined}
        onOpenSettings={() => undefined}
        onOpenTeleprompter={() => undefined}
        onRecord={() => undefined}
        onPause={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
  });

  it("replaces the record action with timer and transport controls", () => {
    render(
      <ProductTopbar
        elapsedText="01:24"
        hasRecordingResult={false}
        recordingState="recording"
        saveStatus="saved"
        onOpenRecordingResult={() => undefined}
        onOpenSettings={() => undefined}
        onOpenTeleprompter={() => undefined}
        onRecord={() => undefined}
        onPause={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(screen.getByText("01:24")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "暂停" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "停止" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "录制" })).not.toBeInTheDocument();
  });

  it("locks destructive controls while preparing and finalizing a recording", () => {
    const props = {
      elapsedText: "01:24",
      hasRecordingResult: false,
      saveStatus: "saved" as const,
      onOpenRecordingResult: () => undefined,
      onOpenSettings: () => undefined,
      onOpenTeleprompter: () => undefined,
      onRecord: () => undefined,
      onPause: () => undefined,
      onResume: () => undefined,
      onStop: () => undefined,
    };
    const { rerender } = render(
      <ProductTopbar {...props} recordingState="preparing" />,
    );

    expect(screen.getByRole("button", { name: "设置" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "录制" })).toBeDisabled();

    rerender(<ProductTopbar {...props} recordingState="stopping" />);

    expect(screen.getByRole("button", { name: "设置" })).toBeDisabled();
    expect(screen.getByText("正在完成录制…")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "暂停" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "停止" })).not.toBeInTheDocument();
  });

  it("only shows the last recording action when a result exists", () => {
    const open = vi.fn();
    const { rerender } = render(
      <ProductTopbar
        elapsedText="00:00"
        hasRecordingResult={false}
        recordingState="idle"
        saveStatus="saved"
        onOpenRecordingResult={open}
        onOpenSettings={() => undefined}
        onOpenTeleprompter={() => undefined}
        onPause={() => undefined}
        onRecord={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "上次录制" }),
    ).not.toBeInTheDocument();

    rerender(
      <ProductTopbar
        elapsedText="00:00"
        hasRecordingResult
        recordingState="idle"
        saveStatus="saved"
        onOpenRecordingResult={open}
        onOpenSettings={() => undefined}
        onOpenTeleprompter={() => undefined}
        onPause={() => undefined}
        onRecord={() => undefined}
        onResume={() => undefined}
        onStop={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "上次录制" }));

    expect(open).toHaveBeenCalledOnce();
  });
});

describe("RecordingResult", () => {
  const composite = {
    url: "blob:composite",
    fileName: "Excalicap-20260729-120000.webm",
    size: 2_000_000,
    type: "video/webm",
  };
  const camera = {
    url: "blob:camera",
    fileName: "Excalicap-camera-20260729-120000.webm",
    size: 1_000_000,
    type: "video/webm",
  };

  it("shows separate composite and camera downloads", () => {
    render(
      <RecordingResult
        error={null}
        open
        result={{
          camera,
          cameraError: null,
          completedAt: 0,
          composite,
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByRole("link", { name: "下载合成视频" }),
    ).toHaveAttribute("href", "blob:composite");
    expect(
      screen.getByRole("link", { name: "下载摄像头原片" }),
    ).toHaveAttribute("href", "blob:camera");
    expect(screen.getByText("原始矩形画面 + 麦克风声音")).toBeInTheDocument();
  });

  it("explains when the recording has no camera source", () => {
    render(
      <RecordingResult
        error={null}
        open
        result={{
          camera: null,
          cameraError: null,
          completedAt: 0,
          composite,
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByText("本次未启用摄像头，因此没有摄像头原片。"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: "下载摄像头原片" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the composite download when the camera recording fails", () => {
    render(
      <RecordingResult
        error={null}
        open
        result={{
          camera: null,
          cameraError: "摄像头编码失败",
          completedAt: 0,
          composite,
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByRole("link", { name: "下载合成视频" }),
    ).toBeEnabled();
    expect(
      screen.getByText("摄像头原片生成失败：摄像头编码失败。合成成片仍可下载。"),
    ).toBeInTheDocument();
  });

  it("stays hidden when closed even if a result is retained", () => {
    render(
      <RecordingResult
        error={null}
        open={false}
        result={{
          camera,
          cameraError: null,
          completedAt: 0,
          composite,
        }}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.queryByRole("dialog", { name: "录制结果" }),
    ).not.toBeInTheDocument();
  });
});

describe("SlideRail", () => {
  it("opens actions for the right-clicked Slide", () => {
    const exported: string[] = [];
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onExport={(id) => exported.push(id)}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-2"]')!,
      { clientX: 120, clientY: 180 },
    );

    expect(screen.getByRole("menu", { name: "Slide 2 操作" })).toBeVisible();
    fireEvent.click(screen.getByRole("menuitem", { name: "导出为 PNG" }));
    expect(exported).toEqual(["slide-2"]);
    expect(
      screen.queryByRole("menu", { name: "Slide 2 操作" }),
    ).not.toBeInTheDocument();
  });

  it("opens the Slide menu to the left of the navigation rail", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[{ id: "slide-1", name: "Slide 1" }]}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "转到 Slide 1" });
    const rail = screen.getByRole("complementary", {
      name: "幻灯片导航",
    });
    vi.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      bottom: 260,
      height: 32,
      left: 900,
      right: 932,
      top: 228,
      width: 32,
      x: 900,
      y: 228,
      toJSON: () => undefined,
    });
    vi.spyOn(rail, "getBoundingClientRect").mockReturnValue({
      bottom: 600,
      height: 400,
      left: 880,
      right: 938,
      top: 200,
      width: 58,
      x: 880,
      y: 200,
      toJSON: () => undefined,
    });

    fireEvent.contextMenu(trigger, { clientX: 916, clientY: 244 });

    expect(screen.getByRole("menu", { name: "Slide 1 操作" })).toHaveStyle({
      left: "692px",
    });
  });

  it("supports keyboard navigation and restores focus after closing the menu", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "转到 Slide 2" });

    fireEvent.contextMenu(trigger);
    const exportAction = screen.getByRole("menuitem", { name: "导出为 PNG" });
    const deleteAction = screen.getByRole("menuitem", { name: "删除 Slide" });

    expect(exportAction).toHaveFocus();
    fireEvent.keyDown(exportAction, { key: "ArrowDown" });
    expect(deleteAction).toHaveFocus();
    fireEvent.keyDown(deleteAction, { key: "Escape" });
    expect(trigger).toHaveFocus();
  });

  it("closes the Slide menu with Escape", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[{ id: "slide-1", name: "Slide 1" }]}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-1"]')!,
    );
    fireEvent.keyDown(window, { key: "Escape" });

    expect(
      screen.queryByRole("menu", { name: "Slide 1 操作" }),
    ).not.toBeInTheDocument();
  });

  it("closes the Slide menu when clicking outside", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[{ id: "slide-1", name: "Slide 1" }]}
        onAdd={() => undefined}
        onDelete={() => undefined}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-1"]')!,
    );
    fireEvent.pointerDown(document.body);

    expect(
      screen.queryByRole("menu", { name: "Slide 1 操作" }),
    ).not.toBeInTheDocument();
  });

  it("confirms before deleting the right-clicked Slide", () => {
    const deleted: string[] = [];
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => undefined}
        onDelete={(id) => deleted.push(id)}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-2"]')!,
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "删除 Slide" }));

    expect(deleted).toEqual([]);
    expect(
      screen.getByRole("dialog", { name: "删除 Slide 2？" }),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "确认删除 Slide" }));
    expect(deleted).toEqual(["slide-2"]);
  });

  it("traps focus in the delete dialog and cancels with Escape", () => {
    const onDelete = vi.fn();
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => undefined}
        onDelete={onDelete}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );
    const trigger = screen.getByRole("button", { name: "转到 Slide 2" });

    fireEvent.contextMenu(trigger);
    fireEvent.click(screen.getByRole("menuitem", { name: "删除 Slide" }));
    const cancel = screen.getByRole("button", { name: "取消" });
    const confirm = screen.getByRole("button", { name: "确认删除 Slide" });

    expect(cancel).toHaveFocus();
    fireEvent.keyDown(cancel, { key: "Tab", shiftKey: true });
    expect(confirm).toHaveFocus();
    fireEvent.keyDown(confirm, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(trigger).toHaveFocus();
  });

  it("disables deletion when only one Slide remains", () => {
    const onDelete = vi.fn();
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[{ id: "slide-1", name: "Slide 1" }]}
        onAdd={() => undefined}
        onDelete={onDelete}
        onExport={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.contextMenu(
      document.querySelector<HTMLElement>('[data-slide-id="slide-1"]')!,
    );
    const deleteAction = screen.getByRole("menuitem", {
      name: "删除 Slide",
    });

    expect(deleteAction).toBeDisabled();
    fireEvent.click(deleteAction);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does not render unusable Slide actions while dragging", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.dragStart(
      document.querySelector<HTMLElement>('[data-slide-id="slide-1"]')!,
    );

    expect(
      screen.queryByRole("button", { name: "复制 Slide 1" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "删除 Slide 1" }),
    ).not.toBeInTheDocument();
  });

  it("navigates, adds, and reorders Slides", () => {
    const events: string[] = [];
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
        ]}
        onAdd={() => events.push("add")}
        onNavigate={(id) => events.push(`navigate:${id}`)}
        onReorder={(ids) => events.push(`reorder:${ids.join(",")}`)}
      />,
    );

    expect(screen.getByText("幻灯片")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "转到 Slide 2" }));
    fireEvent.click(screen.getByRole("button", { name: "添加幻灯片" }));

    const first = screen.getByRole("button", { name: "转到 Slide 1" });
    const dropSlots = document.querySelectorAll(".slide-rail-drop-slot");
    fireEvent.dragStart(first);
    fireEvent.dragEnter(dropSlots[2]);
    fireEvent.drop(dropSlots[2]);

    expect(events).toEqual([
      "navigate:slide-2",
      "add",
      "reorder:slide-2,slide-1",
    ]);
  });

  it("reorders when a drag leaves the gap and drops on a Slide item", () => {
    const reorders: string[][] = [];
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
          { id: "slide-3", name: "Slide 3" },
        ]}
        onAdd={() => undefined}
        onNavigate={() => undefined}
        onReorder={(ids) => reorders.push(ids)}
      />,
    );

    const source = document.querySelector<HTMLElement>(
      '[data-slide-id="slide-1"]',
    )!;
    const target = document.querySelector<HTMLElement>(
      '[data-slide-id="slide-3"]',
    )!;
    vi.spyOn(target, "getBoundingClientRect").mockReturnValue({
      bottom: 134,
      height: 34,
      left: 0,
      right: 38,
      top: 100,
      width: 38,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    });

    fireEvent.dragStart(source);
    fireEvent.dragEnter(document.querySelectorAll(".slide-rail-drop-slot")[2]);
    const dragOver = createEvent.dragOver(target);
    Object.defineProperty(dragOver, "clientY", { value: 108 });
    fireEvent(target, dragOver);
    const drop = createEvent.drop(target);
    Object.defineProperty(drop, "clientY", { value: 108 });
    fireEvent(target, drop);

    expect(reorders).toEqual([["slide-2", "slide-1", "slide-3"]]);
  });

  it("does not show an active insertion line for the original slot", () => {
    render(
      <SlideRail
        currentSlideId="slide-2"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
          { id: "slide-3", name: "Slide 3" },
        ]}
        onAdd={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    const source = document.querySelector<HTMLElement>(
      '[data-slide-id="slide-2"]',
    )!;
    fireEvent.dragStart(source);

    expect(
      document.querySelector('.slide-rail-drop-slot[data-active="true"]'),
    ).toBeNull();
    expect(source).toHaveAttribute("data-drag-source", "true");
  });

  it("clears the insertion line after leaving the Slide rail", () => {
    render(
      <SlideRail
        currentSlideId="slide-1"
        slides={[
          { id: "slide-1", name: "Slide 1" },
          { id: "slide-2", name: "Slide 2" },
          { id: "slide-3", name: "Slide 3" },
        ]}
        onAdd={() => undefined}
        onNavigate={() => undefined}
        onReorder={() => undefined}
      />,
    );

    fireEvent.dragStart(
      document.querySelector<HTMLElement>('[data-slide-id="slide-1"]')!,
    );
    fireEvent.dragEnter(document.querySelectorAll(".slide-rail-drop-slot")[2]);
    expect(
      document.querySelector('.slide-rail-drop-slot[data-active="true"]'),
    ).not.toBeNull();

    const list = document.querySelector<HTMLElement>(".slide-rail-list")!;
    const leave = createEvent.dragLeave(list);
    Object.defineProperty(leave, "relatedTarget", { value: document.body });
    fireEvent(list, leave);

    expect(
      document.querySelector('.slide-rail-drop-slot[data-active="true"]'),
    ).toBeNull();
  });
});

describe("SettingsDialog", () => {
  it("applies the selected appearance theme", () => {
    const applied: string[] = [];
    render(
      <SettingsDialog
        devices={{ cameras: [], microphones: [] }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={(settings) => applied.push(JSON.stringify(settings))}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "深色" }));
    fireEvent.click(screen.getByRole("button", { name: "应用设置" }));

    expect(JSON.parse(applied[0])).toMatchObject({ theme: "dark" });
  });

  it("labels the high-resolution 3:4 preset for Xiaohongshu", () => {
    render(
      <SettingsDialog
        devices={{ cameras: [], microphones: [] }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    expect(
      screen.getByRole("option", { name: "小红书高清 · 3:4" }),
    ).toHaveValue("portraitHigh");
  });

  it("places the close action at the dialog level", () => {
    render(
      <SettingsDialog
        devices={{ cameras: [], microphones: [] }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    const dialog = screen.getByRole("dialog", { name: "录制设置" });
    const close = screen.getByRole("button", { name: "关闭设置" });

    expect(close.parentElement).toBe(dialog);
  });

  it("resizes the live preview to the selected aspect ratio", () => {
    render(
      <SettingsDialog
        devices={{ cameras: [], microphones: [] }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("画幅比例"), {
      target: { value: "9:16" },
    });

    expect(screen.getByText("1080 × 1920")).toBeInTheDocument();
    expect(screen.getByLabelText("实时画幅预览")).toHaveStyle({
      aspectRatio: "1080 / 1920",
      width: "303.75px",
    });
  });

  it("keeps cancel and apply actions outside the scrolling settings", () => {
    render(
      <SettingsDialog
        devices={{ cameras: [], microphones: [] }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={() => undefined}
        onClose={() => undefined}
      />,
    );

    const scrollingSettings = screen.getByLabelText("可滚动设置项");

    expect(scrollingSettings).not.toContainElement(
      screen.getByRole("button", { name: "取消" }),
    );
    expect(scrollingSettings).not.toContainElement(
      screen.getByRole("button", { name: "应用设置" }),
    );
  });

  it("edits output and independent media settings before applying", () => {
    const applied: string[] = [];
    render(
      <SettingsDialog
        devices={{
          cameras: [{ deviceId: "cam", label: "USB Camera" }],
          microphones: [{ deviceId: "mic", label: "USB Microphone" }],
        }}
        open
        settings={DEFAULT_SETTINGS}
        onApply={(settings) =>
          applied.push(
            `${settings.outputPreset}:${settings.camera.enabled}:${settings.camera.mirrored}:${settings.microphone.deviceId}`,
          )
        }
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("画幅比例"), {
      target: { value: "16:9" },
    });
    fireEvent.click(screen.getByLabelText("显示摄像头"));
    fireEvent.click(screen.getByLabelText("镜像画面"));
    fireEvent.change(screen.getByLabelText("麦克风设备"), {
      target: { value: "mic" },
    });
    fireEvent.click(screen.getByRole("button", { name: "应用设置" }));

    expect(applied).toEqual(["16:9:false:false:mic"]);
  });
});

describe("Teleprompter", () => {
  it("edits the script and controls scrolling without rendering a canvas", () => {
    const texts: string[] = [];
    render(
      <Teleprompter
        open
        settings={{ ...DEFAULT_SETTINGS.teleprompter, text: "原稿" }}
        onChange={(settings) => texts.push(settings.text)}
        onClose={() => undefined}
      />,
    );

    fireEvent.change(screen.getByLabelText("提词器文字"), {
      target: { value: "新稿" },
    });
    expect(texts).toEqual(["新稿"]);
    expect(screen.getByRole("button", { name: "开始滚动" })).toBeEnabled();
    expect(screen.queryByRole("canvas")).not.toBeInTheDocument();
  });

  it("changes background opacity and scrolls manually with arrow keys", () => {
    const changes: number[] = [];
    render(
      <Teleprompter
        open
        settings={{ ...DEFAULT_SETTINGS.teleprompter, text: "长讲稿" }}
        onChange={(settings) => changes.push(settings.opacity)}
        onClose={() => undefined}
      />,
    );
    const script = screen.getByLabelText("提词器文字");
    Object.defineProperty(script, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });

    fireEvent.change(screen.getByLabelText("背景透明度"), {
      target: { value: "0.64" },
    });
    fireEvent.keyDown(window, { key: "ArrowDown" });
    fireEvent.keyDown(window, { key: "ArrowDown", shiftKey: true });

    expect(changes).toEqual([0.64]);
    expect(script.scrollTop).toBe(144);
    expect(
      screen.getByText("↑↓ 手动滚动 · 空格 播放/暂停"),
    ).toBeInTheDocument();
  });

  it("scrolls by pixels per second across the slower speed range", () => {
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
    Object.defineProperty(script, "scrollTop", {
      configurable: true,
      value: 0,
      writable: true,
    });
    const speed = screen.getByLabelText("滚动速度");

    expect(speed).toHaveAttribute("min", "1");
    expect(speed).toHaveAttribute("max", "20");
    expect(screen.getByText("8 px/s")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "开始滚动" }));
    act(() => vi.advanceTimersByTime(1_000));

    expect(script.scrollTop).toBeCloseTo(8);
  });

  it("toggles scrolling with Space except while editing text", () => {
    render(
      <Teleprompter
        open
        settings={{ ...DEFAULT_SETTINGS.teleprompter, text: "讲稿" }}
        onChange={() => undefined}
        onClose={() => undefined}
      />,
    );

    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("button", { name: "停止滚动" })).toBeEnabled();
    fireEvent.keyDown(window, { key: " " });
    expect(screen.getByRole("button", { name: "开始滚动" })).toBeEnabled();

    const script = screen.getByLabelText("提词器文字");
    script.focus();
    fireEvent.keyDown(script, { key: " " });
    expect(screen.getByRole("button", { name: "开始滚动" })).toBeEnabled();
  });

  it("drags within the viewport and persists size changes from its resize handle", () => {
    const sizes: Array<[number, number]> = [];
    render(
      <Teleprompter
        open
        settings={DEFAULT_SETTINGS.teleprompter}
        onChange={(settings) => sizes.push([settings.width, settings.height])}
        onClose={() => undefined}
      />,
    );

    fireEvent.pointerDown(screen.getByLabelText("拖动提词器"), {
      clientX: 500,
      clientY: 100,
      pointerId: 1,
    });
    fireEvent.pointerMove(window, {
      clientX: 600,
      clientY: 180,
      pointerId: 1,
    });
    expect(screen.getByLabelText("提词器").style.left).not.toBe("");

    fireEvent.pointerDown(screen.getByLabelText("调整提词器大小"), {
      clientX: 500,
      clientY: 300,
      pointerId: 2,
    });
    fireEvent.pointerMove(window, {
      clientX: 580,
      clientY: 360,
      pointerId: 2,
    });
    expect(sizes.at(-1)).toEqual([500, 320]);
  });
});

describe("RecordingPreparation", () => {
  it("disables repeated starts while the recording session is being created", () => {
    render(
      <RecordingPreparation
        blockingIssues={[]}
        camera={DEFAULT_SETTINGS.camera}
        cameraDeviceName={null}
        hasCamera
        hasMicrophone={false}
        microphoneDeviceName={null}
        microphoneEnabled={false}
        mimeType="video/webm"
        open
        profile={{ width: 1080, height: 1440, fps: 30 }}
        starting
        warnings={[]}
        onCameraChange={() => undefined}
        onCameraReset={() => undefined}
        onCancel={() => undefined}
        onChangeDevices={() => undefined}
        onStart={() => undefined}
      />,
    );

    expect(screen.getByRole("button", { name: "正在开始录制" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "更换设备" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "返回编辑" })).toBeDisabled();
    expect(screen.getByLabelText("镜像摄像头")).toBeDisabled();
    expect(screen.getByRole("button", { name: "圆角摄像头" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "重置摄像头位置" }),
    ).toBeDisabled();
  });

  it("offers camera mirror, shape, and reset controls before recording", () => {
    const changes: string[] = [];
    render(
      <RecordingPreparation
        blockingIssues={[]}
        camera={DEFAULT_SETTINGS.camera}
        cameraDeviceName="FaceTime HD Camera"
        hasCamera
        hasMicrophone
        microphoneDeviceName="MacBook Pro 麦克风"
        microphoneEnabled
        mimeType="video/mp4"
        open
        profile={{ width: 1080, height: 1440, fps: 30 }}
        warnings={[]}
        onCameraChange={(camera) =>
          changes.push(`${camera.mirrored}:${camera.shape}`)
        }
        onCameraReset={() => changes.push("reset")}
        onCancel={() => undefined}
        onChangeDevices={() => changes.push("devices")}
        onStart={() => undefined}
      />,
    );

    fireEvent.click(screen.getByLabelText("镜像摄像头"));
    fireEvent.click(screen.getByRole("button", { name: "圆角摄像头" }));
    fireEvent.click(screen.getByRole("button", { name: "重置摄像头位置" }));
    fireEvent.click(screen.getByRole("button", { name: "更换设备" }));

    expect(changes).toEqual([
      "false:circle",
      "true:rounded",
      "reset",
      "devices",
    ]);
    expect(screen.getByText("FaceTime HD Camera")).toHaveAttribute(
      "title",
      "FaceTime HD Camera",
    );
    expect(screen.getByText("MacBook Pro 麦克风")).toHaveAttribute(
      "title",
      "MacBook Pro 麦克风",
    );
    expect(screen.getByText("video/mp4")).toHaveClass(
      "preparation-summary-value",
    );
    expect(screen.getByText("video/mp4")).toHaveAttribute(
      "title",
      "video/mp4",
    );
    expect(screen.getByText(/拖动摄像头调整位置/)).toBeInTheDocument();
  });

  it("distinguishes unavailable device names, disabled devices, and failed devices", () => {
    const { rerender } = render(
      <RecordingPreparation
        blockingIssues={[]}
        camera={DEFAULT_SETTINGS.camera}
        cameraDeviceName=""
        hasCamera
        hasMicrophone
        microphoneDeviceName=""
        microphoneEnabled
        mimeType="video/mp4"
        open
        profile={{ width: 1080, height: 1440, fps: 30 }}
        warnings={[]}
        onCameraChange={() => undefined}
        onCameraReset={() => undefined}
        onCancel={() => undefined}
        onChangeDevices={() => undefined}
        onStart={() => undefined}
      />,
    );

    expect(
      screen.getAllByText("已连接，但浏览器未提供设备名称"),
    ).toHaveLength(2);

    rerender(
      <RecordingPreparation
        blockingIssues={[]}
        camera={{ ...DEFAULT_SETTINGS.camera, enabled: false }}
        cameraDeviceName={null}
        hasCamera={false}
        hasMicrophone={false}
        microphoneDeviceName={null}
        microphoneEnabled={false}
        mimeType="video/mp4"
        open
        profile={{ width: 1080, height: 1440, fps: 30 }}
        warnings={[]}
        onCameraChange={() => undefined}
        onCameraReset={() => undefined}
        onCancel={() => undefined}
        onChangeDevices={() => undefined}
        onStart={() => undefined}
      />,
    );

    expect(screen.getByText("未启用")).toBeInTheDocument();
    expect(screen.getByText("未启用，将进行无声录制")).toBeInTheDocument();

    rerender(
      <RecordingPreparation
        blockingIssues={[]}
        camera={DEFAULT_SETTINGS.camera}
        cameraDeviceName={null}
        hasCamera={false}
        hasMicrophone={false}
        microphoneDeviceName={null}
        microphoneEnabled
        mimeType="video/mp4"
        open
        profile={{ width: 1080, height: 1440, fps: 30 }}
        warnings={[]}
        onCameraChange={() => undefined}
        onCameraReset={() => undefined}
        onCancel={() => undefined}
        onChangeDevices={() => undefined}
        onStart={() => undefined}
      />,
    );

    expect(screen.getAllByText("连接失败")).toHaveLength(2);
  });
});
