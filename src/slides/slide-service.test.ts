import {
  createSlide,
  deleteSlide,
  duplicateSlide,
  getSlides,
  lockSlideFrames,
  normalizeSlideFrames,
  reorderSlides,
  type SlideSceneElement,
} from "./slide-service";

const elements: SlideSceneElement[] = [
  {
    id: "slide-2",
    type: "frame",
    x: 1200,
    y: 0,
    width: 1080,
    height: 1440,
    name: "Old name",
  },
  {
    id: "slide-1",
    type: "frame",
    x: 0,
    y: 0,
    width: 1080,
    height: 1440,
    name: "First",
  },
  {
    id: "text-1",
    type: "text",
    x: 100,
    y: 100,
    width: 300,
    height: 60,
    frameId: "slide-1",
    text: "Hello",
  },
  {
    id: "text-2",
    type: "text",
    x: 1300,
    y: 100,
    width: 300,
    height: 60,
    frameId: "slide-2",
    text: "World",
  },
];

describe("slide service", () => {
  it("locks Slide frames without changing ordinary content", () => {
    const result = lockSlideFrames([
      ...elements,
      {
        id: "locked-content",
        type: "rectangle",
        x: 20,
        y: 30,
        width: 80,
        height: 60,
        locked: false,
      },
    ]);

    expect(
      result
        .filter((element) => element.type === "frame")
        .every((frame) => frame.locked === true),
    ).toBe(true);
    expect(result.find((element) => element.id === "slide-2")).toMatchObject({
      x: 1200,
      y: 0,
      width: 1080,
      height: 1440,
    });
    expect(
      result.find((element) => element.id === "locked-content")?.locked,
    ).toBe(false);
  });

  it("keeps the scene array stable when every Slide is already locked", () => {
    const locked = elements.map((element) =>
      element.type === "frame" ? { ...element, locked: true } : element,
    );

    expect(lockSlideFrames(locked)).toBe(locked);
  });

  it("sorts Frames from left to right and exposes normalized names", () => {
    expect(getSlides(elements)).toEqual([
      expect.objectContaining({ id: "slide-1", name: "Slide 1" }),
      expect.objectContaining({ id: "slide-2", name: "Slide 2" }),
    ]);
  });

  it("normalizes every Slide and its full-frame background to one size", () => {
    const result = normalizeSlideFrames(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 100,
          y: 80,
          width: 1200,
          height: 1600,
        },
        {
          id: "slide-2",
          type: "frame",
          x: 1420,
          y: -40,
          width: 960,
          height: 1280,
        },
        {
          id: "slide-2-background",
          type: "rectangle",
          x: 1420,
          y: -40,
          width: 960,
          height: 1280,
          frameId: "slide-2",
          locked: true,
        },
        {
          id: "slide-2-content",
          type: "text",
          x: 1520,
          y: 60,
          width: 200,
          height: 60,
          frameId: "slide-2",
        },
      ],
      { width: 1080, height: 1440 },
    );

    expect(result.find((element) => element.id === "slide-1")).toMatchObject({
      x: 100,
      y: 80,
      width: 1080,
      height: 1440,
      locked: true,
    });
    expect(result.find((element) => element.id === "slide-2")).toMatchObject({
      x: 1300,
      y: 80,
      width: 1080,
      height: 1440,
      locked: true,
    });
    expect(
      result.find((element) => element.id === "slide-2-background"),
    ).toMatchObject({
      x: 1300,
      y: 80,
      width: 1080,
      height: 1440,
    });
    expect(
      result.find((element) => element.id === "slide-2-content"),
    ).toMatchObject({
      x: 1400,
      y: 180,
      width: 200,
      height: 60,
    });
    expect(
      normalizeSlideFrames(result, { width: 1080, height: 1440 }),
    ).toBe(result);
  });

  it("creates a Slide after the active Slide and keeps a fixed gap", () => {
    const ids = ["slide-3"];
    const result = createSlide(
      elements,
      "slide-1",
      { width: 1080, height: 1440 },
      () => ids.shift() ?? "unexpected",
    );

    expect(result.currentSlideId).toBe("slide-3");
    expect(result.slides.map((slide) => slide.name)).toEqual([
      "Slide 1",
      "Slide 2",
      "Slide 3",
    ]);
    expect(
      result.slides.find((slide) => slide.id === "slide-3")?.x,
    ).toBe(1200);
    expect(
      result.elements.find((element) => element.id === "slide-3")?.locked,
    ).toBe(true);
  });

  it("deletes a Slide and its children but never deletes the last Slide", () => {
    const result = deleteSlide(elements, "slide-1");

    expect(result.elements.map((element) => element.id)).toEqual([
      "slide-2",
      "text-2",
    ]);
    expect(result.currentSlideId).toBe("slide-2");
    expect(() => deleteSlide(result.elements, "slide-2")).toThrow(
      "至少需要保留一张幻灯片",
    );
  });

  it("duplicates a Slide and rewrites the copied child frame reference", () => {
    const ids = ["slide-copy", "text-copy"];
    const result = duplicateSlide(
      elements,
      "slide-1",
      () => ids.shift() ?? "unexpected",
    );

    const copiedFrame = result.elements.find(
      (element) => element.id === "slide-copy",
    );
    const copiedText = result.elements.find(
      (element) => element.id === "text-copy",
    );
    expect(copiedFrame).toMatchObject({
      type: "frame",
      x: 1200,
      name: "Slide 2",
      locked: true,
    });
    expect(copiedText).toMatchObject({
      frameId: "slide-copy",
      x: 1300,
      text: "Hello",
    });
  });

  it("reorders Slides and moves every child with its Frame", () => {
    const result = reorderSlides(elements, ["slide-2", "slide-1"]);

    expect(getSlides(result).map((slide) => slide.id)).toEqual([
      "slide-2",
      "slide-1",
    ]);
    expect(result.find((element) => element.id === "text-2")?.x).toBe(100);
    expect(result.find((element) => element.id === "text-1")?.x).toBe(1300);
    expect(
      result
        .filter((element) => element.type === "frame")
        .every((frame) => frame.locked === true),
    ).toBe(true);
  });
});
