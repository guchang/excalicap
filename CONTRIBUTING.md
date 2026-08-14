# 参与贡献

感谢你帮助改进 Excalicap。项目仍处于 Alpha 阶段，提交改动前请先搜索已有 Issue；较大的功能或项目格式调整建议先创建 Issue，说明用户场景、边界和可观察的成功标准。

## 本地开发

需要 Node.js `>= 20.19.0`。克隆仓库后执行：

```bash
npm ci
npm test
npm run typecheck
```

Web 版使用 `npm run dev`，生产构建使用 `npm run build`。Obsidian 插件使用 `npm run build:obsidian`，并将 `obsidian-dist/` 同步到测试 Vault 的 `.obsidian/plugins/excalicap/` 后，在 Obsidian 内重载验收。Web 构建和 Obsidian 构建会写入相同的字体目录，请顺序执行。

## 提交改动

- 保持改动聚焦，不顺手重构无关代码。
- 修复 bug 时，先添加能够复现问题的测试，再修复根因。
- 沿用现有 TypeScript、React 和测试模式，不为小改动引入新依赖。
- UI 改动需要同时检查 Web 版和 Obsidian 宿主中的真实交互边界。
- 不要提交 `node_modules/`、`dist/`、`obsidian-dist/`、coverage 或本地 Vault 数据。

提交 Pull Request 前至少运行：

```bash
npm test
npm run typecheck
npm run build
npm run build:obsidian
```

PR 说明应包含改动内容、原因、用户影响、验证方式和仍未验证的限制。涉及 UI 时请附截图或短视频；涉及录制时请注明浏览器、操作系统、容器与编码结果。
