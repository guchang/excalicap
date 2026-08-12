export interface RecordingAsset {
  readonly url: string;
  readonly fileName: string;
  readonly size: number;
  readonly type: string;
}

export interface RecordingResultState {
  readonly composite: RecordingAsset;
  readonly materials: RecordingAsset | null;
  readonly materialsDescription: string;
  readonly materialsError: string | null;
  readonly completedAt: number;
}

export interface RecordingResultProps {
  readonly result: RecordingResultState | null;
  readonly error: string | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatAsset(asset: RecordingAsset) {
  return `${asset.type} · ${formatFileSize(asset.size)}`;
}

export function RecordingResult(props: RecordingResultProps) {
  if (!props.open || (!props.result && !props.error)) {
    return null;
  }
  return (
    <div
      className="modal-backdrop recording-backdrop recording-result-backdrop"
      role="presentation"
    >
      <section
        aria-label="录制结果"
        aria-modal="true"
        className="recording-result"
        role="dialog"
      >
        {props.error ? (
          <>
            <div className="result-error">!</div>
            <h2>录制没有完成</h2>
            <p>{props.error}</p>
          </>
        ) : props.result ? (
          <>
            <div className="result-check">✓</div>
            <h2>录制完成</h2>
            <div className="recording-result-assets">
              <article className="recording-result-asset">
                <h3>合成成片</h3>
                <p>白板 + 摄像头 + 激光笔 + 声音</p>
                <small>{formatAsset(props.result.composite)}</small>
                <a
                  className="download-video-button"
                  download={props.result.composite.fileName}
                  href={props.result.composite.url}
                >
                  下载合成视频
                </a>
              </article>
              {props.result.materials ? (
                <article className="recording-result-asset">
                  <h3>原始素材</h3>
                  <p>{props.result.materialsDescription}</p>
                  <small>{formatAsset(props.result.materials)}</small>
                  <a
                    className="download-video-button"
                    download={props.result.materials.fileName}
                    href={props.result.materials.url}
                  >
                    下载原始素材
                  </a>
                </article>
              ) : props.result.materialsError ? (
                <p className="recording-camera-note recording-camera-error">
                  原始素材生成失败：{props.result.materialsError}。合成成片仍可下载。
                </p>
              ) : (
                <p className="recording-camera-note">
                  本次没有可打包的原始素材。
                </p>
              )}
            </div>
            <p className="recording-result-retention">
              结果仅保留在当前页面，刷新前请下载
            </p>
          </>
        ) : null}
        <button className="result-close" onClick={props.onClose} type="button">
          返回白板
        </button>
      </section>
    </div>
  );
}
