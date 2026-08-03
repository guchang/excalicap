import { Icon } from "./icons";

export type ProductRecordingState =
  | "idle"
  | "preparing"
  | "recording"
  | "paused"
  | "stopping"
  | "completed"
  | "failed";

export interface ProductTopbarProps {
  readonly recordingState: ProductRecordingState;
  readonly elapsedText: string;
  readonly hasRecordingResult: boolean;
  readonly saveStatus: "idle" | "dirty" | "saving" | "saved" | "failed";
  readonly onOpenRecordingResult: () => void;
  readonly onOpenSettings: () => void;
  readonly onOpenTeleprompter: () => void;
  readonly onRecord: () => void;
  readonly onPause: () => void;
  readonly onResume: () => void;
  readonly onStop: () => void;
}

function ToolButton({
  label,
  icon,
  disabled = false,
  onClick,
}: {
  readonly label: string;
  readonly icon: Parameters<typeof Icon>[0]["name"];
  readonly disabled?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      aria-label={label}
      className="product-icon-button"
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
    </button>
  );
}

export function ProductTopbar(props: ProductTopbarProps) {
  const transportActive =
    props.recordingState === "recording" ||
    props.recordingState === "paused";
  const editingLocked =
    props.recordingState === "preparing" ||
    transportActive ||
    props.recordingState === "stopping";
  return (
    <>
      {props.saveStatus === "failed" ? (
        <div className="product-save-state" role="alert">
          保存失败
        </div>
      ) : null}
      <div className="product-control-rail" aria-label="创作控制">
        <ToolButton
          icon="settings"
          label="设置"
          disabled={editingLocked}
          onClick={props.onOpenSettings}
        />
        <ToolButton
          icon="script"
          label="提词器"
          onClick={props.onOpenTeleprompter}
        />
        {props.hasRecordingResult ? (
          <ToolButton
            icon="recording"
            label="上次录制"
            onClick={props.onOpenRecordingResult}
          />
        ) : null}
        {props.recordingState === "stopping" ? (
          <span className="recording-time">正在完成录制…</span>
        ) : transportActive ? (
          <>
            <span className="recording-time">
              <i />
              {props.elapsedText}
            </span>
            {props.recordingState === "paused" ? (
              <ToolButton
                icon="play"
                label="继续"
                onClick={props.onResume}
              />
            ) : (
              <ToolButton
                icon="pause"
                label="暂停"
                onClick={props.onPause}
              />
            )}
            <ToolButton icon="stop" label="停止" onClick={props.onStop} />
          </>
        ) : (
          <button
            aria-label="录制"
            className="record-button"
            disabled={props.recordingState === "preparing"}
            onClick={props.onRecord}
            type="button"
          >
            <span aria-hidden="true" className="record-button-dot">
              ●
            </span>
            <span>录制</span>
          </button>
        )}
      </div>
    </>
  );
}
