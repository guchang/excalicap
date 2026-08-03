import { flushBeforeViewSave } from "./view-lifecycle";

describe("flushBeforeViewSave", () => {
  it("flushes pending App changes before Obsidian saves the file", async () => {
    const order: string[] = [];

    await flushBeforeViewSave(
      async () => {
        order.push("flush");
      },
      async () => {
        order.push("save");
      },
    );

    expect(order).toEqual(["flush", "save"]);
  });
});
