# Excalicap

本地优先的白板视频创作与录制工具。Excalicap 把 Excalidraw 的自由绘图、以 Frame 组织的多页 Slide、摄像头、麦克风、光标和提词器放进同一套工作流，帮助创作者从内容设计直接走到高清视频成片。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Status: Alpha](https://img.shields.io/badge/status-alpha-orange.svg)](#项目状态)

适用于知识讲解、课程录制、产品演示，以及小红书、B 站、YouTube 等平台的视频内容制作。项目同时提供独立 Web 应用和桌面端 Obsidian 插件。

> Excalicap 目前处于 Alpha 开发阶段，接口、项目格式和安装方式仍可能调整。建议先在非关键资料上试用，并自行保留项目文件与录制成品备份。

## 核心能力

- **白板式创作**：基于 `@excalidraw/excalidraw`，支持文字、图片、图形、箭头、自由绘制与素材库。
- **Slide 工作流**：使用 Excalidraw Frame 作为 Slide，支持新增、切换、排序和方向键翻页，并保护录制边界。
- **多种输出画幅**：内置 `16:9`、`4:3`、`3:4`、`9:16`、`1:1` 和高清竖版，也支持自定义尺寸。
- **一体化录制**：把背景、白板、摄像头、光标、激光笔和麦克风实时合成为 MP4 或 WebM。
- **双份录制素材**：启用摄像头时，可同时保留合成成片和未经裁切、镜像的摄像头原片。
- **不入镜提词器**：支持编辑讲稿、自动滚动、速度和透明度调节，不会被绘制进最终画面。
- **AI 绘图协作提示词**：可复制内置的安全与排版约束，交给支持操作 Excalicap 的 AI 继续绘制。
- **本地项目**：Web 版读写标准 `.excalidraw`；Obsidian 插件使用 `.excalicap`，支持自动保存和外部文件变更保护。
- **高分辨率重渲染**：从场景数据和原始图片按目标像素重新渲染，而不是放大编辑器截图。

## 输出预设

所有内置预设均以 `30 fps` 输出：

| 比例 | 典型场景 | 输出尺寸 |
| --- | --- | --- |
| `16:9` | 横屏视频 | `1920 × 1080 px` |
| `4:3` | 经典画幅 | `1440 × 1080 px` |
| `3:4` | 小红书 | `1080 × 1440 px` |
| `9:16` | 竖屏短视频 | `1080 × 1920 px` |
| `1:1` | 方形内容 | `1080 × 1080 px` |
| 高清竖版 | 高精度竖屏内容 | `1620 × 2160 px` |

自定义画幅支持 `640–3840 px` 宽、`480–2160 px` 高。实际容器、编码、分辨率和设备能力取决于浏览器、操作系统及硬件。

## 快速开始

### 环境要求

- Node.js `>= 20.19.0`
- npm（随 Node.js 安装）
- Web 版建议使用最新版 Chrome 或 Edge
- Obsidian 插件需要 Obsidian `>= 1.7.2` 桌面版

### 运行 Web 版

```bash
git clone https://github.com/guchang/excalicap.git
cd excalicap
npm ci
npm run dev
```

按终端显示的本地地址打开页面。首次启用摄像头或麦克风时，需要允许浏览器访问相应设备。

### 构建 Web 版

```bash
npm run build
```

生产构建输出到 `dist/`。

### 构建并安装 Obsidian 插件

```bash
npm run build:obsidian
```

构建产物位于 `obsidian-dist/`。将该目录中的 `main.js`、`manifest.json`、`styles.css` 和 `excalidraw-assets/` 复制到目标仓库的：

```text
<你的 Obsidian Vault>/.obsidian/plugins/excalicap/
```

然后在 Obsidian 的“设置 → 第三方插件”中重新加载并启用 Excalicap。插件直接加载构建产物，**不依赖** Vite 的 `5173` 开发端口。

> `npm run build` 与 `npm run build:obsidian` 都会同步字体资源，请顺序执行，不要并行运行。

## 基本使用流程

1. 在白板中创建或整理多个 Slide。
2. 选择输出比例、背景、留白、摄像头、麦克风和光标样式。
3. 打开提词器，粘贴讲稿并调整滚动速度。
4. 开始录制前检查设备状态、画面位置、字体和编码能力。
5. 录制中通过右侧导航或方向键切换 Slide。
6. 停止后下载合成成片；启用摄像头时还可以下载摄像头原片。
7. 保存项目文件，方便后续继续编辑。

录制分片优先写入 OPFS（Origin Private File System），不可用时降级到内存。最近一次成功结果只在当前页面会话中保留，请在刷新或关闭页面前下载成品。

## 开发

```bash
npm test           # 运行 Vitest 测试
npm run typecheck  # TypeScript 类型检查
npm run build      # Web 生产构建
npm run build:obsidian
```

主要目录：

```text
src/components/     产品 UI 与交互组件
src/compositor/     视频画面合成
src/media/          摄像头与麦克风设备控制
src/obsidian/       Obsidian 插件入口与文件生命周期
src/project/        Web 项目文件与本地存储
src/recording/      录制引擎、分片与产物
src/rendering/      高分辨率场景渲染与预检
src/slides/         Slide 领域逻辑
.agents/skills/     Codex 配套内容生成 Skill
docs/               产品规格、研究与实现计划
```

技术栈包括 React 19、TypeScript 5、Vite 8、Excalidraw 0.18、Vitest 和 Testing Library。

## 项目状态

当前版本专注于“白板创作 + 高清录制”，暂不提供账号、订阅、云同步、多人实时协作、视频时间线、字幕轨或逐轨剪辑，也不保证所有设备都输出相同的视频容器或编码格式。

这是开发中的早期版本。提交问题前请先搜索已有 Issue，并附上复现步骤、浏览器或 Obsidian 版本、操作系统和相关错误日志。

## 参与贡献与安全

- 开发和提交约定见 [CONTRIBUTING.md](CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](SECURITY.md) 私下报告，不要先创建公开 Issue。
- 本项目采用 [MIT License](LICENSE)。第三方依赖及其资源仍遵循各自的许可证。
