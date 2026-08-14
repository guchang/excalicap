import { describe, expect, it } from "vitest";
import { EXCALICAP_AI_DRAWING_PROMPT } from "./excalicap-ai-prompt";

describe("EXCALICAP_AI_DRAWING_PROMPT", () => {
  it("routes each request to the matching visual type instead of forcing a flowchart", () => {
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("【绘图类型识别】");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("PPT／演示页");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("对比图");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("表格");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("架构图／关系图");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("思维导图");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("信息图");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("插图／示意图");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain(
      "只有存在流程、依赖、因果或方向关系时才创建箭头",
    );
  });

  it("requires composition to respond to the target Slide aspect ratio", () => {
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("【画布与整体构图】");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("宽高比");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("内容包围盒");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("65%–90%");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("60%–88%");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("5%");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain(
      "必须改变布局结构，不能只把原布局整体缩放或拉伸",
    );
  });

  it("keeps save safety and native text-layout requirements universal", () => {
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("不得手工设置或复制");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("内部排序字段 index");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("【元素与文字通用规则】");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("verticalAlign: \"middle\"");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain(
      "text.y = container.y + (container.height - text.height) / 2",
    );
  });

  it("gates completion on visual QA and reports metrics for the selected type", () => {
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("【按类型启用的设计规则】");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("【写入后验收】");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain(
      "不得声称视觉验收通过或任务已经完成",
    );
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("宽度利用率");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("高度利用率");
    expect(EXCALICAP_AI_DRAWING_PROMPT).toContain("按当前绘图类型报告专项指标");
  });
});
