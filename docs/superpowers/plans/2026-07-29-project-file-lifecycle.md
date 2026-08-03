# Project File Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add menu-driven new, open, save, and save-as project actions that read and write standard `.excalidraw` files without registering keyboard shortcuts.

**Architecture:** Add a focused browser file gateway that owns picker, handle, write, and download-fallback behavior. Keep scene serialization and restoration in `App.tsx`, where the Excalidraw API and existing Slide normalization already live, and render the actions through Excalidraw's `MainMenu`.

**Tech Stack:** React 19, TypeScript 5.9, Excalidraw 0.18.1, Vitest, Testing Library, File System Access API.

## Global Constraints

- Do not register project keyboard shortcuts.
- Do not add dependencies.
- Keep IndexedDB autosave as recovery-only storage.
- Do not stage, commit, push, deploy, or modify unrelated product features.
- Use standard Excalidraw JSON serialization and restoration.

---

### Task 1: Browser project file gateway

**Files:**
- Create: `src/project/project-file.ts`
- Create: `src/project/project-file.test.ts`

**Interfaces:**
- Produces: `ProjectFileHandle`, `OpenedProjectFile`, `ProjectFileGateway`, and `createBrowserProjectFileGateway(window, document)`.
- `ProjectFileGateway.open()` returns a selected `File` and optional writable handle.
- `ProjectFileGateway.save(blob, suggestedName, handle?)` writes to the supplied handle, asks for a new handle, or downloads as fallback.

- [x] **Step 1: Write failing tests for open, write-back, save-as, cancellation, and fallback download**

  Use injected picker functions and DOM objects. Verify selected file/handle identity, exact serialized blob passed to `write`, handle replacement only after successful save, cancellation returning `null`, and fallback anchor filename.

- [x] **Step 2: Run the gateway test and verify RED**

  Run: `npm test -- src/project/project-file.test.ts`

  Expected: FAIL because `project-file.ts` does not exist.

- [x] **Step 3: Implement the minimal gateway**

  Define narrow local interfaces for `showOpenFilePicker`, `showSaveFilePicker`, writable handles, and cancellation detection. Use `.excalidraw` accept filters and a download fallback without introducing a package.

- [x] **Step 4: Run the gateway test and verify GREEN**

  Run: `npm test -- src/project/project-file.test.ts`

  Expected: all gateway tests pass.

### Task 2: App project lifecycle and menu

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `ProjectFileGateway` from Task 1.
- Produces: Excalidraw `MainMenu` actions named `新建项目`, `打开项目…`, `保存`, and `另存为…`.

- [x] **Step 1: Write failing integration tests**

  Extend the Excalidraw test double to render `MainMenu` children and expose `serializeAsJSON` / `loadFromBlob`. Cover: no shortcut listeners; new project creates one profile-sized locked Slide and unbinds; open restores and normalizes the selected scene; save writes back to an existing handle; unbound save invokes save-as; save-as replaces the bound handle; cancelled or failed operations preserve the scene.

- [x] **Step 2: Run the App test and verify RED**

  Run: `npm test -- src/App.test.tsx`

  Expected: FAIL because the four menu actions are absent.

- [x] **Step 3: Implement the minimal App integration**

  Add refs for gateway, bound handle, and file-dirty state. Build the current blob using `serializeAsJSON`, load with `loadFromBlob`, run existing `normalizeSlideFrames`, update the Excalidraw scene/files/slide rail, and provide the four `MainMenu.Item` actions. New project uses `createSlide([], profile)` and clears the recovery snapshot before queueing the new one.

- [x] **Step 4: Run the App test and verify GREEN**

  Run: `npm test -- src/App.test.tsx`

  Expected: all App tests pass.

### Task 3: Regression verification

**Files:**
- Review: `src/project/project-file.ts`
- Review: `src/App.tsx`
- Review: all changed tests and docs

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: verified build with no unrelated changes.

- [x] **Step 1: Run focused tests**

  Run: `npm test -- src/project/project-file.test.ts src/project/project-storage.test.ts src/slides/slide-service.test.ts src/App.test.tsx`

- [x] **Step 2: Run the complete test suite**

  Run: `npm test`

- [x] **Step 3: Run type checking**

  Run: `npm run typecheck`

- [x] **Step 4: Run the production build**

  Run: `npm run build`

- [x] **Step 5: Review the final diff**

  Run: `git status --short && git diff --stat && git diff -- src/project/project-file.ts src/project/project-file.test.ts src/App.tsx src/App.test.tsx`

  Confirm every changed production line is required by the approved file lifecycle and no shortcut registration was added.
