# Fixed Slide Frames Design

## Goal

Slide frames must remain directly selectable for native Excalidraw actions
while keeping stable position and dimensions so accidental canvas editing
cannot change the recording boundary.

## Behavior

- Every Excalidraw element with `type: "frame"` is a Slide and remains
  selectable with `locked: false`.
- Clicking a Frame border or its native title selects the whole Slide and keeps
  Excalidraw's native context menu, copy, and editing actions available.
- The custom reorder overlay only captures pointer input on its drag grip; its
  visible Slide title passes pointer input through to Excalidraw.
- A direct Frame move or resize is restored on pointer-up, including the
  corresponding movement of its child elements.
- Non-frame elements keep their existing `locked` state and remain editable.
- Application-owned Slide operations may still create, delete, duplicate,
  reorder, or later resize Slide frames.
- Canvas pan and zoom remain unchanged.

## Architecture

The Slide service owns an idempotent `makeSlideFramesSelectable()`
normalization function and a `restoreSlideFrameGeometry()` pointer-up guard.
Slide mutations use the selectable normalization before returning scene
elements. `App` applies the same normalization to initial data, restored
snapshots, and every Excalidraw `onChange` payload, then restores accidental
direct Frame transforms from Excalidraw's pointer-down snapshot.

## Verification

- Unit tests prove only frames become selectable and already-normalized arrays
  retain their identity.
- Slide mutation tests prove created, duplicated, and reordered Slides remain
  selectable.
- Pointer-up tests prove direct Frame transforms are restored without changing
  ordinary content lock state.
- Canvas overlay tests prove the visible Slide title is outside the drag button
  and therefore preserves native Excalidraw pointer and context-menu behavior.
- Full tests, type checking, production build, and browser interaction verify
  the behavior.
