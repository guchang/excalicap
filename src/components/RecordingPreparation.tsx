import type { OutputProfile } from "../rendering/output-profile";
import type { CameraSettings } from "../product/types";

export interface RecordingPreparationProps {
  readonly open: boolean;
  readonly profile: OutputProfile;
  readonly mimeType: string;
  readonly warnings: readonly string[];
  readonly blockingIssues: readonly string[];
  readonly hasCamera: boolean;
  readonly hasMicrophone: boolean;
  readonly cameraDeviceName: string | null;
  readonly microphoneDeviceName: string | null;
  readonly microphoneEnabled: boolean;
  readonly starting?: boolean;
  readonly camera: CameraSettings;
  readonly onCameraChange: (camera: CameraSettings) => void;
  readonly onCameraReset: () => void;
  readonly onCancel: () => void;
  readonly onChangeDevices: () => void;
  readonly onStart: () => void;
}

function deviceName(
  enabled: boolean,
  connected: boolean,
  name: string | null,
  disabledText: string,
) {
  if (!enabled) {
    return disabledText;
  }
  if (!connected) {
    return "连接失败";
  }
  return name?.trim() || "已连接，但浏览器未提供设备名称";
}

export function RecordingPreparation(props: RecordingPreparationProps) {
  if (!props.open) {
    return null;
  }
  const cameraName = deviceName(
    props.camera.enabled,
    props.hasCamera,
    props.cameraDeviceName,
    "未启用",
  );
  const microphoneName = deviceName(
    props.microphoneEnabled,
    props.hasMicrophone,
    props.microphoneDeviceName,
    "未启用，将进行无声录制",
  );
  return (
    <div
      className="modal-backdrop recording-backdrop recording-preparation-backdrop"
      role="presentation"
    >
      <section
        aria-label="录制准备"
        aria-modal="true"
        className="recording-preparation"
        role="dialog"
      >
        <span className="preparation-kicker">READY TO RECORD</span>
        <h2>录制准备</h2>
        <p>确认画幅与设备，然后开始你的白板视频。</p>
        <dl>
          <div>
            <dt>输出</dt>
            <dd className="preparation-summary-value">
              {props.profile.width} × {props.profile.height} ·{" "}
              {props.profile.fps} fps
            </dd>
          </div>
          <div>
            <dt>格式</dt>
            <dd
              className="preparation-summary-value"
              title={props.mimeType}
            >
              {props.mimeType}
            </dd>
          </div>
          <div>
            <dt>摄像头</dt>
            <dd className="preparation-summary-value" title={cameraName}>
              {cameraName}
            </dd>
          </div>
          <div>
            <dt>麦克风</dt>
            <dd className="preparation-summary-value" title={microphoneName}>
              {microphoneName}
            </dd>
          </div>
        </dl>
        <div className="preparation-device-actions">
          <button onClick={props.onChangeDevices} type="button">
            更换设备
          </button>
        </div>
        <div className="preparation-camera-controls">
          <span>摄像头</span>
          <div>
            <label>
              <input
                aria-label="镜像摄像头"
                checked={props.camera.mirrored}
                disabled={!props.hasCamera}
                onChange={(event) =>
                  props.onCameraChange({
                    ...props.camera,
                    mirrored: event.target.checked,
                  })
                }
                type="checkbox"
              />
              镜像
            </label>
            <button
              aria-pressed={props.camera.shape === "circle"}
              disabled={!props.hasCamera}
              onClick={() =>
                props.onCameraChange({ ...props.camera, shape: "circle" })
              }
              type="button"
            >
              圆形
            </button>
            <button
              aria-label="圆角摄像头"
              aria-pressed={props.camera.shape === "rounded"}
              disabled={!props.hasCamera}
              onClick={() =>
                props.onCameraChange({ ...props.camera, shape: "rounded" })
              }
              type="button"
            >
              圆角
            </button>
            <button
              aria-label="重置摄像头位置"
              disabled={!props.hasCamera}
              onClick={props.onCameraReset}
              type="button"
            >
              重置位置
            </button>
          </div>
          <small>拖动摄像头调整位置，拖动右下角手柄调整大小。</small>
        </div>
        {props.warnings.length > 0 && (
          <ul className="preparation-warnings">
            {props.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}
        {props.blockingIssues.length > 0 && (
          <ul className="preparation-errors">
            {props.blockingIssues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        <footer>
          <button className="secondary-action" onClick={props.onCancel} type="button">
            返回编辑
          </button>
          <button
            className="record-confirm-button"
            aria-label={props.starting ? "正在开始录制" : "开始录制"}
            disabled={props.starting || props.blockingIssues.length > 0}
            onClick={props.onStart}
            type="button"
          >
            <i />
            {props.starting ? "正在开始…" : "开始录制"}
          </button>
        </footer>
      </section>
    </div>
  );
}
