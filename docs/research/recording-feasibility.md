# Excalicap 高清实时录制可行性研究

> 调研日期：2026-07-27
> 调研范围：Excalidraw 官方文档与源码、W3C/MDN Web 平台规范、Chromium 官方发布说明；附带核验 Mediabunny 官方能力边界。
> 本文不包含实现结果。凡是没有在 Excalicap 中实测的性能、画质和兼容性结论，均明确标为“设计推断”或“待实测”。

## 1. 结论先行

### 已验证事实

“独立目标分辨率 `HTMLCanvasElement` + `captureStream()` + `MediaRecorder`”在 Web 平台 API 层面是可行的：

1. Excalidraw 官方 `exportToCanvas()` 能直接从 `elements + appState + files` 生成新的 Canvas，支持通过 `getDimensions()` 控制导出 Canvas 的像素宽高和渲染比例；它不要求读取编辑器当前显示 Canvas。[Excalidraw Export Utilities](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/utils/export)
2. `HTMLCanvasElement.captureStream()` 产生一个实时视频 `MediaStreamTrack`，该轨道的尺寸与源 Canvas 尺寸一致。因此，源 Canvas 为 `1620×2160 px` 时，录制轨道可以以该像素尺寸进入编码器，而不受编辑器 CSS 显示尺寸影响。[W3C Media Capture from DOM Elements](https://w3c.github.io/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)
3. `MediaRecorder` 可以录制由 Canvas 视频轨道和麦克风音频轨道组成的 `MediaStream`，支持暂停、继续、分片返回 `Blob`、停止和运行时 MIME 能力检测。[W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)
4. Chrome 126 已正式加入 `MediaRecorder` 的 MP4 音视频封装支持；但具体容器、视频编码、音频编码及目标分辨率组合仍必须在运行时检测。[Chrome 126 release notes](https://developer.chrome.com/release-notes/126#mp4_container_support_for_mediarecorder)
5. OPFS 可以把录制片段写入源私有文件，避免应用把整段视频长期堆在 JavaScript 数组内；但它受浏览器配额、站点数据清理和存储驱逐规则约束。[MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)

### 设计判断

该路线足以进入“最窄纵向验证器”阶段，但目前还不能声称已经满足产品画质和 30 分钟稳定性需求。它解决的是源渲染分辨率问题，不自动保证以下结果：

- `1620×2160 px / 30 fps` 在目标 Mac 和 Chrome 上能持续实时编码；
- H.264/AAC/MP4 组合在所有目标设备上都可用；
- 实际编码码率足以保留小字与细线；
- 复杂 Excalidraw 场景在连续画线时能及时刷新高清缓存；
- 暂停后的最终成品时长在目标浏览器上严格排除暂停区间；
- 录制分片写入 OPFS 后，崩溃恢复、最终封装和清理均可靠。

因此，推荐结论是：

> 保留“独立目标分辨率 Canvas”作为不可退让的架构边界；第一轮编码器先验证 `MediaRecorder`，不要默认上 WebCodecs。只有真实样本证明格式、画质、帧率、暂停或长录稳定性不达标时，再启用 WebCodecs + Mediabunny。

## 2. 术语与统一口径

| 中文名 | 代码字段 | 单位 | 含义 |
| --- | --- | --- | --- |
| 目标宽度 | `target_width_px` | `px` | 最终输出 Canvas 与视频轨道的像素宽度 |
| 目标高度 | `target_height_px` | `px` | 最终输出 Canvas 与视频轨道的像素高度 |
| 目标帧率 | `target_fps` | `fps` | 请求的输出帧率，例如 `30 fps` |
| 实际帧率 | `actual_fps` | `fps` | 由最终视频时间戳或 `ffprobe` 计算的真实帧率 |
| 渲染帧数 | `rendered_frames` | 帧 | 应用完成合成并提交到输出 Canvas 的帧数 |
| 丢帧数 | `dropped_frames` | 帧 | 目标时间轴应有帧数与最终有效视频帧数之差 |
| 视频码率 | `video_bitrate_mbps` | `Mbps` | 最终视频平均码率；构造参数只是目标提示，不是硬保证 |
| 音画时长差 | `av_duration_delta_ms` | `ms` | 最终视频轨与音频轨时长之差 |
| 场景更新延迟 | `scene_update_latency_ms` | `ms` | 编辑状态变化到高清白板缓存可用于合成的延迟 |
| 临时存储占用 | `temporary_storage_mb` | `MB` | 录制期间 OPFS 临时文件占用 |

“输出尺寸”只表示像素矩阵大小；“清晰度”还受渲染源、字体、原图、缩放算法、编码器和码率共同影响。本文不把两者混为同一指标。

## 3. Excalidraw 能否按目标尺寸直接渲染

### 3.1 公开 API 能力

#### 已验证事实

官方 `exportToCanvas()` 接收：

- `elements`：要导出的 Excalidraw 元素；
- `appState`：导出背景、主题和其他场景状态；
- `files`：场景图片对应的 `BinaryFiles`；
- `getDimensions(width, height)`：根据场景自然边界，返回目标 `width`、`height` 和可选 `scale`；
- `maxWidthOrHeight`：限制输出图最大边；
- `exportPadding`：导出边距。

它返回包含导出内容的新 Canvas。官方示例直接从 `excalidrawAPI.getSceneElements()` 与 `excalidrawAPI.getFiles()` 取真值，再调用 `exportToCanvas()`。[官方 Export Utilities](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/utils/export)

`initialData` 的官方结构也明确包含 `elements`、`appState` 与 `files`，其中 `files` 是场景中加入的 `BinaryFiles`。[官方 initialData 文档](https://docs.excalidraw.com/docs/%40excalidraw/excalidraw/api/props/initialdata)

#### 版本边界

公开文档页明显滞后，并明确写着导出工具仍在改进。实现时不应照着 `master` 的未发布私有接口猜测，而应固定 npm 包版本，并对该版本做契约测试。

本次把当前 npm 最新稳定版 `0.18.1` 对应提交 `a2ec2889babf7d2295469c6d90ebe77fae57df84` 作为源码真值：

- [`packages/utils/export.ts`：公开 `ExportOpts` 与 `exportToCanvas()`](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/utils/export.ts#L24-L159)
- [`packages/excalidraw/scene/export.ts`：实际静态场景渲染](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/scene/export.ts#L153-L255)

当前 `master` 已把公开工具移动到 `packages/utils/src/export.ts`，说明后续版本目录与内部依赖仍会变化；核心 `getDimensions` / `maxWidthOrHeight` 语义目前相同。[当前 master 固定提交源码](https://github.com/excalidraw/excalidraw/blob/b2e81e38a6fde8b3cb5dfdf2f2fb651323ad309d/packages/utils/src/export.ts#L29-L167)

### 3.2 固定 3:4 画幅不能只靠普通元素导出

#### 已验证事实

Excalidraw 的普通 Canvas 导出默认按“元素公共边界 + 两侧 `exportPadding`”计算自然画布，而不是导出编辑器当前 viewport。

当提供 `exportingFrame` 时：

- 导出的元素范围改为与该 frame 重叠的元素；
- 用 frame 本身计算输出边界；
- `exportPadding` 被强制为 `0`；
- Canvas 最终按 frame 边界裁掉超出部分。

对应稳定版源码见：

- [`prepareElementsForRender()` 对 `exportingFrame` 的处理](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/scene/export.ts#L122-L151)
- [`getCanvasSize()` 使用 frame 且清零 padding](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/scene/export.ts#L183-L213)

`getDimensions()` 返回的 Canvas `width` / `height` 与渲染 `scale` 是独立值。如果省略 `scale`，实现使用 `1`。`maxWidthOrHeight` 只在内容自然最大边超过上限时缩小；内容较小时会回退到 `appState.exportScale`，因此它不保证输出最大边严格等于参数值。[稳定版公开导出实现](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/utils/export.ts#L50-L102)

#### 设计推断

固定 3:4 幻灯片应采用以下两种方式之一：

1. **推荐：每张幻灯片使用 3:4 Excalidraw frame 作为内容边界。**
   导出时传 `exportingFrame`，用 `getDimensions()` 返回目标像素与匹配缩放比例。例如 frame 逻辑尺寸为 `1080×1440`，输出 `1620×2160 px` 时使用 `scale = 1.5`。

2. **兼容方式：导出自然内容层，再放入固定合成 Canvas。**
   先按保持宽高比的比例生成高清内容缓存，再由最终 `1080×1440` 或 `1620×2160` 合成 Canvas 居中、留边或裁切。不能把内容强行拉伸到目标宽高。

不得把编辑器当前屏幕 Canvas `drawImage()` 放大到输出 Canvas；这会重新引入已有模糊根因。

### 3.3 图片与 `files`

#### 已验证事实

Excalidraw 图片元素通过 `fileId` 关联 `BinaryFiles`。稳定版渲染器从 `files[fileId].dataURL` 创建 `HTMLImageElement` 并加入图片缓存，然后用于静态场景绘制：

- [图片缓存和 `BinaryFileData.dataURL`](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/element/image.ts#L14-L81)
- [导出时根据图片元素 `fileId` 更新缓存](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/scene/export.ts#L214-L220)

图片加载错误会在 `updateImageCache()` 内被捕获并记入 `erroredFiles`；Canvas 导出调用方只取回 `imageCache`，没有把 `erroredFiles` 继续返回或抛出。因此，单张图片加载失败并不保证让 `exportToCanvas()` 整体 reject。[稳定版图片缓存错误路径](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/element/image.ts#L27-L81)

Canvas 一旦绘制了不满足同源/CORS 条件的跨域资源，会变成非 `origin-clean`；对其调用 `captureStream()` 会抛出 `SecurityError`，创建流后再被污染时，捕获轨道也必须停止产生新内容。[W3C Canvas capture security](https://w3c.github.io/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)

#### 设计推断

- 项目工程必须保存并恢复完整 `files`，不能只保存 `elements` 与 `appState`。
- 图片录制必须以 Excalidraw 工程中的原始 `BinaryFiles` 为真值；不得从编辑器显示 Canvas 截图补图。
- 录制前必须逐个核对已初始化图片元素的 `fileId` 是否存在于 `files`，并实际解码或做测试导出；不能把“`exportToCanvas()` 已 resolve”当作“所有图片都已成功绘制”。
- 外部 URL 图片在导入时应先转换为受控的同源 `Blob` / `dataURL`，避免录制开始后才发现 Canvas 被污染。
- 对每个图片元素应检查原始像素尺寸与它在视频中的目标显示尺寸。低清原图被放大时只能提示“素材分辨率不足”，不能标成“高清输出成功”。

### 3.4 图片导入阶段的独立清晰度上限

#### 已验证事实

`@excalidraw/excalidraw` 当前还有一个名称相近、但含义完全不同的组件配置：

```ts
imageOptions.maxWidthOrHeight
```

它控制的是“图片进入工程时的最大边”，不是导出尺寸。当前官方源码默认值为：

```text
maxWidthOrHeight = 1440 px
maxFileSizeBytes = 4 MB
```

普通栅格图片超过该最大边时，会在转成 `BinaryFileData.dataURL` 之前先缩小；SVG 不走同一缩放路径。

来源：

- [Excalidraw 当前官方默认图片配置](https://github.com/excalidraw/excalidraw/blob/b2e81e38a6fde8b3cb5dfdf2f2fb651323ad309d/packages/common/src/constants.ts#L337-L344)
- [官方图片插入链路](https://github.com/excalidraw/excalidraw/blob/b2e81e38a6fde8b3cb5dfdf2f2fb651323ad309d/packages/excalidraw/components/App.tsx#L12449-L12505)
- [官方栅格图片缩放实现](https://github.com/excalidraw/excalidraw/blob/b2e81e38a6fde8b3cb5dfdf2f2fb651323ad309d/packages/excalidraw/data/blob.ts#L356-L413)

这意味着一张原始 `3840×2160 px` 截图使用默认配置导入后，写入 `files` 的版本最长边可能只剩 `1440 px`。之后即使正确使用 `exportToCanvas()` 输出 `1620×2160 px`，也无法恢复导入阶段已经丢失的截图小字。

#### 设计推断

- 第一阶段必须显式覆盖 `imageOptions.maxWidthOrHeight`，不得使用默认 `1440 px`。
- 最低值应不低于最高输出长边 `2160 px`；如果允许用户在 Slide 中明显放大或裁切图片，应按最大放大倍率设置更高的上限。
- 提高像素上限时必须同步评估并调整 `maxFileSizeBytes`，否则高清 PNG/JPEG 可能在文件大小检查阶段失败。
- 这些图片是工程本来就需要保存的创作素材，不是为路线三额外保存的摄像头、麦克风或时间线副本。
- 第一阶段画质对照必须包含一张最长边明显超过 `1440 px` 的网页截图，证明导入后 `files` 中的实际像素没有被静默压低到默认上限。

### 3.5 字体

#### 已验证事实

稳定版 `exportToCanvas()` 在绘制前默认 `await Fonts.loadElementsFonts(elements)`；字体加载逻辑会：

- 收集场景中实际使用的字体族与字符；
- 把已注册 `FontFace` 加入 `document.fonts`；
- 使用带具体字符文本的 `document.fonts.check()` / `document.fonts.load()` 等待需要的字形。

来源：

- [导出前等待字体](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/scene/export.ts#L153-L182)
- [按场景字符加载字体](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/excalidraw/fonts/Fonts.ts#L150-L260)

单个字体加载失败时，当前源码记录错误但不让整个字体加载过程失败。因此“`exportToCanvas()` Promise 已 resolve”并不等价于“每个字体与每个字形均按预期字体渲染”。

Canvas/PNG 输出是字体加载后的栅格结果，不会把字体文件嵌入成品视频；SVG 导出则默认生成/内联字体声明，可用 `skipInliningFonts` 关闭。

`@excalidraw/excalidraw@0.18.x` 的字体默认可从 CDN 加载。若自托管，需要复制 `dist/prod/fonts` 并在 Excalidraw 初始化前设置 `window.EXCALIDRAW_ASSET_PATH`。[Excalidraw npm 官方说明](https://www.npmjs.com/package/%40excalidraw/excalidraw)

#### 设计推断

录制前门禁需要额外检查场景实际字符的 `document.fonts.check()` 结果。字体失败应阻止开始并指出字体/字符范围，不能静默使用 fallback 后继续录制。

生产环境优先自托管字体，减少 CDN 中断、跨域和首次录制等待的不确定性。

### 3.6 `exportToCanvas()` 不是已经验证过的实时流式渲染器

#### 已验证事实

稳定版公开导出函数每次会恢复元素与 `appState`，内部静态导出会等待字体、计算边界、更新图片缓存并调用静态场景渲染器。[稳定版公开导出源码](https://github.com/excalidraw/excalidraw/blob/a2ec2889babf7d2295469c6d90ebe77fae57df84/packages/utils/export.ts#L50-L102)

#### 设计推断

它适合在“场景变化时生成高清白板缓存”，不应在每个视频帧上完整调用。

尚未验证的关键点是连续画线时的 `scene_update_latency_ms`。第一轮验证必须分别测量：

- 仅摄像头/光标运动，白板不变；
- 简单场景连续自由绘制；
- 包含多张高清图片和大量文字的复杂场景连续自由绘制；
- 切换 frame/幻灯片。

如果 `exportToCanvas()` 的更新延迟不可接受，再评估局部动态笔迹层或稳定的官方渲染入口；不能未经测量就依赖 Excalidraw 私有内部 renderer。

## 4. 目标 Canvas 捕获

### 4.1 输出尺寸

#### 已验证事实

W3C 规范明确规定：

- `HTMLCanvasElement.captureStream()` 产生一个含单一视频轨道的 `MediaStream`；
- 该轨道尺寸与 Canvas 元素尺寸匹配；
- 可传正的 `frameRequestRate`；
- 传 `0` 时必须支持手工 `CanvasCaptureMediaStreamTrack.requestFrame()`；
- `requestFrame()` 可避免渐进绘制中间态被捕获；
- Canvas 不再 `origin-clean` 时禁止继续捕获。

来源：[W3C Media Capture from DOM Elements](https://w3c.github.io/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)。

#### 设计推断

最终合成 Canvas 应直接设置：

```text
1080×1440 档：
canvas.width  = 1080
canvas.height = 1440

1620×2160 档：
canvas.width  = 1620
canvas.height = 2160
```

CSS 只控制页面预览大小，不得回写位图尺寸。通过 `captureStream(30)` 或 `captureStream(0) + requestFrame()` 提交完成后的合成帧。

这能证明“录制源不是屏幕低清 Canvas 的放大”，但不能单独证明编码后的细节一定更多。最终仍要在同一时刻抽帧比较文字边缘和截图小字。

### 4.2 `OffscreenCanvas` 边界

#### 已验证事实

当前 DOM Elements Capture 规范只给 `HTMLCanvasElement` 定义 `captureStream()`；`OffscreenCanvas` 没有该接口。[规范接口定义](https://w3c.github.io/mediacapture-fromelement/#html-canvas-element-media-capture-extensions)

#### 设计推断

- 可用 `OffscreenCanvas` / Worker 生成静态白板缓存或中间图层；
- 最终被 `MediaRecorder` 捕获的合成面必须落到 `HTMLCanvasElement`；
- 不应把“使用 OffscreenCanvas”写成第一版必要条件，因为跨线程传图也有复制、同步和调度成本。

## 5. `MediaRecorder` 编码与格式

### 5.1 能力检测

#### 已验证事实

`MediaRecorder.isTypeSupported(mimeType)` 返回浏览器是否“应当能够”录制指定 MIME；即使返回 `true`，资源不足时仍可能失败。[MDN `isTypeSupported()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static)

新版 W3C Recording 规范把同步 `isTypeSupported()` 视为 legacy，并指出精确 profile/level 与硬件能力更适合通过 `MediaCapabilities.encodingInfo()` 查询；后者接受 `contentType`、`width`、`height`、`bitrate` 与 `framerate`，返回 `supported`、`smooth`、`powerEfficient`。[W3C Recording capability section](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-istypesupported)、[MDN `encodingInfo()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaCapabilities/encodingInfo)

目标码率是给编码器的提示，规范允许实际码率未达到、超过或只在长时间后接近目标。[W3C `MediaRecorder.start()`](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-start)

#### 设计推断

开始录制前按三层检测：

1. `MediaRecorder.isTypeSupported(candidateMimeType)` 做容器/编码初筛；
2. `navigator.mediaCapabilities.encodingInfo()` 用真实目标宽高、`30 fps` 与目标码率做配置级检测；
3. 对当前设备实际跑 5～10 秒预录，确认能生成、能播放、尺寸正确、帧率和码率可接受。

任何能力查询都不能替代真实预录与 30 分钟压力测试。

### 5.2 MP4、WebM 与回退顺序

#### 已验证事实

Chrome 126 加入了 `MediaRecorder` 对 MP4 音视频封装的支持。[Chrome 126 release notes](https://developer.chrome.com/release-notes/126#mp4_container_support_for_mediarecorder)

Chrome 136 又扩展了 H.26x 在 MP4/Matroska 中的 codec string 与 HEVC 能力，但 HEVC 是否可用取决于设备和操作系统。[Chrome 136 beta](https://developer.chrome.com/blog/chrome-136-beta#h26x_codec_support_updates_for_mediarecorder)

`MediaRecorder.mimeType` 会反映构造时指定或浏览器实际选择的录制格式。[MDN `mimeType`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/mimeType)

#### 设计推断

不能写死“最新版 Chromium 一定输出 H.264/AAC MP4”。建议候选顺序由产品发布需求决定，例如：

1. 目标平台要求 MP4 时，先测试明确的 MP4/H.264/AAC MIME 候选；
2. MP4 不可用但产品允许 WebM 时，再测试 WebM/VP9/Opus、WebM/VP8/Opus；
3. 所有候选失败则阻止录制，并把“容器 / 视频编码 / 音频编码 / 宽高 / 帧率”作为一组展示。

文件扩展名必须来自录制器实际 `mimeType`，不能把 WebM 内容命名为 `.mp4`。

### 5.3 视频清晰度

#### 已验证事实

规范保证轨道尺寸匹配 Canvas，不保证有损编码后的像素细节、码率或持续帧率。

编码大分辨率/高帧率会显著消耗资源；W3C 特别把过大的分辨率、帧率和缓冲时间列为资源耗尽风险。[W3C Resource exhaustion](https://www.w3.org/TR/mediastream-recording/#resource-exhaustion)

#### 设计推断

`1620×2160 px` 相比 `1080×1440 px` 的像素数为：

```text
1080 × 1440 = 1,555,200 px/帧
1620 × 2160 = 3,499,200 px/帧
比例 = 2.25 倍
```

在同样 `30 fps` 下，高档输出的像素处理量也是 2.25 倍。码率不能沿用低档固定值后就宣称“高清”；应根据真实抽帧结果选择码率，并检查 `MediaRecorder.videoBitsPerSecond` 与最终文件平均码率。

## 6. 分片、长录与 OPFS

### 6.1 `timeslice` 的真实语义

#### 已验证事实

`MediaRecorder.start(timeslice)` 会周期性产生 `dataavailable` 事件及媒体 `Blob`，但：

- `timeslice` 不是精确计时器；
- 主线程任务、浏览器行为、锁屏和实现缺陷可能延迟事件并产生明显更大的分片；
- 不能用“分片数量 × timeslice”计算录制时长；
- 单个分片不保证可独立播放；
- 一次完整录制返回的所有分片组合后必须可播放。

来源：

- [MDN `dataavailable`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event)
- [W3C multiple Blob requirement](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-start)

W3C 还明确指出过大的 `timeslice` 会迫使浏览器缓冲大量数据，造成卡顿或内存耗尽。[W3C Resource exhaustion](https://www.w3.org/TR/mediastream-recording/#resource-exhaustion)

#### 设计推断

- 使用相对短的 `timeslice` 限制常态分片体量；
- 每个 `dataavailable` 的 `Blob` 到达后立即排队写入 OPFS；
- 写入链必须串行并处理背压，不能同时无序写同一个文件；
- 时长使用单独的高精度时钟并扣除已确认的暂停区间；最终真值以文件轨道时间戳和 `ffprobe` 为准；
- 仍要容忍异常大分片，不能按“每片必定固定 MB”分配内存。

### 6.2 OPFS 能力与风险

#### 已验证事实

OPFS：

- 通过 `navigator.storage.getDirectory()` 获取；
- 私有于站点 origin，不直接显示在用户文件系统；
- 支持 `FileSystemFileHandle.createWritable()`、`write()` 与 `close()`；
- Worker 中可使用 `FileSystemSyncAccessHandle` 做同步原位读写；
- 受 origin 配额约束；
- `navigator.storage.estimate()` 只能返回估算的 `usage` / `quota`；
- 清理站点数据会删除 OPFS；
- 默认是 best-effort 存储，存储压力下可能被驱逐；
- `navigator.storage.persist()` 可请求持久化，但浏览器可以拒绝；
- 超配额写入以 `QuotaExceededError` 失败。

来源：

- [MDN OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system)
- [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [MDN `StorageManager.persist()`](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist)

#### 设计推断

OPFS 是“降低长录内存风险的临时工作区”，不是永久成品库，也不是绝对可靠的崩溃恢复承诺。

推荐生命周期：

```text
开始录制
→ 建立独立临时目录与 manifest
→ 逐片写入并更新已确认字节数
→ 停止 MediaRecorder，等待最后 dataavailable
→ 关闭写流
→ 读取最终 File 并验证可播放/元数据
→ 用户保存或下载成功
→ 再删除临时文件
```

开始前和录制中都要调用 `estimate()`，但它只是预警，不是精确剩余磁盘空间。所有写操作必须捕获 `QuotaExceededError`。最终文件未验证前不得删除唯一片段。

### 6.3 Mediabunny 的官方能力边界

这一节用于对照现有 Excalicord 的 WebCodecs/MP4 路线，不表示 Excalicap 第一版必须引入该依赖。

#### 已验证事实

Mediabunny 官方提供：

- `CanvasSource` 把 Canvas 帧送给 WebCodecs 编码；
- `Mp4OutputFormat` / `WebMOutputFormat` 等封装器；
- `BufferTarget` 把整个结果放内存；
- `StreamTarget` 通过 `WritableStream` 边生成边写；
- `StreamTargetChunk` 与 File System API 的 `FileSystemWritableFileStream` 兼容；
- `WritableStream` 背压可向上游传递；
- MP4 可使用 fragmented / append-only 形式。

来源：

- [Mediabunny Quick start](https://mediabunny.dev/guide/quick-start)
- [Mediabunny Writing media files](https://mediabunny.dev/guide/writing-media-files)
- [Mediabunny Output formats](https://mediabunny.dev/guide/output-formats)

`StreamTarget` 的每个块带 `position`。一些输出区域可能被多次覆写，因此一般模式下不能只拼接 `Uint8Array`；必须按指定偏移写入。只有输出格式明确配置为 append-only 时，简单追加才正确。

#### 设计推断

如果 `MediaRecorder` 实测失败，WebCodecs + Mediabunny 是合理的第二层方案，因为它提供：

- 更明确的逐帧时间戳；
- MP4 mux；
- Canvas 输入；
- 可落盘输出与背压。

代价是新增依赖、音视频时钟管理、编码队列、关键帧、mux 与失败恢复复杂度。它不能解决低清源 Canvas；无论用什么编码器，都必须先改为独立目标分辨率渲染。

如果采用 Mediabunny 写 OPFS：

- 普通 `StreamTarget` 必须把 `position` 交给可随机写的 `FileSystemWritableFileStream`；
- 只有 fragmented MP4 等 append-only 配置才能使用纯追加目标；
- 多轨写入必须交错推进，避免 muxer 因等待另一轨时间戳而把大量包缓存在内存。

## 7. 暂停、继续与设备中断

### 7.1 暂停语义

#### 已验证事实

`MediaRecorder.pause()` 会把状态设为 `paused`，停止向当前 Blob 收集数据，但保留当前 Blob 供以后继续；`resume()` 会恢复向同一个 Blob 收集数据。[MDN `pause()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/pause)、[MDN `resume()`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/resume)

规范没有在这两条方法定义中直接给出“最终文件时长必须精确等于录制区间之和”的产品级验收承诺。

#### 设计推断

可以用原生 `pause()` / `resume()` 作为第一版候选，但“暂停两分钟不进入成品时间轴”必须在目标 Chrome 上实测：

```text
录制 20 秒
暂停 120 秒
继续录制 20 秒
最终视频目标时长约 40 秒，而不是 160 秒
```

同时核对音频轨、视频轨、seek、首个继续帧和 `av_duration_delta_ms`。未通过前不要把暂停语义写成已完成事实。

### 7.2 摄像头中断

#### 已验证事实

摄像头画面在本方案中先绘制进最终 Canvas，因此 `MediaRecorder` 只看到一个稳定的 Canvas 视频轨道，不直接持有摄像头视频轨道。

`MediaStreamTrack` 在权限被撤销、硬件移除或源永久停止时会触发 `ended`。[MDN `MediaStreamTrack.ended`](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/ended_event)

#### 设计推断

摄像头断开时，可以停止向合成 Canvas 绘制摄像头帧并改画占位符；因为录制 `MediaStream` 的 Canvas 视频轨道集合没变，所以继续录白板是可行设计。

### 7.3 麦克风中断与热切换

#### 已验证事实

W3C Recording 规范要求：录制过程中向被录 `MediaStream` 增加或移除轨道时，录制器必须停止，并触发 `InvalidModificationError`、`dataavailable` 与 `stop`。[W3C track-set modification handling](https://www.w3.org/TR/mediastream-recording/#dom-mediarecorder-start)

#### 设计推断

第一版不得承诺麦克风断开后在同一 `MediaRecorder` 会话中无缝切换：

- 麦克风断开要立即显示“无音频”；
- 优先停止并保存已有成品；
- 只有浏览器实验证明某种不改变 recorder track set 的替换方式长期可靠，才开放热切换。

## 8. 页面隐藏、系统休眠与实时帧循环

### 已验证事实

大多数浏览器会暂停后台标签页或隐藏 iframe 的 `requestAnimationFrame()`；后台计时器也会被限流。[MDN `requestAnimationFrame()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame)、[MDN Page Visibility API](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API)

`timeslice` 也可能因浏览器行为和系统状态延迟，产生明显更大的 Blob。[MDN `dataavailable`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/dataavailable_event)

### 设计推断

如果最终合成循环依赖主线程 `requestAnimationFrame()`，切换标签页、最小化窗口或系统锁屏时不能保证继续产生 `30 fps` 动态画面。

第一版应选择明确的 fail-closed 行为：

- 监听 `visibilitychange`；
- 页面变为 hidden 时立即报警并自动暂停，或停止并保存；
- 恢复可见后不要补写伪造的重复帧；
- 检测时钟大跳跃，系统休眠后停止并保存已有数据；
- 不把“后台仍能稳定录制”列为首版能力。

## 9. WebCodecs 何时才值得升级

### 已验证事实

WebCodecs 提供逐帧 `VideoFrame` / `AudioData`、硬件编码与较低层控制，也可在 Dedicated Worker 使用；编码器内部是异步队列，调用方必须管理积压。[MDN WebCodecs API](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API)

WebCodecs 只负责编码/解码，不提供把编码块直接写成可播放媒体文件的内置 muxer。[MDN WebCodecs muxing boundary](https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API#demuxing_and_muxing)

`VideoEncoder.isConfigSupported()` 也只能基于当前资源给 best-effort 支持判断，实际能力可能随硬件或资源变化。[W3C WebCodecs configuration support](https://www.w3.org/TR/webcodecs/#config-support)

### 设计推断

只有出现以下任一已复现证据时才升级：

- `MediaRecorder` 无法提供目标 MP4/H.264/AAC；
- `1620×2160 px / 30 fps` 持续掉帧，而 WebCodecs 预研明显改善；
- 暂停/继续时间轴在目标浏览器上不符合产品语义；
- MediaRecorder 分片/最终文件无法可靠落盘或恢复；
- 需要明确控制关键帧、逐帧时间戳或编码队列；
- 需要可观测的编码积压和更严格的输出一致性。

若 `MediaRecorder` 已达标，WebCodecs 不应仅因“以后可能需要”进入第一版。

## 10. 主要风险矩阵

| 优先级 | 风险 | 已验证事实 | 设计应对 | 当前状态 |
| --- | --- | --- | --- | --- |
| P0 | 仍从编辑器屏幕 Canvas 放大 | Excalidraw 可直接从场景导出新 Canvas | 禁止 `drawImage(editorCanvas, ...)`；做代码级断言/审查 | 待实现 |
| P0 | `1620×2160 / 30 fps` 编码跟不上 | 规范不保证持续性能 | 目标设备预录 + 30 分钟压力测试 | 待实测 |
| P0 | 高清场景更新太慢 | `exportToCanvas()` 是静态导出流程 | 测 `scene_update_latency_ms`，只在场景变化时更新缓存 | 待实测 |
| P0 | 字体 CDN/字形失败后静默 fallback | 单字体失败不会让整个导出 Promise 失败 | 自托管 + 录制前逐字符字体门禁 | 待实现 |
| P0 | 图片缺失或 Canvas 被跨域污染 | 非 origin-clean Canvas 不能捕获 | 保存完整 `files`；导入时转换受控 Blob/dataURL | 待实现 |
| P0 | 高清图片在导入时已被缩到 `1440 px` | Excalidraw 当前默认 `imageOptions.maxWidthOrHeight = 1440` | 显式提高图片最大边和文件大小上限；核对 `files` 中真实像素 | 待实现 |
| P0 | MP4 MIME 组合在目标设备不可用 | Chrome 有 MP4，但精确组合依赖运行时 | MIME + MediaCapabilities + 预录三层检测 | 待实测 |
| P0 | 长录内存增长 | timeslice 可延迟，编码缓冲会耗内存 | 分片串行落 OPFS；监控异常大分片 | 待实测 |
| P1 | OPFS 超配额或被清理 | OPFS 受配额/驱逐/站点清理影响 | `estimate()` 预警、捕获异常、最终保存后清理 | 待实现 |
| P1 | 暂停时长进入成品或音画漂移 | 规范只保证暂停收集数据 | 目标浏览器实测 20s+120s+20s | 待实测 |
| P1 | 麦克风断开后热切换终止录制 | 改 recorder 的 track set 会报错并停止 | 首版停止并保存，不承诺热切换 | 已明确边界 |
| P1 | 切后台/系统休眠导致画面冻结 | 后台 rAF 通常暂停、timer 限流 | hidden 自动暂停/停止；时钟跳跃 fail-closed | 待实现 |
| P2 | 过早引入 WebCodecs/Mediabunny | WebCodecs 还需 mux 与时间轴管理 | 仅由 MediaRecorder 验收失败触发 | 架构决策 |

## 11. 最小验证器与成功标准

### 11.1 实现范围

只实现一条纵向链路：

1. 一个 3:4 Excalidraw frame；
2. 场景包含中文/英文小字、箭头、自由绘制、1 px/2 px 线条、高清图与低清图；
3. 显式覆盖图片导入的默认 `1440 px` 最大边，并核对高清截图进入 `files` 后的真实像素；
4. 从 `elements + appState + files` 生成高清场景缓存；
5. 把场景缓存、摄像头、光标/激光笔绘制到目标 `HTMLCanvasElement`；
6. 分别创建 `1080×1440 px / 30 fps` 与 `1620×2160 px / 30 fps` 录制；
7. Canvas 视频轨 + 麦克风音频轨进入 `MediaRecorder`；
8. `dataavailable` 分片串行写 OPFS；
9. 停止后生成最终文件、验证、保存并清理。

### 11.2 必测证据

至少交叉验证两种口径：

1. **应用运行时诊断**
   - `target_width_px`
   - `target_height_px`
   - `target_fps`
   - `rendered_frames`
   - `scene_update_latency_ms` 的 p50/p95
   - `temporary_storage_mb`
   - 实际 `MediaRecorder.mimeType`
   - 实际 `videoBitsPerSecond` / `audioBitsPerSecond`

2. **最终文件外部检查**
   - `ffprobe` 核对轨道、codec、分辨率、帧率、码率、时长；
   - 从两档视频抽取相同时间戳原始帧；
   - 100% 或更高倍率检查文字边缘、线条、原图小字与摄像头；
   - 计算 `actual_fps`、`dropped_frames` 与 `av_duration_delta_ms`。

### 11.3 通过条件

沿用已确认的首阶段目标，并补充“证据必须来自最终文件”：

| 项目 | 通过条件 |
| --- | --- |
| 输出尺寸 | 文件严格为 `1080×1440 px` 或 `1620×2160 px` |
| 渲染来源 | 白板层直接来自 Excalidraw 场景导出，不读取编辑器显示 Canvas |
| 新增细节 | `1620×2160` 抽帧显示真实新增细节，不是低档画面放大 |
| 原图 | 高清原图保留可用细节；低清原图明确标记上限 |
| 字体 | 录制前所用字体/字符均已加载；无静默 fallback |
| 帧率 | 目标 `30 fps`；正常测试场景丢帧率低于 `1%` |
| 音画同步 | 30 分钟样本 `av_duration_delta_ms < 100 ms` |
| 暂停 | 暂停区间不进入成品时间轴，继续点无明显损坏 |
| 长录 | 连续 30 分钟无持续无上限内存增长 |
| 临时存储 | 成品验证并保存成功后自动清理 |
| 异常 | 相机断开、麦克风断开、空间不足、页面隐藏均有明确状态且不静默丢整段 |
| 文件可用性 | 本机播放器与目标发布流程能读取 |

## 12. 最终建议

### 已验证事实

官方 API 已提供完成第一轮验证所需的全部基础能力：

```text
Excalidraw elements/appState/files
→ exportToCanvas() 高清场景层
→ 固定像素 HTMLCanvasElement 合成层
→ captureStream()
→ Canvas 视频轨 + 麦克风音频轨
→ MediaRecorder
→ dataavailable Blob
→ OPFS 临时文件
→ 最终视频
```

### 设计推断

第一版具体决策应是：

- 固定 `@excalidraw/excalidraw@0.18.1`，不要跟随 `master` 私有接口；
- 用 3:4 frame 建模幻灯片输出边界；
- 用 `exportingFrame + getDimensions` 生成目标尺度白板缓存；
- 显式覆盖默认图片导入最大边与文件大小上限，避免原图在进入工程时已被降到 `1440 px`；
- 最终捕获面使用 `HTMLCanvasElement`；
- 白板缓存只在场景变化时重绘，摄像头/光标按视频帧合成；
- 先试 `MediaRecorder`，MIME/MediaCapabilities/预录三层检测；
- 分片立即串行落 OPFS；
- 页面隐藏、时钟跳跃、音轨变更采用 fail-closed；
- 暂不保存原始摄像头、原始麦克风或完整操作时间线；
- 只有 MediaRecorder 的真实验收失败，才升级到 WebCodecs + Mediabunny。

这条路线在标准与官方实现层面成立；下一步不是继续做更多纸面设计，而是构建最小验证器取得画质、帧率、音画同步、场景更新延迟和 30 分钟存储曲线的实测证据。
