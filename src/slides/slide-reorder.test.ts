import { moveSlideToSlot } from "./slide-reorder";

describe("slide reorder slots", () => {
  const ids = ["slide-1", "slide-2", "slide-3", "slide-4"];

  it("moves a Slide into a later gap after removing it from the source order", () => {
    expect(moveSlideToSlot(ids, "slide-2", 2)).toEqual([
      "slide-1",
      "slide-3",
      "slide-2",
      "slide-4",
    ]);
  });

  it("moves a Slide into an earlier gap", () => {
    expect(moveSlideToSlot(ids, "slide-4", 1)).toEqual([
      "slide-1",
      "slide-4",
      "slide-2",
      "slide-3",
    ]);
  });

  it("supports the first and last insertion slots", () => {
    expect(moveSlideToSlot(ids, "slide-3", 0)).toEqual([
      "slide-3",
      "slide-1",
      "slide-2",
      "slide-4",
    ]);
    expect(moveSlideToSlot(ids, "slide-2", 3)).toEqual([
      "slide-1",
      "slide-3",
      "slide-4",
      "slide-2",
    ]);
  });

  it("keeps the order stable when the Slide is returned to its original gap", () => {
    expect(moveSlideToSlot(ids, "slide-2", 1)).toBe(ids);
  });

  it("rejects an unknown Slide and an invalid insertion slot", () => {
    expect(() => moveSlideToSlot(ids, "missing", 0)).toThrow(
      "找不到幻灯片 missing",
    );
    expect(() => moveSlideToSlot(ids, "slide-1", 4)).toThrow(
      "幻灯片插入位置无效",
    );
  });
});
