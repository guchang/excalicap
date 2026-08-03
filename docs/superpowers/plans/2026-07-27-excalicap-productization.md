# Excalicap Productization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Phase 1 validator shell with a local-first Excalicap product that matches Excalicord’s core workspace structure while retaining the verified high-resolution scene-rendering and recording pipeline.

**Architecture:** Keep Excalidraw as the authoring surface and turn `App.tsx` into a thin product orchestrator. Pure modules own output settings, Slide mutations, device fallback, and project persistence; focused React components own the top controls, Slide rail, settings, teleprompter, recording preparation, recording HUD, and completion state. The existing scene renderer, compositor, MediaRecorder engine, and OPFS sink remain the only recording path.

**Tech Stack:** React `19.2.8`, React DOM `19.2.8`, TypeScript `5.9.3`, Vite `8.1.5`, Vitest `4.1.10`, Testing Library React `16.3.2`, Excalidraw `0.18.1`, native IndexedDB/localStorage/Canvas/MediaRecorder/MediaDevices/OPFS APIs.

## Global Constraints

- Work only in `.worktrees/phase1-validator` on `feature/phase1-validator`; keep the main worktree clean.
- Do not stage, commit, push, deploy, or create a PR in this plan.
- Match the supplied Excalicord screenshot’s layout and interaction hierarchy without copying private source, branding, or unlicensed assets.
- Keep `@excalidraw/excalidraw` pinned to exact version `0.18.1`.
- Keep the recording whiteboard source as `elements + appState + BinaryFiles + exportingFrame`; never read the editor display Canvas.
- OPFS remains temporary recording storage only; do not save raw camera tracks, raw microphone tracks, operation timelines, or intermediate frame sequences.
- Camera and microphone are independently optional. Missing camera must not block whiteboard or microphone recording; missing microphone must not block silent recording.
- Use native Web APIs and the existing dependencies; add no state framework, icon package, HTTP client, or video editing dependency.
- Preserve the existing legal-material boundary: built-in product backgrounds are original CSS colors and gradients only.

---

## File Map

- `src/App.tsx`: product orchestration and Excalidraw integration; no large presentation sections.
- `src/product/types.ts`: product settings, project snapshot, recording UI, and device contracts.
- `src/product/output-presets.ts`: 16:9, 4:3, 3:4, 9:16, 1:1, high-resolution, and custom output validation.
- `src/product/settings-storage.ts`: validated localStorage settings load/save.
- `src/project/project-storage.ts`: IndexedDB project snapshot load/save.
- `src/project/use-project-autosave.ts`: debounced save status and forced-save API.
- `src/slides/slide-service.ts`: pure Frame discovery, add, delete, duplicate, reorder, and naming rules.
- `src/media/device-controller.ts`: device enumeration and independent camera/microphone fallback.
- `src/recording/recording-clock.ts`: pause-aware elapsed-time calculation and formatting.
- `src/components/icons.tsx`: small inline SVG icon set with accessible titles supplied by callers.
- `src/components/ProductTopbar.tsx`: menu, settings, teleprompter, recording controls, and save state.
- `src/components/SlideRail.tsx`: numbered Slide navigation, delete, duplicate, drag reorder, and add.
- `src/components/SettingsDialog.tsx`: output, background, canvas, camera, microphone, and cursor settings.
- `src/components/Teleprompter.tsx`: editable, draggable, resizable, auto-scrolling overlay excluded from output.
- `src/components/RecordingPreparation.tsx`: preflight summary and explicit start/cancel actions.
- `src/components/RecordingHud.tsx`: timer, pause/resume, cursor toggle, and stop.
- `src/components/RecordingResult.tsx`: successful output download and failure recovery message.
- `src/styles.css`: full-screen original-inspired workspace and overlays.
- `src/**/*.test.ts(x)`: behavior tests colocated with each module.

---

### Task 1: Product Settings and Output Presets

**Files:**
- Create: `src/product/types.ts`
- Create: `src/product/output-presets.ts`
- Create: `src/product/output-presets.test.ts`
- Create: `src/product/settings-storage.ts`
- Create: `src/product/settings-storage.test.ts`
- Modify: `src/rendering/output-profile.ts`

**Interfaces:**
- Produces `ProductSettings`, `OutputPresetId`, `CameraSettings`, `MicrophoneSettings`, `CursorSettings`, and `CanvasSettings`.
- Produces `resolveOutputProfile(settings): OutputProfile` and `validateCustomOutput(width, height): string[]`.
- Produces `loadProductSettings(storage)` and `saveProductSettings(storage, settings)`.

- [ ] **Step 1: Write failing preset tests**

Assert exact output profiles:

```ts
expect(resolveOutputProfile({ ...DEFAULT_SETTINGS, outputPreset: "16:9" }))
  .toEqual({ width: 1920, height: 1080, fps: 30 });
expect(resolveOutputProfile({ ...DEFAULT_SETTINGS, outputPreset: "3:4" }))
  .toEqual({ width: 1080, height: 1440, fps: 30 });
expect(resolveOutputProfile({
  ...DEFAULT_SETTINGS,
  outputPreset: "custom",
  customWidth: 2560,
  customHeight: 1440,
})).toEqual({ width: 2560, height: 1440, fps: 30 });
```

Assert custom width outside `640–3840 px` and height outside `480–2160 px` return explicit Chinese errors.

- [ ] **Step 2: Run the preset test and verify RED**

Run `npx vitest run src/product/output-presets.test.ts`.
Expected: FAIL because the product preset modules do not exist.

- [ ] **Step 3: Implement settings and preset resolution**

Define default settings with `3:4`, white background, `24 px` canvas padding, `18 px` Slide radius, camera enabled at medium circular size, microphone enabled, red cursor enabled, and an empty teleprompter.

- [ ] **Step 4: Write failing settings-storage tests**

Cover missing storage, malformed JSON, partially valid saved values, out-of-range custom sizes, and persistence round trip. Invalid fields must fall back individually rather than discarding all valid settings.

- [ ] **Step 5: Implement validated localStorage persistence**

Use the key `excalicap:settings:v1`. Do not persist device streams, permission state, recording Blobs, or object URLs.

- [ ] **Step 6: Run targeted verification**

Run `npx vitest run src/product/output-presets.test.ts src/product/settings-storage.test.ts`, `npm run typecheck`, and `git diff --check`.

---

### Task 2: Slide Domain Service

**Files:**
- Create: `src/slides/slide-service.ts`
- Create: `src/slides/slide-service.test.ts`

**Interfaces:**
- Consumes Excalidraw elements and an ID factory.
- Produces `getSlides(elements)`, `createSlide(elements, afterId, frameSize, createId)`, `deleteSlide(elements, frameId)`, `duplicateSlide(elements, frameId, createId)`, and `reorderSlides(elements, orderedFrameIds)`.

- [ ] **Step 1: Write failing Slide behavior tests**

Cover:

```ts
expect(getSlides(elements).map((slide) => slide.id)).toEqual(["slide-1", "slide-2"]);
expect(createSlide(elements, "slide-1", { width: 1080, height: 1440 }, idFactory)
  .slides.map((slide) => slide.name)).toEqual(["Slide 1", "Slide 2", "Slide 3"]);
```

Also assert deleting a Frame deletes its children, never deletes the last remaining Slide, duplicate rewrites Frame IDs and every child `frameId`, reorder assigns monotonically increasing `x` positions, and names are normalized to `Slide N`.

- [ ] **Step 2: Run the Slide test and verify RED**

Run `npx vitest run src/slides/slide-service.test.ts`.
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement pure Slide mutations**

Use a fixed `120 px` horizontal gap. Preserve element order, element content, binding/group/container references when they do not point inside the duplicated Slide, and rewrite duplicated internal IDs and references when they do.

- [ ] **Step 4: Run targeted verification**

Run the Slide test, `npm run typecheck`, and `git diff --check`.

---

### Task 3: Local Project Storage and Autosave

**Files:**
- Create: `src/project/project-storage.ts`
- Create: `src/project/project-storage.test.ts`
- Create: `src/project/use-project-autosave.ts`
- Create: `src/project/use-project-autosave.test.tsx`

**Interfaces:**
- Produces `ProjectSnapshot` with `version`, `updatedAt`, `elements`, `appState`, `files`, `currentSlideId`, and `projectTitle`.
- Produces `createProjectStorage(indexedDB, databaseName)` with `load()`, `save(snapshot)`, and `clear()`.
- Produces `useProjectAutosave({ save, delayMs })` returning `queue(snapshot)`, `flush(snapshot)`, and `status`.

- [ ] **Step 1: Write failing storage tests**

Use a narrow fake IndexedDB adapter boundary. Assert load returns `null` before the first save, save replaces the single workspace record, files remain structured-clone values, and a newer save wins.

- [ ] **Step 2: Run storage test and verify RED**

Run `npx vitest run src/project/project-storage.test.ts`.
Expected: FAIL because project storage does not exist.

- [ ] **Step 3: Implement IndexedDB storage**

Use database `excalicap`, version `1`, object store `projects`, key `current`. Surface open, transaction, quota, and serialization failures as Chinese `Error` messages.

- [ ] **Step 4: Write failing autosave tests**

Use fake timers to assert multiple scene changes within `800 ms` produce one save, `flush()` saves immediately, status transitions `dirty → saving → saved`, and rejected saves transition to `failed`.

- [ ] **Step 5: Implement the autosave hook**

Keep the latest snapshot in a ref, clear the timer on unmount, and never swallow save errors.

- [ ] **Step 6: Run targeted verification**

Run both project tests, `npm run typecheck`, and `git diff --check`.

---

### Task 4: Optional Device Acquisition

**Files:**
- Create: `src/media/device-controller.ts`
- Create: `src/media/device-controller.test.ts`

**Interfaces:**
- Produces `enumerateMediaDevices(mediaDevices): Promise<DeviceCatalog>`.
- Produces `acquireEnabledMedia(mediaDevices, settings): Promise<AcquiredMedia>`.
- `AcquiredMedia` contains one combined stream or `null`, optional camera stream, optional microphone stream, and warning strings.

- [ ] **Step 1: Write failing device fallback tests**

Cover camera plus microphone success, microphone-only settings, camera-only settings, both disabled, requested camera missing with microphone fallback, requested microphone missing with camera fallback, and both requested devices missing with whiteboard-only success.

- [ ] **Step 2: Run the device test and verify RED**

Run `npx vitest run src/media/device-controller.test.ts`.
Expected: FAIL because the controller does not exist.

- [ ] **Step 3: Implement independent acquisition**

Request camera and microphone independently so one rejected request cannot discard the other successful track. Apply exact `deviceId` constraints only when a non-empty selected ID exists. Return user-facing warnings such as `未检测到摄像头，将只录制白板和声音`.

- [ ] **Step 4: Add interruption behavior**

Expose `stopAcquiredMedia(media)` and attach an `ended` listener contract that distinguishes camera loss from microphone loss. Camera loss removes the camera layer and continues; microphone loss requests a safe stop.

- [ ] **Step 5: Run targeted verification**

Run the device test, `npm run typecheck`, and `git diff --check`.

---

### Task 5: Recording Clock

**Files:**
- Create: `src/recording/recording-clock.ts`
- Create: `src/recording/recording-clock.test.ts`

**Interfaces:**
- Produces `RecordingClock` with `start(now)`, `pause(now)`, `resume(now)`, `stop(now)`, `elapsed(now)`, and `formatRecordingTime(milliseconds)`.

- [ ] **Step 1: Write failing pause-aware clock tests**

Assert a recording started at `0`, paused at `10_000`, resumed at `130_000`, and stopped at `140_000` reports `20_000 ms`, not `140_000 ms`. Assert formatting produces `00:00`, `01:05`, and `1:02:03`.

- [ ] **Step 2: Run the clock test and verify RED**

Run `npx vitest run src/recording/recording-clock.test.ts`.

- [ ] **Step 3: Implement the clock**

Reject invalid state transitions with explicit messages and keep time calculations independent from React.

- [ ] **Step 4: Run targeted verification**

Run the clock test and `npm run typecheck`.

---

### Task 6: Product UI Components

**Files:**
- Create: `src/components/icons.tsx`
- Create: `src/components/ProductTopbar.tsx`
- Create: `src/components/ProductTopbar.test.tsx`
- Create: `src/components/SlideRail.tsx`
- Create: `src/components/SlideRail.test.tsx`
- Create: `src/components/SettingsDialog.tsx`
- Create: `src/components/SettingsDialog.test.tsx`
- Create: `src/components/Teleprompter.tsx`
- Create: `src/components/Teleprompter.test.tsx`
- Create: `src/components/RecordingPreparation.tsx`
- Create: `src/components/RecordingHud.tsx`
- Create: `src/components/RecordingResult.tsx`

**Interfaces:**
- Components are controlled and receive explicit values and callbacks; none reads Excalidraw or browser media globals directly.

- [ ] **Step 1: Write failing topbar tests**

Assert the idle topbar exposes icon buttons named `设置`, `提词器`, `录制`, and `素材库`; recording state replaces `录制` with timer, pause/resume, and stop controls; save status is accessible without occupying the canvas.

- [ ] **Step 2: Implement ProductTopbar**

Use inline SVG icons, a white floating surface, subtle shadow, neutral buttons, and a single red recording action matching the supplied screenshot. No validator title, output selector, or permanent diagnostics panel.

- [ ] **Step 3: Write failing SlideRail tests**

Assert numbered navigation, active Slide state, add, delete confirmation callback, duplicate callback, and drag reorder callback. The rail must remain keyboard reachable.

- [ ] **Step 4: Implement SlideRail**

Render a right-side floating vertical pill labelled `幻灯片`, numbered buttons, contextual delete/duplicate actions, and a dashed add button.

- [ ] **Step 5: Write failing SettingsDialog tests**

Assert output presets, valid custom dimensions, original CSS gradient/background swatches, Slide radius, canvas padding, independent camera/microphone toggles and device selectors, camera shape/size, cursor toggle/color, cancel, and apply.

- [ ] **Step 6: Implement SettingsDialog**

Use a two-column modal: live composition preview on the left and a scrollable settings form on the right. Keep all background options original CSS colors/gradients.

- [ ] **Step 7: Write and implement Teleprompter tests**

Assert the overlay opens with saved text, edits text, toggles auto-scroll, changes speed/opacity, can be dragged by its handle, can be resized with CSS `resize: both`, and never renders inside the recording Canvas container.

- [ ] **Step 8: Implement recording overlays**

`RecordingPreparation` shows output, enabled tracks, warnings, blocking issues, cancel, and `开始录制`. `RecordingHud` shows pause-aware time, pause/resume, cursor visibility, and stop. `RecordingResult` shows output format, file size, download, close, and retry.

- [ ] **Step 9: Run component verification**

Run `npx vitest run src/components`, `npm run typecheck`, and `git diff --check`.

---

### Task 7: Product App Integration

**Files:**
- Rewrite: `src/App.tsx`
- Rewrite: `src/App.test.tsx`
- Rewrite: `src/styles.css`
- Modify: `src/compositor/compositor.ts`
- Modify: `src/compositor/compositor.test.ts`

**Interfaces:**
- Consumes all product, project, Slide, media, rendering, compositor, and recording modules from Tasks 1–6.
- Produces the complete local-first Excalicap browser product.

- [ ] **Step 1: Replace validator UI tests with product acceptance tests**

Assert:

```ts
expect(screen.getByRole("button", { name: "录制" })).toBeEnabled();
expect(screen.getByRole("button", { name: "设置" })).toBeEnabled();
expect(screen.getByRole("button", { name: "提词器" })).toBeEnabled();
expect(screen.getByText("幻灯片")).toBeInTheDocument();
expect(screen.queryByText("高清录制验证器")).not.toBeInTheDocument();
expect(screen.queryByText("资源状态")).not.toBeInTheDocument();
```

Also cover add/delete/navigate Slide, settings application, automatic preparation, camera-missing microphone fallback, whiteboard-only recording, pause/resume/stop, final download, and autosave status.

- [ ] **Step 2: Run App tests and verify RED**

Run `npx vitest run src/App.test.tsx`.
Expected: FAIL because the validator shell still renders.

- [ ] **Step 3: Build the full-screen workspace**

Render Excalidraw edge-to-edge. Hide Excalidraw’s conflicting top-right UI through supported props and narrow CSS selectors, retain its central tool palette, left menu, library, zoom, undo, and redo, then overlay `ProductTopbar` and `SlideRail` in the screenshot’s positions.

- [ ] **Step 4: Integrate Slide operations**

Track `currentSlideId`, scroll to the selected Frame with `api.scrollToContent(frame, { fitToContent: true })`, update scenes with `api.updateScene`, add and delete through `slide-service`, duplicate with rewritten references, and apply drag reorder. Arrow keys switch Slides when focus is outside editable controls.

- [ ] **Step 5: Integrate persistence**

Load the current IndexedDB snapshot through Excalidraw `initialData`, add restored files through `api.addFiles`, queue an autosave on scene changes, force save before recording and after stopping, and show `正在保存`, `已保存`, or `保存失败` in the topbar.

- [ ] **Step 6: Integrate settings and Frame resizing**

Persist product settings to localStorage. When the output aspect ratio changes, resize every Frame to the selected output ratio while preserving its top-left anchor and spacing; warn before applying if content may extend outside the new Frame.

- [ ] **Step 7: Integrate preparation and optional media**

Clicking `录制` must automatically run scene/font/image/codec/storage checks and acquire only enabled devices. Open `RecordingPreparation` with warnings. Missing camera or microphone is non-blocking; missing Frame, file, font, encoder, or invalid dimensions is blocking.

- [ ] **Step 8: Integrate recording**

Create the target-size compositor Canvas offscreen, render the current Frame directly from scene data, draw the configured CSS background, Slide padding/radius, camera shape and position, and cursor. Start the existing MediaRecorder engine only after preparation confirmation. Update the whiteboard cache when the scene or current Slide changes.

- [ ] **Step 9: Integrate recording state and completion**

Use `RecordingClock`; show the HUD during recording; pause on page hide; allow direction-key Slide switching; stop safely on microphone loss; continue without camera on camera loss; materialize the final Blob before OPFS cleanup; name the file `Excalicap-YYYYMMDD-HHmmss.<ext>`.

- [ ] **Step 10: Implement final product styling**

Match the screenshot with a white canvas, restrained warm-gray floating surfaces, compact rounded controls, soft shadow, red recording accent, purple Excalidraw selected-tool accent, floating right Slide rail, and no generic dashboard chrome. Support desktop widths down to `1024 px`; below that show a clear desktop recommendation without breaking the editor.

- [ ] **Step 11: Run automated verification**

Run `npm test`, `npm run typecheck`, `npm run build`, `npm audit --audit-level=high`, and `git diff --check`.

---

### Task 8: Browser Product Acceptance

**Files:**
- Modify only if an acceptance defect is reproduced in product code.

**Interfaces:**
- Validates the complete built product through the visible browser.

- [ ] **Step 1: Verify visual structure**

Confirm the viewport contains the infinite white workspace, centered Excalidraw toolbar, top-right settings/teleprompter/record controls, right Slide rail, left menu, and bottom-left zoom/history controls. Confirm validator headings, permanent diagnostics, and permanent recording preview are absent.

- [ ] **Step 2: Verify Slide workflow**

Add two Slides, switch by number and arrow keys, reorder by drag, duplicate one Slide, delete one Slide, reload, and confirm the restored order and content.

- [ ] **Step 3: Verify settings and teleprompter**

Switch between `16:9`, `3:4`, and custom output, apply a legal gradient background, adjust camera and cursor settings, open and edit the teleprompter, start auto-scroll, and confirm the teleprompter is absent from the recording Canvas.

- [ ] **Step 4: Verify device fallback**

On the current Mac mini with no detected camera, enable both camera and microphone. Confirm preparation reports the missing camera as a warning, retains the available microphone, and allows recording. Then disable microphone and confirm whiteboard-only recording works without a device error.

- [ ] **Step 5: Verify real recording**

Record at `1080×1440 px / 30 fps`, switch Slides, pause, resume, stop, fetch the generated Blob URL, and inspect metadata. Confirm the output has the exact target size, expected container, one video track, and an audio track only when microphone input was available.

- [ ] **Step 6: Final repository review**

Run `git status --short --untracked-files=all`, `git diff --cached --name-status`, and the same status command in the main worktree. Report all remaining upstream dependency warnings and browser/platform limitations. Do not stage or commit.

