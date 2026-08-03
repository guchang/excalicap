# 最近录制保留与双视频输出实现计划

> 执行依据：`docs/superpowers/specs/2026-07-29-retained-dual-recording-design.md`

**目标：** 关闭结果面板后仍可重新下载最近一次成功录制；有摄像头时同步输出带麦克风声音的合成成片和原始矩形摄像头视频。

**架构：** 保留 `MediaRecorderEngine` 作为单个录制任务，但不再让它停止调用方提供的源轨。新增一个只负责同步开始、暂停、继续、停止和错误归并的双录制协调器。App 继续拥有设备流与 Canvas 捕获流的生命周期，并把“最近成功结果”和“结果面板是否打开”拆成两个状态。

**技术栈：** React 19、TypeScript、MediaRecorder、Vitest、Testing Library。

---

## 任务 1：让单录制引擎支持借用任意视频流

**文件：**

- 修改：`src/recording/media-recorder-engine.ts`
- 修改：`src/recording/media-recorder-engine.test.ts`

**步骤：**

1. 先修改测试，把 `canvasStream` 改为通用 `videoStream`，并断言停止或中止录制不会停止调用方提供的视频、麦克风轨。
2. 运行单测并确认新断言失败。
3. 将启动参数改为 `videoStream`，移除引擎内部的源轨所有权与 `stopOwnedTracks()`。
4. 保持“只取一条视频轨和一条麦克风轨”的既有合同。
5. 运行单测确认通过。

## 任务 2：增加双录制协调器

**文件：**

- 新增：`src/recording/dual-recording-session.ts`
- 新增：`src/recording/dual-recording-session.test.ts`

**步骤：**

1. 先写失败测试，覆盖：
   - 无摄像头时只操作合成任务。
   - 有摄像头时开始、暂停、继续、停止同时作用于两个任务。
   - 摄像头任务失败时仍返回成功的合成 Blob 和摄像头错误。
   - 合成任务失败时中止/丢弃摄像头结果并抛出合成错误。
2. 运行测试并确认因模块不存在而失败。
3. 实现最小 `DualRecordingSession`，只协调任务，不创建媒体流、不接管源轨。
4. 运行协调器测试确认通过。

## 任务 3：扩展录制结果模型与界面

**文件：**

- 修改：`src/components/RecordingResult.tsx`
- 修改：`src/components/ProductTopbar.tsx`
- 修改：`src/components/icons.tsx`
- 修改：`src/components/product-components.test.tsx`
- 修改：`src/styles.css`

**步骤：**

1. 先补组件测试，覆盖：
   - “上次录制”仅在存在结果时显示并可点击。
   - 有摄像头时显示两个独立下载入口。
   - 无摄像头时显示明确说明。
   - 摄像头原片失败时仍保留合成下载入口并显示错误。
2. 运行测试确认失败。
3. 为 `RecordingResult` 引入合成资产、可选摄像头资产、可选摄像头错误和 `open` 状态。
4. 在 `ProductTopbar` 中条件显示“上次录制”按钮。
5. 增加一个与现有线性图标一致的视频历史图标，并按已确认版式调整结果卡片样式。
6. 运行组件测试确认通过。

## 任务 4：把双录制和最近结果生命周期接入 App

**文件：**

- 修改：`src/App.tsx`
- 修改：`src/App.test.tsx`

**步骤：**

1. 先补 App 级失败测试，覆盖：
   - 有摄像头时创建两个带同一麦克风轨的录制流，并产出两个下载。
   - 关闭结果面板后显示“上次录制”，重新打开仍是同一 Blob URL。
   - 开始下一次录制不撤销旧 URL。
   - 新录制成功后才撤销旧的全部 URL。
   - 新录制失败时旧结果仍可重新打开。
   - 卸载时撤销当前结果的全部 URL。
2. 运行相关测试并确认失败。
3. 用 `recordingResult`、`recordingResultOpen` 和 `recordingError` 替换单一 `download` 状态。
4. 开始录制时：
   - 为合成和可选摄像头任务分别创建独立 `ChunkSink` 与 `MediaRecorderEngine`。
   - 合成任务使用 Canvas 视频轨 + 麦克风音轨。
   - 摄像头任务使用原始摄像头视频轨 + 同一麦克风音轨。
   - 保存 Canvas 捕获流引用，供 App 收尾时停止其轨。
5. 暂停、继续和可见性自动暂停改为操作双录制协调器。
6. 停止录制时并行完成两个任务，在两项都收尾后再统一停止设备与 Canvas 捕获轨。
7. 用同一个时间戳生成：
   - `Excalicap-YYYYMMDD-HHmmss.ext`
   - `Excalicap-camera-YYYYMMDD-HHmmss.ext`
8. 只有合成成功时才原子替换最近结果；替换或卸载时撤销旧结果的全部 Blob URL。
9. 关闭弹窗只关闭显示状态，不清空结果。
10. 运行 App 测试确认通过。

## 任务 5：完整验证

**文件：**

- 只读验证全部改动文件

**步骤：**

1. 运行录制相关测试：

   ```bash
   npm test -- src/recording/media-recorder-engine.test.ts src/recording/dual-recording-session.test.ts src/components/product-components.test.tsx src/App.test.tsx
   ```

2. 运行全量测试：

   ```bash
   npm test
   ```

3. 运行类型检查：

   ```bash
   npm run typecheck
   ```

4. 运行生产构建：

   ```bash
   npm run build
   ```

5. 在本地浏览器手工核对：
   - 无摄像头录制只显示合成成片。
   - 有摄像头录制显示合成成片与摄像头原片。
   - 关闭后“上次录制”可重新打开。
   - 开始新录制时旧结果仍可下载。
   - 视频文件包含预期视频轨与麦克风音轨。

6. 检查 `git diff --check` 和窄范围 diff，确保没有无关格式化、依赖或持久化改动。
