import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import {
  getFrameViewportRect,
  toHostViewportRect,
  type ViewportRect,
  type ViewportOrigin,
  type ViewportState,
} from "../rendering/frame-viewport";
import { moveSlideToSlot } from "../slides/slide-reorder";
import type { SlideDescriptor } from "../slides/slide-service";

interface CanvasSlideSorterProps {
  readonly disabled: boolean;
  readonly hostOrigin?: ViewportOrigin | null;
  readonly slides: readonly SlideDescriptor[];
  readonly viewport: ViewportState | null;
  readonly onAutoPan: (direction: -1 | 1) => void;
  readonly onPreview: (slideId: string) => Promise<string | null>;
  readonly onReorder: (ids: string[]) => void;
}

interface PositionedSlide {
  readonly slide: SlideDescriptor;
  readonly rect: ViewportRect;
}

interface SlideDrag {
  readonly slideId: string;
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly grabOffsetX: number;
  readonly grabOffsetY: number;
  readonly width: number;
  readonly height: number;
  readonly slot: number;
  readonly autoPan: -1 | 0 | 1;
  readonly previewUrl: string | null;
}

const EDGE_PAN_ZONE = 76;
const CANVAS_SLIDE_HANDLE_OFFSET = 24;

function insertionSlot(
  slides: readonly PositionedSlide[],
  clientX: number,
) {
  const firstAfterPointer = slides.findIndex(
    ({ rect }) => clientX < rect.left + rect.width / 2,
  );
  return firstAfterPointer < 0 ? slides.length : firstAfterPointer;
}

function insertionLine(
  slides: readonly PositionedSlide[],
  slot: number,
) {
  if (slides.length === 0) {
    return null;
  }
  const first = slides[0].rect;
  const last = slides[slides.length - 1].rect;
  const gap = Math.max(22, Math.min(64, (last.left - first.left) / 8));
  let left: number;
  if (slot === 0) {
    left = first.left - gap;
  } else if (slot === slides.length) {
    left = last.left + last.width + gap;
  } else {
    const previous = slides[slot - 1].rect;
    const next = slides[slot].rect;
    left = (previous.left + previous.width + next.left) / 2;
  }
  const top = Math.min(...slides.map(({ rect }) => rect.top)) - 12;
  const bottom = Math.max(
    ...slides.map(({ rect }) => rect.top + rect.height),
  ) + 12;
  return { left, top, height: bottom - top };
}

export function CanvasSlideSorter(props: CanvasSlideSorterProps) {
  const [drag, setDrag] = useState<SlideDrag | null>(null);
  const dragRef = useRef<SlideDrag | null>(null);
  const [settledId, setSettledId] = useState<string | null>(null);
  const positionedSlides = useMemo(
    () =>
      props.viewport
        ? props.slides.map((slide) => {
            const viewportRect = getFrameViewportRect(slide, props.viewport!);
            return {
              slide,
              rect: props.hostOrigin
                ? toHostViewportRect(viewportRect, props.hostOrigin)
                : viewportRect,
            };
          })
        : [],
    [props.hostOrigin, props.slides, props.viewport],
  );
  const remainingSlides = drag
    ? positionedSlides.filter(({ slide }) => slide.id !== drag.slideId)
    : [];
  const slideIds = props.slides.map((slide) => slide.id);
  const previewOrder = drag
    ? moveSlideToSlot(slideIds, drag.slideId, drag.slot)
    : slideIds;
  const line =
    drag && previewOrder !== slideIds
      ? insertionLine(remainingSlides, drag.slot)
      : null;

  const cancelDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  useEffect(() => {
    if (props.disabled && dragRef.current) {
      dragRef.current = null;
      setDrag(null);
    }
  }, [props.disabled]);

  useEffect(() => {
    if (!drag) {
      return;
    }
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        cancelDrag();
      }
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drag]);

  useEffect(() => {
    if (!drag?.autoPan) {
      return;
    }
    let animationFrame = 0;
    const tick = () => {
      props.onAutoPan(drag.autoPan as -1 | 1);
      animationFrame = requestAnimationFrame(tick);
    };
    animationFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationFrame);
  }, [drag?.autoPan, props.onAutoPan]);

  const beginDrag = (
    event: PointerEvent<HTMLButtonElement>,
    positioned: PositionedSlide,
  ) => {
    if (props.disabled || event.button !== 0) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const clientX = event.clientX - (props.hostOrigin?.left ?? 0);
    const clientY = event.clientY - (props.hostOrigin?.top ?? 0);
    const remaining = positionedSlides.filter(
      ({ slide }) => slide.id !== positioned.slide.id,
    );
    const slot = insertionSlot(remaining, clientX);
    const nextDrag: SlideDrag = {
      slideId: positioned.slide.id,
      pointerId: event.pointerId,
      clientX,
      clientY,
      grabOffsetX: clientX - positioned.rect.left,
      grabOffsetY: clientY - positioned.rect.top,
      width: positioned.rect.width,
      height: positioned.rect.height,
      slot,
      autoPan: 0,
      previewUrl: null,
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
    void props.onPreview(positioned.slide.id).then((previewUrl) => {
      const current = dragRef.current;
      if (current?.slideId !== positioned.slide.id) {
        return;
      }
      const withPreview = { ...current, previewUrl };
      dragRef.current = withPreview;
      setDrag(withPreview);
    });
  };

  const updateDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    event.preventDefault();
    const clientX = event.clientX - (props.hostOrigin?.left ?? 0);
    const clientY = event.clientY - (props.hostOrigin?.top ?? 0);
    const remaining = positionedSlides.filter(
      ({ slide }) => slide.id !== current.slideId,
    );
    const slot = insertionSlot(remaining, clientX);
    const autoPan =
      event.clientX < EDGE_PAN_ZONE
        ? -1
        : event.clientX > window.innerWidth - EDGE_PAN_ZONE
          ? 1
          : 0;
    const nextDrag: SlideDrag = {
      ...current,
      clientX,
      clientY,
      slot,
      autoPan,
    };
    dragRef.current = nextDrag;
    setDrag(nextDrag);
  };

  const finishDrag = (event: PointerEvent<HTMLButtonElement>) => {
    const current = dragRef.current;
    if (!current || event.pointerId !== current.pointerId) {
      return;
    }
    event.preventDefault();
    const remaining = positionedSlides.filter(
      ({ slide }) => slide.id !== current.slideId,
    );
    const ids = props.slides.map((slide) => slide.id);
    const clientX = event.clientX - (props.hostOrigin?.left ?? 0);
    const slot = insertionSlot(remaining, clientX);
    const reordered = moveSlideToSlot(ids, current.slideId, slot);
    if (reordered !== ids) {
      props.onReorder([...reordered]);
      setSettledId(current.slideId);
      window.setTimeout(() => setSettledId(null), 220);
    }
    dragRef.current = null;
    setDrag(null);
  };

  return (
    <div
      aria-hidden={props.disabled || positionedSlides.length < 2}
      className="canvas-slide-sorter"
      data-dragging={drag ? "true" : "false"}
    >
      {!props.disabled &&
        positionedSlides.length > 1 &&
        positionedSlides.map((positioned) => {
          const { rect, slide } = positioned;
          const visible =
            rect.width >= 80 &&
            rect.height >= 80 &&
            rect.left < window.innerWidth &&
            rect.left + rect.width > 0 &&
            rect.top < window.innerHeight &&
            rect.top + rect.height > 0;
          if (!visible || (drag && drag.slideId !== slide.id)) {
            return null;
          }
          return (
            <button
              aria-label={`拖动 ${slide.name} 排序`}
              className="canvas-slide-drag-handle"
              data-drag-source={drag?.slideId === slide.id}
              data-settled={settledId === slide.id}
              data-slide-id={slide.id}
              key={slide.id}
              onLostPointerCapture={cancelDrag}
              onPointerCancel={cancelDrag}
              onPointerDown={(event) => beginDrag(event, positioned)}
              onPointerMove={updateDrag}
              onPointerUp={finishDrag}
              style={{
                left: rect.left - 1,
                top: Math.max(0, rect.top - CANVAS_SLIDE_HANDLE_OFFSET),
              }}
              title={`拖动 ${slide.name} 排序`}
              type="button"
            >
              <span aria-hidden="true" className="canvas-slide-title-grip">
                ⠿
              </span>
              <span className="canvas-slide-title-text">{slide.name}</span>
            </button>
          );
        })}

      {drag &&
        remainingSlides.map(({ slide, rect }) => {
          const currentIndex = props.slides.findIndex(
            (item) => item.id === slide.id,
          );
          const targetIndex = previewOrder.indexOf(slide.id);
          const targetRect = positionedSlides[targetIndex]?.rect;
          const deltaX = targetRect ? targetRect.left - rect.left : 0;
          if (currentIndex === targetIndex || deltaX === 0) {
            return null;
          }
          return (
            <div
              className="canvas-slide-shift-preview"
              key={slide.id}
              style={{
                left: rect.left,
                top: rect.top,
                width: rect.width,
                height: rect.height,
                transform: `translateX(${deltaX}px)`,
              }}
            />
          );
        })}

      {drag && (() => {
        const source = positionedSlides.find(
          ({ slide }) => slide.id === drag.slideId,
        );
        return source ? (
          <div
            className="canvas-slide-source-placeholder"
            style={{
              left: source.rect.left,
              top: source.rect.top,
              width: source.rect.width,
              height: source.rect.height,
            }}
          />
        ) : null;
      })()}

      {drag && line && (
        <div
          className="canvas-slide-insertion-line"
          style={{ left: line.left, top: line.top, height: line.height }}
        />
      )}

      {drag && (
        <div
          className="canvas-slide-drag-preview"
          data-has-image={Boolean(drag.previewUrl)}
          style={{
            left: drag.clientX - drag.grabOffsetX,
            top: drag.clientY - drag.grabOffsetY,
            width: drag.width,
            height: drag.height,
            backgroundImage: drag.previewUrl
              ? `url(${JSON.stringify(drag.previewUrl)})`
              : undefined,
          }}
        >
          {!drag.previewUrl && <span>正在移动 Slide</span>}
        </div>
      )}
    </div>
  );
}
