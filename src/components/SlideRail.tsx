import { useEffect, useRef, useState, type DragEvent } from "react";
import { createPortal } from "react-dom";
import { moveSlideToSlot } from "../slides/slide-reorder";
import { Icon } from "./icons";

export interface SlideRailItem {
  readonly id: string;
  readonly name: string;
}

export interface SlideRailProps {
  readonly theme?: "light" | "dark";
  readonly slides: readonly SlideRailItem[];
  readonly currentSlideId: string | null;
  readonly onNavigate: (id: string) => void;
  readonly onAdd: () => void;
  readonly onDelete?: (id: string) => void;
  readonly onExport?: (id: string) => void;
  readonly onReorder: (ids: string[]) => void;
}

interface SlideMenuState {
  readonly returnFocus: HTMLButtonElement;
  readonly slide: SlideRailItem;
  readonly x: number;
  readonly y: number;
}

const SLIDE_MENU_WIDTH = 180;
const SLIDE_MENU_GAP = 8;

export function SlideRail(props: SlideRailProps) {
  const draggedId = useRef<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const deleteDialogRef = useRef<HTMLElement | null>(null);
  const deleteCancelRef = useRef<HTMLButtonElement | null>(null);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [settledId, setSettledId] = useState<string | null>(null);
  const [menu, setMenu] = useState<SlideMenuState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SlideMenuState | null>(null);

  useEffect(() => {
    if (!menu) {
      return;
    }
    menuRef.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]:not(:disabled)')
      ?.focus();
    const closeMenu = () => {
      setMenu(null);
      menu.returnFocus.focus();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    };
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Node && !menuRef.current?.contains(target)) {
        closeMenu();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("pointerdown", closeOnOutsidePointer);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
    };
  }, [menu]);

  useEffect(() => {
    if (!pendingDelete) {
      return;
    }
    deleteCancelRef.current?.focus();
    const closeDelete = () => {
      setPendingDelete(null);
      pendingDelete.returnFocus.focus();
    };
    const handleDialogKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDelete();
        return;
      }
      if (event.key !== "Tab") {
        return;
      }
      const buttons = Array.from(
        deleteDialogRef.current?.querySelectorAll<HTMLButtonElement>(
          "button:not(:disabled)",
        ) ?? [],
      );
      if (buttons.length === 0) {
        return;
      }
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleDialogKeys);
    return () => window.removeEventListener("keydown", handleDialogKeys);
  }, [pendingDelete]);

  const activateBoundary = (boundary: number) => {
    const sourceId = draggedId.current;
    if (!sourceId) {
      setActiveSlot(null);
      return;
    }
    const ids = props.slides.map((slide) => slide.id);
    const sourceIndex = ids.indexOf(sourceId);
    const slot = boundary > sourceIndex ? boundary - 1 : boundary;
    setActiveSlot(
      moveSlideToSlot(ids, sourceId, slot) === ids ? null : boundary,
    );
  };

  const dropAt = (boundary: number) => {
    const sourceId = draggedId.current;
    draggedId.current = null;
    setDraggingId(null);
    setActiveSlot(null);
    if (!sourceId) {
      return;
    }
    const ids = props.slides.map((slide) => slide.id);
    const sourceIndex = ids.indexOf(sourceId);
    const slot = boundary > sourceIndex ? boundary - 1 : boundary;
    const reordered = moveSlideToSlot(ids, sourceId, slot);
    if (reordered === ids) {
      return;
    }
    props.onReorder([...reordered]);
    setSettledId(sourceId);
    window.setTimeout(() => setSettledId(null), 220);
  };

  const autoScroll = (clientY: number) => {
    const list = listRef.current;
    if (!list) {
      return;
    }
    const bounds = list.getBoundingClientRect();
    if (clientY < bounds.top + 28) {
      list.scrollTop -= 10;
    } else if (clientY > bounds.bottom - 28) {
      list.scrollTop += 10;
    }
  };

  const itemBoundary = (
    event: DragEvent<HTMLDivElement>,
    index: number,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return event.clientY < bounds.top + bounds.height / 2
      ? index
      : index + 1;
  };

  return (
    <aside
      className="slide-rail"
      aria-label="幻灯片导航"
      data-dragging={draggingId ? "true" : "false"}
    >
      <span className="slide-rail-title">幻灯片</span>
      <div
        className="slide-rail-list"
        onDragLeave={(event) => {
          const nextTarget = event.relatedTarget;
          if (
            !(nextTarget instanceof Node) ||
            !event.currentTarget.contains(nextTarget)
          ) {
            setActiveSlot(null);
          }
        }}
        ref={listRef}
      >
        {props.slides.map((slide, index) => (
          <div className="slide-rail-entry" key={slide.id}>
            <div
              aria-hidden="true"
              className="slide-rail-drop-slot"
              data-active={activeSlot === index}
              onDragEnter={(event) => {
                event.preventDefault();
                activateBoundary(index);
              }}
              onDragOver={(event) => {
                event.preventDefault();
                autoScroll(event.clientY);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropAt(index);
              }}
            />
            <div
              className="slide-rail-item"
              data-active={slide.id === props.currentSlideId}
              data-drag-source={draggingId === slide.id}
              data-settled={settledId === slide.id}
              data-slide-id={slide.id}
              draggable
              onContextMenu={(event) => {
                event.preventDefault();
                const returnFocus = event.currentTarget.querySelector<HTMLButtonElement>(
                  ".slide-number",
                );
                if (!returnFocus) {
                  return;
                }
                const bounds = returnFocus.getBoundingClientRect();
                const railBounds = event.currentTarget
                  .closest(".slide-rail")
                  ?.getBoundingClientRect();
                setMenu({
                  returnFocus,
                  slide,
                  x: Math.max(
                    SLIDE_MENU_GAP,
                    (railBounds?.left ?? bounds.left) -
                      SLIDE_MENU_WIDTH -
                      SLIDE_MENU_GAP,
                  ),
                  y: Math.min(
                    Math.max(8, event.clientY || bounds.bottom),
                    Math.max(8, window.innerHeight - 104),
                  ),
                });
              }}
              onDragOver={(event) => {
                event.preventDefault();
                activateBoundary(itemBoundary(event, index));
                autoScroll(event.clientY);
              }}
              onDrop={(event) => {
                event.preventDefault();
                dropAt(itemBoundary(event, index));
              }}
              onDragEnd={() => {
                draggedId.current = null;
                setDraggingId(null);
                setActiveSlot(null);
              }}
              onDragStart={(event) => {
                draggedId.current = slide.id;
                setDraggingId(slide.id);
                if (event.dataTransfer) {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", slide.id);
                }
                activateBoundary(index);
              }}
            >
              <button
                aria-label={`转到 ${slide.name}`}
                className="slide-number"
                onClick={() => props.onNavigate(slide.id)}
                type="button"
              >
                {index + 1}
              </button>
            </div>
          </div>
        ))}
        <div
          aria-hidden="true"
          className="slide-rail-drop-slot"
          data-active={activeSlot === props.slides.length}
          onDragEnter={(event) => {
            event.preventDefault();
            activateBoundary(props.slides.length);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            autoScroll(event.clientY);
          }}
          onDrop={(event) => {
            event.preventDefault();
            dropAt(props.slides.length);
          }}
        />
      </div>
      <button
        aria-label="添加幻灯片"
        className="add-slide-button"
        onClick={props.onAdd}
        type="button"
      >
        <Icon name="plus" />
      </button>
      {menu && createPortal(
        <div
          aria-label={`${menu.slide.name} 操作`}
          className="slide-context-menu"
          data-theme={props.theme ?? "light"}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              setMenu(null);
              menu.returnFocus.focus();
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
              return;
            }
            event.preventDefault();
            const items = Array.from(
              menuRef.current?.querySelectorAll<HTMLButtonElement>(
                '[role="menuitem"]:not(:disabled)',
              ) ?? [],
            );
            if (items.length === 0) {
              return;
            }
            const currentIndex = items.indexOf(
              document.activeElement as HTMLButtonElement,
            );
            const nextIndex =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? items.length - 1
                  : event.key === "ArrowUp"
                    ? (currentIndex - 1 + items.length) % items.length
                    : (currentIndex + 1) % items.length;
            items[nextIndex]?.focus();
          }}
          ref={menuRef}
          role="menu"
          style={{ left: menu.x, top: menu.y }}
        >
          <button
            onClick={() => {
              props.onExport?.(menu.slide.id);
              setMenu(null);
              menu.returnFocus.focus();
            }}
            role="menuitem"
            type="button"
          >
            <Icon name="download" />
            <span>导出为 PNG</span>
          </button>
          <div className="slide-context-menu-separator" role="separator" />
          <button
            className="slide-context-menu-danger"
            disabled={props.slides.length <= 1}
            onClick={() => {
              setPendingDelete(menu);
              setMenu(null);
            }}
            role="menuitem"
            type="button"
          >
            <Icon name="trash" />
            <span>删除 Slide</span>
          </button>
        </div>,
        document.body,
      )}
      {pendingDelete && createPortal(
        <div
          className="modal-backdrop slide-delete-backdrop"
          data-theme={props.theme ?? "light"}
          role="presentation"
        >
          <section
            aria-labelledby="slide-delete-title"
            aria-modal="true"
            className="slide-delete-dialog"
            ref={deleteDialogRef}
            role="dialog"
          >
            <h2 id="slide-delete-title">删除 {pendingDelete.slide.name}？</h2>
            <p>该 Slide 及其中的全部内容将被删除，此操作无法撤销。</p>
            <div className="slide-delete-actions">
              <button
                onClick={() => {
                  setPendingDelete(null);
                  pendingDelete.returnFocus.focus();
                }}
                ref={deleteCancelRef}
                type="button"
              >
                取消
              </button>
              <button
                aria-label="确认删除 Slide"
                className="slide-delete-confirm"
                onClick={() => {
                  props.onDelete?.(pendingDelete.slide.id);
                  setPendingDelete(null);
                  window.requestAnimationFrame(() => {
                    listRef.current
                      ?.querySelector<HTMLButtonElement>(".slide-number")
                      ?.focus();
                  });
                }}
                type="button"
              >
                删除 Slide
              </button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </aside>
  );
}
