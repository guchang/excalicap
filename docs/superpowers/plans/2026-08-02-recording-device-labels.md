# Recording Device Labels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the actual camera and microphone track names in recording preparation and provide a safe path back to device settings.

**Architecture:** Keep acquired media streams as the runtime truth. Read `MediaStreamTrack.label` in `App`, pass names plus enabled/connected state into the presentational `RecordingPreparation` component, and reuse existing preparation cleanup before opening `SettingsDialog`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, browser Media Capture APIs.

---

### Task 1: Specify device-name presentation

**Files:**
- Modify: `src/components/product-components.test.tsx`
- Modify: `src/components/RecordingPreparation.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing component tests**

Add props for `cameraDeviceName`, `microphoneDeviceName`, `microphoneEnabled`, and `onChangeDevices`. Assert that actual names appear with `title`, empty labels use “已连接，但浏览器未提供设备名称”, disabled inputs are distinct from failed inputs, and “更换设备” invokes its callback.

- [ ] **Step 2: Run the component test and verify RED**

Run: `npm test -- src/components/product-components.test.tsx`

Expected: TypeScript/Vitest failure because the new props and “更换设备” UI do not exist.

- [ ] **Step 3: Implement the minimal presentational API**

Extend `RecordingPreparationProps` with:

```ts
readonly cameraDeviceName: string | null;
readonly microphoneDeviceName: string | null;
readonly microphoneEnabled: boolean;
readonly onChangeDevices: () => void;
```

Use a small local formatter that returns the actual non-empty label, the privacy fallback, “未启用”, or “连接失败”. Render the two device names in the existing definition list and add a `更换设备` button. Add only the CSS needed for one-line ellipsis and button alignment.

- [ ] **Step 4: Run the component test and verify GREEN**

Run: `npm test -- src/components/product-components.test.tsx`

Expected: the component test file passes with no failures.

### Task 2: Feed actual acquired-track labels into the panel

**Files:**
- Modify: `src/media/device-controller.ts`
- Modify: `src/App.test.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Write failing App tests**

Give `BrowserTrack` a `label` matching its test source. Assert that a successful camera and microphone acquisition renders “USB Camera” and “USB Microphone”. Add a test that clicks “更换设备”, verifies both acquired tracks are stopped, closes recording preparation, and opens the existing “录制设置” dialog.

- [ ] **Step 2: Run the App test and verify RED**

Run: `npm test -- src/App.test.tsx`

Expected: failures because `App` does not pass track labels or expose the change-device action.

- [ ] **Step 3: Implement the minimal App data flow**

Add `readonly label: string` to `DeviceMediaTrack`. At render time, derive names only from:

```ts
acquiredMediaRef.current?.cameraStream?.getVideoTracks()[0]?.label ?? null
acquiredMediaRef.current?.microphoneStream?.getAudioTracks()[0]?.label ?? null
```

Pass those values and `settings.microphone.enabled` to `RecordingPreparation`. Add a callback that invokes existing preparation cancellation/track cleanup and then calls existing `openSettings()`.

- [ ] **Step 4: Run the App test and verify GREEN**

Run: `npm test -- src/App.test.tsx`

Expected: the App test file passes with no failures.

### Task 3: Verify the feature boundary

**Files:**
- Verify: `src/components/RecordingPreparation.tsx`
- Verify: `src/App.tsx`
- Verify: `src/media/device-controller.ts`
- Verify: `src/components/product-components.test.tsx`
- Verify: `src/App.test.tsx`

- [ ] **Step 1: Run focused tests**

Run: `npm test -- src/components/product-components.test.tsx src/App.test.tsx src/media/device-controller.test.ts`

Expected: all focused files and tests pass.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: zero failed files and zero failed tests.

- [ ] **Step 3: Run static and production checks**

Run: `npm run typecheck && npm run build && git diff --check`

Expected: exit code `0`; existing Vite chunk-size warnings are allowed, TypeScript and whitespace errors are not.

- [ ] **Step 4: Review the final diff against the spec**

Confirm that no dependency, recorder, result lifecycle, browser permission, Git staging, commit, or deployment behavior changed.

No commit step is included because this task authorizes local implementation but not Git staging or commit.

