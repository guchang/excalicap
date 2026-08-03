# Phase 1 High-resolution Validator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local React validator that proves an Excalidraw Frame can be rendered from scene data at exact target pixels, composited with camera and cursor, and recorded with microphone audio through a runtime-probed MediaRecorder path.

**Architecture:** Keep the Excalidraw editor as the authoring surface, but render the current Frame into a separate whiteboard cache with `exportToCanvas()`. A compositor owns the final target-size `HTMLCanvasElement`; a small recording engine captures that canvas, adds one microphone track, and writes chunks through a storage sink. Pure dimension, preflight, and MIME selection rules stay outside React and are covered with Vitest.

**Tech Stack:** React `19.2.8`, React DOM `19.2.8`, TypeScript `5.9.3`, Vite `8.1.5`, Vitest `4.1.10`, jsdom `29.1.1`, Testing Library React `16.3.2`, Excalidraw `0.18.1`, native Canvas/MediaRecorder/OPFS browser APIs.

## Global Constraints

- Work only in `feature/phase1-validator` at `.worktrees/phase1-validator`; do not modify `main`.
- Do not stage or commit without separate user authorization.
- Pin `@excalidraw/excalidraw` to exact version `0.18.1`.
- The recording whiteboard source must be Excalidraw scene data plus `exportingFrame`; never copy the editor display Canvas.
- Support exact `1080×1440 px` and `1620×2160 px` output profiles at `30 fps`.
- Override Excalidraw image import defaults so images are not silently capped at `1440 px`.
- Use `MediaRecorder` first; do not install Mediabunny or implement WebCodecs in this plan.
- OPFS is temporary recording storage only; do not save raw camera, raw microphone, timelines, or intermediate frame sequences.
- Do not copy Excalicord private source code or unlicensed background assets.

---

## File Map

- `package.json`: scripts and exact dependency versions.
- `vite.config.ts`: React build and Vitest jsdom configuration.
- `tsconfig.json`: strict browser TypeScript configuration.
- `index.html`: Vite entry document.
- `src/main.tsx`: React bootstrap and Excalidraw stylesheet import.
- `src/App.tsx`: validator screen and browser-resource lifecycle.
- `src/styles.css`: original-inspired validator layout without third-party assets.
- `src/rendering/output-profile.ts`: target dimensions and Frame scale calculation.
- `src/rendering/render-frame.ts`: direct Excalidraw scene-to-Canvas adapter.
- `src/rendering/preflight.ts`: image and font readiness checks.
- `src/compositor/compositor.ts`: background, whiteboard, camera, and cursor composition.
- `src/recording/capabilities.ts`: MIME candidate probing.
- `src/recording/chunk-sink.ts`: memory and OPFS temporary chunk sinks.
- `src/recording/media-recorder-engine.ts`: MediaRecorder state and track lifecycle.
- `src/recording/types.ts`: recording contracts and diagnostics.
- `src/test/setup.ts`: DOM matcher setup.
- `src/**/*.test.ts`: behavior-focused unit tests colocated with each module.

---

### Task 1: Project Harness and Exact Output Profiles

**Files:**
- Create: `package.json`
- Create: `vite.config.ts`
- Create: `tsconfig.json`
- Create: `index.html`
- Create: `src/test/setup.ts`
- Test: `src/rendering/output-profile.test.ts`
- Create: `src/rendering/output-profile.ts`

**Interfaces:**
- Produces: `OutputProfile`, `OUTPUT_PROFILES`, and `getFrameRenderDimensions(frame, profile)`.

- [ ] **Step 1: Create the test/build harness**

Use exact dependency versions from the global constraints. Configure scripts:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  }
}
```

Vitest must use `jsdom`, load `src/test/setup.ts`, and enable globals.

- [ ] **Step 2: Install dependencies**

Run:

```bash
npm install
```

Expected: `package-lock.json` is created and npm exits `0`.

- [ ] **Step 3: Write the failing output-profile tests**

Cover literal expectations:

```ts
expect(getFrameRenderDimensions(
  { width: 1080, height: 1440 },
  OUTPUT_PROFILES.portraitHigh,
)).toEqual({ width: 1620, height: 2160, scale: 1.5 });
```

Also assert that a mismatched Frame ratio throws a descriptive error instead of stretching.

- [ ] **Step 4: Run the targeted test and verify RED**

Run:

```bash
npx vitest run src/rendering/output-profile.test.ts
```

Expected: FAIL because `output-profile.ts` does not exist.

- [ ] **Step 5: Implement the minimum profile calculation**

Define:

```ts
export interface OutputProfile {
  readonly width: number;
  readonly height: number;
  readonly fps: 30;
}

export function getFrameRenderDimensions(
  frame: { width: number; height: number },
  profile: OutputProfile,
): { width: number; height: number; scale: number }
```

Require the width and height scale factors to differ by no more than `0.0001`.

- [ ] **Step 6: Run the targeted test and verify GREEN**

Run the targeted Vitest command and then `npm run typecheck`.

- [ ] **Step 7: Review checkpoint**

Run `git diff --check` and `git status --short`. Do not stage or commit.

---

### Task 2: Recording Preflight

**Files:**
- Test: `src/rendering/preflight.test.ts`
- Create: `src/rendering/preflight.ts`

**Interfaces:**
- Consumes: Excalidraw-like image elements and `BinaryFiles`.
- Produces: `runScenePreflight(input): Promise<PreflightResult>`.

- [ ] **Step 1: Write failing tests for missing and undersized images**

Use complete fixtures with an image element containing `fileId`, rendered width/height, and a file containing a `dataURL`. Assert:

- missing `fileId` produces a blocking issue;
- absent `files[fileId]` produces a blocking issue;
- decoded source pixels smaller than target display pixels produce a warning;
- a valid high-resolution source produces no image issue.

- [ ] **Step 2: Write a failing test for unavailable fonts**

Inject a font checker whose `check(font, text)` returns `false`; assert a blocking issue includes the font family and sample text category.

- [ ] **Step 3: Run the targeted test and verify RED**

Expected: FAIL because `runScenePreflight` is missing.

- [ ] **Step 4: Implement preflight with injected browser boundaries**

Define:

```ts
export interface PreflightDependencies {
  decodeImage(dataUrl: string): Promise<{ width: number; height: number }>;
  checkFont(font: string, text: string): boolean;
}

export interface PreflightResult {
  readonly blocking: readonly PreflightIssue[];
  readonly warnings: readonly PreflightIssue[];
}
```

Keep decoding and font APIs injected so tests exercise real preflight decisions without mocking Excalidraw.

- [ ] **Step 5: Run targeted and full tests**

Run the targeted test, then `npm test`, then `npm run typecheck`.

- [ ] **Step 6: Review checkpoint**

Run `git diff --check`; do not stage or commit.

---

### Task 3: MediaRecorder Capability Selection

**Files:**
- Create: `src/recording/types.ts`
- Test: `src/recording/capabilities.test.ts`
- Create: `src/recording/capabilities.ts`

**Interfaces:**
- Produces: `selectRecorderCapability(input): Promise<RecorderCapability>`.
- Candidate order is MP4 H.264/AAC, WebM VP9/Opus, then WebM VP8/Opus.

- [ ] **Step 1: Write failing literal candidate-selection tests**

Assert:

- the first supported and smooth candidate is selected;
- unsupported candidates are skipped;
- a failed MediaCapabilities query does not override `isTypeSupported`;
- no supported candidate returns a blocking capability result.

- [ ] **Step 2: Run the test and verify RED**

Expected: FAIL because the module is missing.

- [ ] **Step 3: Implement the minimum probe**

Accept injected functions:

```ts
export interface CapabilityProbe {
  isTypeSupported(mimeType: string): boolean;
  encodingInfo?(
    config: MediaEncodingConfiguration,
  ): Promise<MediaCapabilitiesEncodingInfo>;
}
```

Return the actual selected MIME, requested video bitrate, requested audio bitrate, width, height, and fps for diagnostics.

- [ ] **Step 4: Run targeted and full tests**

Run targeted Vitest, `npm test`, and `npm run typecheck`.

- [ ] **Step 5: Review checkpoint**

Run `git diff --check`; do not stage or commit.

---

### Task 4: Direct Frame Renderer and Compositor

**Files:**
- Test: `src/rendering/render-frame.test.ts`
- Create: `src/rendering/render-frame.ts`
- Test: `src/compositor/compositor.test.ts`
- Create: `src/compositor/compositor.ts`

**Interfaces:**
- Produces: `renderFrameToCanvas(request, exportScene)`.
- Produces: `createCompositor(canvas, profile)` with `setWhiteboard()`, `setCamera()`, `setCursor()`, `draw()`, and `dispose()`.

- [ ] **Step 1: Write a failing renderer contract test**

Inject `exportScene` and assert the request includes:

- the provided scene elements;
- the full files map;
- `exportingFrame`;
- `getDimensions()` returning exact profile width, height, and scale.

The assertion targets Excalicap’s adapter contract, not Excalidraw’s internal behavior.

- [ ] **Step 2: Run renderer test and verify RED**

Expected: FAIL because `renderFrameToCanvas` is missing.

- [ ] **Step 3: Implement the direct renderer adapter**

Call the injected `exportScene` with scene data. Do not accept an editor Canvas argument anywhere in the public interface.

- [ ] **Step 4: Write failing compositor behavior tests**

Use a real jsdom Canvas element with a narrow `CanvasRenderingContext2D` test double. Assert draw order:

1. background;
2. whiteboard cache;
3. camera;
4. cursor.

Assert target canvas width and height equal the selected output profile.

- [ ] **Step 5: Implement the compositor**

Use `requestAnimationFrame()` only while running. Map pointer coordinates from the current Frame’s editor-space bounds into target pixels. Hide the pointer when it lies outside the Frame.

- [ ] **Step 6: Run targeted and full verification**

Run both targeted tests, `npm test`, and `npm run typecheck`.

- [ ] **Step 7: Review checkpoint**

Search `src/` for `editorCanvas` and verify there is no production reference. Do not stage or commit.

---

### Task 5: Chunk Sink and MediaRecorder Engine

**Files:**
- Test: `src/recording/chunk-sink.test.ts`
- Create: `src/recording/chunk-sink.ts`
- Test: `src/recording/media-recorder-engine.test.ts`
- Create: `src/recording/media-recorder-engine.ts`

**Interfaces:**
- Produces: `ChunkSink` with `write(blob)`, `finish(mimeType)`, and `abort()`.
- Produces: `MediaRecorderEngine` with `start()`, `pause()`, `resume()`, `stop()`, and `abort()`.

- [ ] **Step 1: Write failing serial sink tests**

Use a controlled asynchronous writer and assert the second write begins only after the first write resolves. Assert `finish()` waits for all queued writes.

- [ ] **Step 2: Implement memory and OPFS sinks**

The OPFS sink writes to one temporary file and exposes diagnostics for bytes written. If OPFS is unavailable, use the memory sink only for the short validator and show that limitation in diagnostics.

- [ ] **Step 3: Write failing engine state tests**

Use a complete `MediaRecorder` test double and assert:

- `start()` combines the canvas video track with at most one microphone audio track;
- every non-empty `dataavailable` Blob is written to the sink;
- `pause()` and `resume()` reject invalid state transitions;
- `stop()` waits for the final chunk and returns the final Blob;
- `abort()` stops all owned tracks and retains sink recovery information.

- [ ] **Step 4: Run engine test and verify RED**

Expected: FAIL because `MediaRecorderEngine` is missing.

- [ ] **Step 5: Implement the minimum state machine**

Use states `idle`, `recording`, `paused`, `stopping`, `completed`, and `failed`. Do not implement device hot-switching or raw-track persistence.

- [ ] **Step 6: Run targeted and full verification**

Run targeted tests, `npm test`, and `npm run typecheck`.

- [ ] **Step 7: Review checkpoint**

Run `git diff --check`; do not stage or commit.

---

### Task 6: Excalidraw Validator UI

**Files:**
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/styles.css`
- Test: `src/App.test.tsx`

**Interfaces:**
- Consumes all modules from Tasks 1–5.
- Produces a browser UI for editing, preflighting, previewing, recording, pausing, stopping, and downloading a validation clip.

- [ ] **Step 1: Write failing UI state tests**

Render the real App shell and assert:

- the initial status is “未检查”;
- the record action is disabled before preflight;
- selecting the high profile displays `1620 × 2160`;
- a failed preflight lists its blocking issues;
- a successful preflight enables the record action.

Mock only browser-owned media APIs at the boundary; render the real React components that contain Excalicap behavior.

- [ ] **Step 2: Run App test and verify RED**

Expected: FAIL because `App.tsx` does not exist.

- [ ] **Step 3: Implement the original-inspired validator shell**

Layout:

```text
┌──────────────────────────────────────────────────────────────┐
│ Excalicap Validator       1080×1440 / 1620×2160   检查  录制 │
├───────────────────────────────────┬──────────────────────────┤
│                                   │ 状态与诊断               │
│          Excalidraw 编辑区         │ - 资源预检               │
│                                   │ - 编码格式               │
│                                   │ - 分辨率 / fps           │
│                                   │ - 临时存储               │
├───────────────────────────────────┴──────────────────────────┤
│ 录制预览：目标 Canvas（背景 + 白板 + 摄像头 + 光标）          │
└──────────────────────────────────────────────────────────────┘
```

Use the original Excalidraw editing surface and restrained neutral controls. Do not add decorative marketing sections.

- [ ] **Step 4: Configure Excalidraw**

- Set `imageOptions.maxWidthOrHeight` to at least `3840`.
- Raise `maxFileSizeBytes` to support the high-resolution screenshot fixture.
- Capture `excalidrawAPI`.
- Identify the current Frame from scene selection or the first Frame.
- Pass scene elements, app state, files, and the current Frame to `renderFrameToCanvas()`.

- [ ] **Step 5: Wire camera, microphone, cursor, and recording**

- Request camera/microphone only after a user action.
- Draw camera video into the compositor, not as a separate recorder video track.
- Keep the teleprompter outside this validator phase.
- Auto-pause or stop on `visibilitychange`.
- Create a download URL only for the final recording and revoke it during cleanup.

- [ ] **Step 6: Run automated verification**

Run:

```bash
npm test
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 7: Run browser verification**

Start Vite and inspect the app in Chrome:

- editor loads without runtime errors;
- output selector changes exact Canvas backing dimensions;
- high profile preview reports `1620×2160`;
- preflight blocks when no Frame exists;
- adding or selecting a Frame allows a scene render;
- camera permission produces a live preview when granted;
- recording capability output shows the actual selected MIME;
- a short recording can be stopped and downloaded.

- [ ] **Step 8: Final uncommitted-change review**

Run:

```bash
git status --short
git diff --check
git diff --stat
```

Report every changed file and all browser limitations. Do not stage or commit.

