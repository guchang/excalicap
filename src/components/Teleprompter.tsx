import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { TeleprompterSettings } from "../product/types";
import { Icon } from "./icons";

export interface TeleprompterProps {
  readonly open: boolean;
  readonly settings: TeleprompterSettings;
  readonly onChange: (settings: TeleprompterSettings) => void;
  readonly onClose: () => void;
}

export function Teleprompter(props: TeleprompterProps) {
  const [scrolling, setScrolling] = useState(false);
  const [settingsExpanded, setSettingsExpanded] = useState(true);
  const [position, setPosition] = useState(() => ({
    left: Math.max(8, (window.innerWidth - props.settings.width) / 2),
    top: 88,
  }));
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollCarryRef = useRef(0);
  const settingsRef = useRef(props.settings);
  const onChangeRef = useRef(props.onChange);
  settingsRef.current = props.settings;
  onChangeRef.current = props.onChange;
  const gestureRef = useRef<
    | {
        kind: "drag" | "resize";
        pointerId: number;
        startX: number;
        startY: number;
        left: number;
        top: number;
        width: number;
        height: number;
      }
    | undefined
  >(undefined);

  useEffect(() => {
    const onPointerMove = (event: PointerEvent) => {
      const gesture = gestureRef.current;
      if (!gesture) {
        return;
      }
      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (gesture.kind === "drag") {
        setPosition({
          left: Math.min(
          window.innerWidth - settingsRef.current.width - 8,
            Math.max(8, gesture.left + deltaX),
          ),
          top: Math.min(
          window.innerHeight - settingsRef.current.height - 8,
            Math.max(8, gesture.top + deltaY),
          ),
        });
        return;
      }
      onChangeRef.current({
        ...settingsRef.current,
        width: Math.min(
          800,
          window.innerWidth - gesture.left - 8,
          Math.max(300, gesture.width + deltaX),
        ),
        height: Math.min(
          600,
          window.innerHeight - gesture.top - 8,
          Math.max(180, gesture.height + deltaY),
        ),
      });
    };
    const onPointerUp = () => {
      gestureRef.current = undefined;
    };
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!props.open) {
        return;
      }
      const target = event.target;
      const isEditing =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isEditing) {
        return;
      }
      if (event.key === " ") {
        event.preventDefault();
        setScrolling((current) => !current);
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
        return;
      }
      event.preventDefault();
      if (textRef.current) {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        textRef.current.scrollTop += direction * 72;
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.open]);

  useEffect(() => {
    if (!scrolling) {
      scrollCarryRef.current = 0;
      return;
    }
    const timer = window.setInterval(() => {
      if (textRef.current) {
        scrollCarryRef.current += props.settings.speed / 20;
        const wholePixels = Math.floor(scrollCarryRef.current + 1e-9);
        if (wholePixels > 0) {
          textRef.current.scrollTop += wholePixels;
          scrollCarryRef.current -= wholePixels;
        }
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [props.settings.speed, scrolling]);
  if (!props.open) {
    return null;
  }
  const beginGesture = (
    kind: "drag" | "resize",
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    event.preventDefault();
    gestureRef.current = {
      kind,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      left: position.left,
      top: position.top,
      width: props.settings.width,
      height: props.settings.height,
    };
  };
  return (
    <section
      aria-label="提词器"
      className="teleprompter"
      style={{
        "--teleprompter-opacity": props.settings.opacity,
        left: position.left,
        top: position.top,
        width: props.settings.width,
        height: props.settings.height,
      } as CSSProperties}
    >
      <header
        aria-label="拖动提词器"
        onPointerDown={(event) => beginGesture("drag", event)}
      >
        <div className="teleprompter-title">
          <span className="teleprompter-title-mark" />
          <div>
            <strong>提词器</strong>
            <span>仅供讲述者 · 不进入成片</span>
          </div>
        </div>
        <div className="teleprompter-header-actions">
          <button
            aria-expanded={settingsExpanded}
            aria-label={settingsExpanded ? "收起设置" : "展开设置"}
            className="teleprompter-settings-toggle"
            data-active={settingsExpanded}
            onClick={() => setSettingsExpanded((current) => !current)}
            onPointerDown={(event) => event.stopPropagation()}
            title={settingsExpanded ? "收起设置" : "展开设置"}
            type="button"
          >
            <Icon name="settings" />
          </button>
          <button
            aria-label="关闭提词器"
            className="teleprompter-close"
            onClick={props.onClose}
            onPointerDown={(event) => event.stopPropagation()}
            type="button"
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <textarea
        aria-label="提词器文字"
        onChange={(event) =>
          props.onChange({ ...props.settings, text: event.target.value })
        }
        placeholder="在这里粘贴你的讲稿…"
        ref={textRef}
        style={{ fontSize: `${props.settings.fontSize}px` }}
        value={props.settings.text}
      />
      <footer data-settings-expanded={settingsExpanded}>
        <div className="teleprompter-transport">
          <button
            aria-label={scrolling ? "停止滚动" : "开始滚动"}
            className="teleprompter-playback-button"
            data-scrolling={scrolling}
            onClick={() => setScrolling((current) => !current)}
            type="button"
          >
            <Icon name={scrolling ? "pause" : "play"} />
            {scrolling ? "停止滚动" : "开始滚动"}
          </button>
          <div className="teleprompter-transport-meta">
            <output>{props.settings.speed} px/s</output>
          </div>
          <span
            className="teleprompter-keyboard-hint"
            hidden={!settingsExpanded}
          >
            空格 播放 / ↑↓ 滚动
          </span>
        </div>
        <div
          aria-label="提词器设置"
          className="teleprompter-settings-panel"
          hidden={!settingsExpanded}
        >
          <div className="teleprompter-setting-card">
            <span>
              滚动速度
              <output>{props.settings.speed} px/s</output>
            </span>
            <input
              aria-label="滚动速度"
              max="20"
              min="1"
              onChange={(event) =>
                props.onChange({
                  ...props.settings,
                  speed: Number(event.target.value),
                })
              }
              type="range"
              value={props.settings.speed}
            />
          </div>
          <div className="teleprompter-setting-card">
            <span>
              字号
              <output>{props.settings.fontSize}px</output>
            </span>
            <input
              aria-label="字体大小"
              max="40"
              min="8"
              onChange={(event) =>
                props.onChange({
                  ...props.settings,
                  fontSize: Number(event.target.value),
                })
              }
              type="range"
              value={props.settings.fontSize}
            />
          </div>
          <div className="teleprompter-setting-card">
            <span>
              背景
              <output>{Math.round(props.settings.opacity * 100)}%</output>
            </span>
            <input
              aria-label="背景透明度"
              max="1"
              min="0.4"
              onChange={(event) =>
                props.onChange({
                  ...props.settings,
                  opacity: Number(event.target.value),
                })
              }
              step="0.01"
              type="range"
              value={props.settings.opacity}
            />
          </div>
        </div>
      </footer>
      <button
        aria-label="调整提词器大小"
        className="teleprompter-resize-handle"
        onPointerDown={(event) => beginGesture("resize", event)}
        type="button"
      />
    </section>
  );
}
