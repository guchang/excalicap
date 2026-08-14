# Excalicap Scene Contract（场景契约）

## 文件与页面模型

- 项目文件使用标准 `.excalidraw` JSON；
- 整个文件是一份 scene；
- 每个 Slide 是 `type: "frame"` 的元素；
- Slide 从左到右排序；
- 默认 frame 尺寸为 `1080 × 1440`，间距 `120px`；
- 同一项目的所有 frame 使用相同 `y`；
- frame 在 Excalicap 中保持锁定，内容元素可编辑。

## 元素归属

属于 Slide 的每个元素必须满足：

```text
element.frameId === slide.id
```

坐标使用 Excalidraw 绝对坐标：

```text
element.x = slide.x + localX
element.y = slide.y + localY
```

不要把页内坐标直接写成绝对坐标。不要让元素依靠视觉位置“看起来属于”某页却缺少 `frameId`。

## 可使用的原生元素

- `text`
- `rectangle`
- `ellipse`
- `diamond`
- `arrow`
- `line`
- `freedraw`
- `image`
- `frame`

文字元素至少保持：

```json
{
  "type": "text",
  "text": "标题",
  "originalText": "标题",
  "fontSize": 80,
  "fontFamily": 5,
  "textAlign": "left",
  "verticalAlign": "top",
  "containerId": null,
  "autoResize": true,
  "lineHeight": 1.25,
  "frameId": "slide-id"
}
```

不要把可编辑文字替换成 base64 图片。新增图片时同时维护 `files` 字典和 image 元素的 `fileId`。

默认 `1080 × 1440` Slide 中，逐个检查 text 元素的 `fontSize`：主标题使用 `72–96px`，正文、步骤和主要说明使用 `44–56px`，标签、图例和箭头文字使用 `36–44px`，辅助文字不小于 `32px`。任何可见文字低于 `32px` 都视为场景不合格；内容放不下时删减或拆页，不得缩小字号规避。

## 修改规则

- 保留与本次主题相关且仍有价值的元素；
- 不移动、缩放或解锁现有 frame；
- 新增、删除或重排 Slide 时，连同其所有 `frameId` 子元素一起处理；
- 复制 Slide 时重写所有元素 ID、`frameId` 和相互引用；
- 不重复使用 ID；
- 不留下引用已删除 frame 的孤儿元素；
- 不改动无关的画布元素。

## 边界验证

对每个非 frame 元素检查：

```text
element.x >= frame.x + safeMargin
element.y >= frame.y + safeMargin
element.x + element.width <= frame.x + frame.width - safeMargin
element.y + element.height <= frame.y + frame.height - safeMargin
```

装饰线或有明确视觉理由的出血元素可以例外，但必须在报告中说明。

还要检查：

- JSON 可解析；
- 所有 element ID 唯一；
- 所有非空 `frameId` 都指向现存 frame；
- frame 尺寸统一；
- frame 的 `y` 统一；
- frame 按 `x` 从左到右排列；
- 所有 text 元素达到录屏字号下限，并在完整录制画幅下无需放大即可阅读；
- 标题和正文没有意外重叠；
- 箭头端点和文字容器引用有效；
- `files` 中不存在无效图片引用。

## 新项目命名

默认在 Codex 当前工作目录创建：

```text
<source-stem>.excalidraw
```

没有源文件时使用主题 slug：

```text
<topic-slug>.excalidraw
```

目标存在时依次尝试：

```text
<stem>-2.excalidraw
<stem>-3.excalidraw
```

不要静默覆盖旧文件。
