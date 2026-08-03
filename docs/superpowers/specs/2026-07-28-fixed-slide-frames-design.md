# Fixed Slide Frames Design

## Goal

Slide frames must keep stable position and dimensions so accidental canvas
editing cannot change the recording boundary.

## Behavior

- Every Excalidraw element with `type: "frame"` is a Slide and is always
  `locked: true`.
- Locking applies to initial Slides, restored projects, newly created Slides,
  duplicated Slides, reordered Slides, and frames introduced through an editor
  scene change.
- An editor attempt to unlock a Slide is normalized back to `locked: true`.
- Non-frame elements keep their existing `locked` state and remain editable.
- Application-owned Slide operations may still create, delete, duplicate,
  reorder, or later resize Slide frames.
- Canvas pan and zoom remain unchanged.

## Architecture

The Slide service owns a small idempotent `lockSlideFrames()` normalization
function. Slide mutations use the function before returning scene elements.
`App` applies the same normalization to initial data, restored snapshots, and
every Excalidraw `onChange` payload. When normalization changes an editor
payload, `App` writes the normalized elements back once; the subsequent
`onChange` is already normalized and does not loop.

## Verification

- Unit tests prove only frames are locked and already-normalized arrays retain
  their identity.
- Slide mutation tests prove created, duplicated, and reordered Slides stay
  locked.
- App integration tests prove restored and newly unlocked frames are written
  back as locked while ordinary elements remain editable.
- Full tests, type checking, production build, and browser interaction verify
  the behavior.

