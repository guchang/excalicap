import { useEffect, useState, type CSSProperties } from "react";
import {
  OUTPUT_PRESETS,
  validateCustomOutput,
} from "../product/output-presets";
import type { ProductSettings } from "../product/types";
import type { DeviceCatalog } from "../media/device-controller";
import { Icon } from "./icons";

export interface SettingsDialogProps {
  readonly open: boolean;
  readonly settings: ProductSettings;
  readonly devices: DeviceCatalog;
  readonly onApply: (settings: ProductSettings) => void;
  readonly onClose: () => void;
}

const backgroundOptions = [
  "#f4f1ea",
  "#ffffff",
  "#111827",
  "linear-gradient(135deg, #fde68a, #fca5a5)",
  "linear-gradient(135deg, #bfdbfe, #ddd6fe)",
  "linear-gradient(135deg, #bbf7d0, #bae6fd)",
];

export function SettingsDialog(props: SettingsDialogProps) {
  const [draft, setDraft] = useState(props.settings);
  useEffect(() => {
    if (props.open) {
      setDraft(props.settings);
    }
  }, [props.open, props.settings]);
  if (!props.open) {
    return null;
  }
  const customErrors =
    draft.outputPreset === "custom"
      ? validateCustomOutput(draft.customWidth, draft.customHeight)
      : [];
  const previewProfile =
    draft.outputPreset === "custom"
      ? { width: draft.customWidth, height: draft.customHeight }
      : OUTPUT_PRESETS[draft.outputPreset];
  const previewAspectRatio = previewProfile.width / previewProfile.height;
  const previewWidth =
    Number.isFinite(previewAspectRatio) && previewAspectRatio > 0
      ? Math.min(380, 540 * previewAspectRatio)
      : 380;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        aria-label="录制设置"
        aria-modal="true"
        className="settings-dialog"
        role="dialog"
      >
        <button
          aria-label="关闭设置"
          className="settings-dialog-close"
          onClick={props.onClose}
          type="button"
        >
          <Icon name="close" />
        </button>
        <div className="settings-preview">
          <header>
            <div>
              <span>实时预览</span>
              <strong>
                {previewProfile.width} × {previewProfile.height}
              </strong>
            </div>
          </header>
          <div className="settings-preview-viewport">
            <div
              aria-label="实时画幅预览"
              className="settings-preview-stage"
              style={{
                aspectRatio: `${previewProfile.width} / ${previewProfile.height}`,
                background: draft.canvas.background,
                width: `${previewWidth}px`,
              }}
            >
              <div
                className="settings-preview-slide"
                style={{
                  borderRadius: `${draft.canvas.slideRadius}px`,
                  inset: `${Math.min(draft.canvas.padding / 2, 32)}px`,
                }}
              >
                <strong>Excalicap</strong>
                <span>你的白板将在这里高清录制</span>
              </div>
              {draft.camera.enabled && (
                <div
                  className={`settings-camera-preview camera-${draft.camera.shape}`}
                  style={{
                    width: `${draft.camera.size * 0.235}px`,
                    height: `${draft.camera.size * 0.235}px`,
                  }}
                />
              )}
            </div>
          </div>
        </div>
        <form
          className="settings-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (customErrors.length === 0) {
              props.onApply(draft);
            }
          }}
        >
          <header>
            <div>
              <span>录制设置</span>
              <h2>画面与设备</h2>
            </div>
          </header>
          <div aria-label="可滚动设置项" className="settings-form-scroll">
            <fieldset className="theme-settings">
              <legend>外观</legend>
              <div className="theme-segmented-control">
                {(["light", "dark"] as const).map((theme) => (
                  <label key={theme}>
                    <input
                      checked={draft.theme === theme}
                      name="theme"
                      onChange={() => setDraft({ ...draft, theme })}
                      type="radio"
                      value={theme}
                    />
                    <span>{theme === "light" ? "浅色" : "深色"}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label>
              <span>画幅比例</span>
              <select
                aria-label="画幅比例"
                value={draft.outputPreset}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    outputPreset: event.target
                      .value as ProductSettings["outputPreset"],
                  })
                }
              >
                <option value="16:9">YouTube · 16:9</option>
                <option value="4:3">经典 · 4:3</option>
                <option value="3:4">小红书 · 3:4</option>
                <option value="9:16">竖屏 · 9:16</option>
                <option value="1:1">正方形 · 1:1</option>
                <option value="portraitHigh">小红书高清 · 3:4</option>
                <option value="custom">自定义</option>
              </select>
            </label>
            {draft.outputPreset === "custom" && (
              <div className="settings-row">
                <label>
                  <span>宽度 px</span>
                  <input
                    aria-label="自定义宽度"
                    type="number"
                    value={draft.customWidth}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        customWidth: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>高度 px</span>
                  <input
                    aria-label="自定义高度"
                    type="number"
                    value={draft.customHeight}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        customHeight: Number(event.target.value),
                      })
                    }
                  />
                </label>
              </div>
            )}
            {customErrors.map((error) => (
              <p className="form-error" key={error}>
                {error}
              </p>
            ))}
            <fieldset>
              <legend>背景</legend>
              <div className="background-swatches">
                {backgroundOptions.map((background) => (
                  <button
                    aria-label={`选择背景 ${background}`}
                    data-selected={draft.canvas.background === background}
                    key={background}
                    onClick={() =>
                      setDraft({
                        ...draft,
                        canvas: { ...draft.canvas, background },
                      })
                    }
                    style={
                      {
                        "--excalicap-swatch-background": background,
                      } as CSSProperties
                    }
                    type="button"
                  />
                ))}
              </div>
            </fieldset>
            <div className="settings-row">
              <label>
                <span>画布留白</span>
                <input
                  aria-label="画布留白"
                  max="96"
                  min="0"
                  type="range"
                  value={draft.canvas.padding}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      canvas: {
                        ...draft.canvas,
                        padding: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
              <label>
                <span>Slide 圆角</span>
                <input
                  aria-label="Slide 圆角"
                  max="48"
                  min="0"
                  type="range"
                  value={draft.canvas.slideRadius}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      canvas: {
                        ...draft.canvas,
                        slideRadius: Number(event.target.value),
                      },
                    })
                  }
                />
              </label>
            </div>
            <fieldset>
              <legend>摄像头</legend>
              <label className="toggle-row">
                <span>显示摄像头</span>
                <input
                  aria-label="显示摄像头"
                  checked={draft.camera.enabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      camera: {
                        ...draft.camera,
                        enabled: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label className="toggle-row">
                <span>镜像画面</span>
                <input
                  aria-label="镜像画面"
                  checked={draft.camera.mirrored}
                  disabled={!draft.camera.enabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      camera: {
                        ...draft.camera,
                        mirrored: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label>
                <span>摄像头设备</span>
                <select
                  aria-label="摄像头设备"
                  value={draft.camera.deviceId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      camera: { ...draft.camera, deviceId: event.target.value },
                    })
                  }
                >
                  <option value="">系统默认</option>
                  {props.devices.cameras.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <fieldset>
              <legend>麦克风</legend>
              <label className="toggle-row">
                <span>录制麦克风</span>
                <input
                  aria-label="录制麦克风"
                  checked={draft.microphone.enabled}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      microphone: {
                        ...draft.microphone,
                        enabled: event.target.checked,
                      },
                    })
                  }
                  type="checkbox"
                />
              </label>
              <label>
                <span>麦克风设备</span>
                <select
                  aria-label="麦克风设备"
                  value={draft.microphone.deviceId}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      microphone: {
                        ...draft.microphone,
                        deviceId: event.target.value,
                      },
                    })
                  }
                >
                  <option value="">系统默认</option>
                  {props.devices.microphones.map((device) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </option>
                  ))}
                </select>
              </label>
            </fieldset>
            <label className="toggle-row">
              <span>在成片中显示光标与激光笔</span>
              <input
                aria-label="显示光标"
                checked={draft.cursor.enabled}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    cursor: { ...draft.cursor, enabled: event.target.checked },
                  })
                }
                type="checkbox"
              />
            </label>
          </div>
          <footer>
            <button
              className="secondary-action"
              onClick={props.onClose}
              type="button"
            >
              取消
            </button>
            <button className="primary-action" type="submit">
              应用设置
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
