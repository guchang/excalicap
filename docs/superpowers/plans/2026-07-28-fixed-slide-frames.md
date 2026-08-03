# Fixed Slide Frames Implementation Plan

> **For agentic workers:** Execute inline in the current session. Do not
> delegate or create commits for this task.

**Goal:** Prevent manual movement and resizing of Slide frames without
restricting Slide content or application-owned Slide operations.

**Architecture:** Add an idempotent frame-lock normalization function to the
Slide service. Apply it at every scene ingress and Slide mutation boundary,
including Excalidraw `onChange`, so an unlock attempt is immediately reversed
without creating an update loop.

**Tech Stack:** React 19, TypeScript 5.9, Excalidraw 0.18.1, Vitest 4.

## Global Constraints

- Only `type: "frame"` elements are forced to `locked: true`.
- Non-frame element lock state and geometry must remain unchanged.
- Canvas pan/zoom and Slide content editing remain available.
- No dependencies, Git commits, pushes, or deployments.

---

### Task 1: Slide frame normalization

**Files:**
- Modify: `src/slides/slide-service.ts`
- Test: `src/slides/slide-service.test.ts`

**Interfaces:**
- Produces: `lockSlideFrames(elements): readonly SlideSceneElement[]`
- Contract: returns the original array when every frame is already locked;
  otherwise returns an array in which only unlocked frames are cloned with
  `locked: true`.

- [x] Add failing tests for frame-only locking and idempotent array identity.
- [x] Run `npm test -- src/slides/slide-service.test.ts` and confirm failure.
- [x] Implement `lockSlideFrames()` and apply it to Slide mutations.
- [x] Re-run the focused tests and confirm they pass.

### Task 2: Editor and project ingress enforcement

**Files:**
- Modify: `src/App.tsx`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes: `lockSlideFrames()`.
- Produces: initial, restored, and editor-changed scenes with locked Slide
  frames.

- [x] Add failing integration tests for project restore and editor unlock.
- [x] Run `npm test -- src/App.test.tsx` and confirm failure.
- [x] Normalize initial data, restore data, and `handleSceneChange` payloads.
- [x] Write normalized editor payloads back only when the array changed.
- [x] Re-run focused tests and confirm they pass.

### Task 3: Verification

**Files:**
- No production files.

- [x] Run `npm test`.
- [x] Run `npm run typecheck`.
- [x] Run `npm run build`.
- [x] Reload the local application and verify Slide frames cannot be selected,
  moved, resized, or erased while content elements remain editable.
- [x] Check the browser console for errors.
