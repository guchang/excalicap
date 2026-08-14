import {
  createSlide,
  deleteSlide,
  duplicateSlide,
  getSlides,
  lockSlideFrames,
  normalizeSlideFrames,
  repairInvalidSlideChildren,
  reorderSlides,
  resizeSlideFrames,
  wouldNudgeElementsOutsideOwningSlides,
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
  it("keeps Slide frames locked without changing ordinary content", () => {
    const result = normalizeSlideFrames(
      [
        {
          id: "slide-selectable",
          type: "frame",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
          locked: true,
        },
        {
          id: "locked-content",
          type: "rectangle",
          x: 20,
          y: 30,
          width: 80,
          height: 60,
          frameId: "slide-selectable",
          locked: true,
        },
      ],
      { width: 1080, height: 1440 },
    );

    expect(result.find((element) => element.type === "frame")?.locked).toBe(
      true,
    );
    expect(
      result.find((element) => element.id === "locked-content")?.locked,
    ).toBe(true);
  });

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

  it("preserves persisted Slide dimensions during routine normalization", () => {
    const result = normalizeSlideFrames([
      {
        id: "slide-1",
        type: "frame",
        x: 0,
        y: 0,
        width: 1620,
        height: 2160,
      },
      {
        id: "slide-2",
        type: "frame",
        x: 1740,
        y: 0,
        width: 1620,
        height: 2160,
      },
      {
        id: "slide-2-card",
        type: "rectangle",
        x: 2010,
        y: 360,
        width: 810,
        height: 720,
        frameId: "slide-2",
      },
    ]);

    expect(result.find((element) => element.id === "slide-1")).toMatchObject({
      width: 1620,
      height: 2160,
    });
    expect(result.find((element) => element.id === "slide-2")).toMatchObject({
      x: 1740,
      width: 1620,
      height: 2160,
    });
    expect(
      result.find((element) => element.id === "slide-2-card"),
    ).toMatchObject({
      x: 2010,
      y: 360,
      width: 810,
      height: 720,
      frameId: "slide-2",
    });
  });

  it("scales Slide children with their frame during an explicit size change", () => {
    const result = resizeSlideFrames(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 100,
          y: 80,
          width: 1620,
          height: 2160,
        },
        {
          id: "card",
          type: "rectangle",
          x: 262,
          y: 296,
          width: 810,
          height: 540,
          frameId: "slide-1",
        },
        {
          id: "title",
          type: "text",
          x: 424,
          y: 512,
          width: 600,
          height: 120,
          fontSize: 60,
          baseline: 54,
          frameId: "slide-1",
        },
        {
          id: "arrow",
          type: "arrow",
          x: 586,
          y: 944,
          width: 300,
          height: 600,
          points: [
            [0, 0],
            [300, 600],
          ],
          startBinding: { elementId: "card", focus: 0, gap: 15 },
          frameId: "slide-1",
        },
      ],
      { width: 1080, height: 1440 },
    );

    expect(result.find((element) => element.id === "slide-1")).toMatchObject({
      x: 100,
      y: 80,
      width: 1080,
      height: 1440,
    });
    expect(result.find((element) => element.id === "card")).toMatchObject({
      x: 208,
      y: 224,
      width: 540,
      height: 360,
      frameId: "slide-1",
    });
    expect(result.find((element) => element.id === "title")).toMatchObject({
      x: 316,
      y: 368,
      width: 400,
      height: 80,
      fontSize: 40,
      baseline: 36,
    });
    expect(result.find((element) => element.id === "arrow")).toMatchObject({
      x: 424,
      y: 656,
      width: 200,
      height: 400,
      points: [
        [0, 0],
        [200, 400],
      ],
      startBinding: { elementId: "card", focus: 0, gap: 10 },
    });
  });

  it("binds orphan content only when it visually overlaps one Slide", () => {
    const result = normalizeSlideFrames(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "slide-2",
          type: "frame",
          x: 1200,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "unbound-image",
          type: "image",
          x: 1300,
          y: 100,
          width: 500,
          height: 400,
          frameId: null,
        },
        {
          id: "stale-title",
          type: "text",
          x: 100,
          y: 100,
          width: 400,
          height: 80,
          frameId: "deleted-slide",
        },
        {
          id: "outside-note",
          type: "text",
          x: -160,
          y: 120,
          width: 100,
          height: 60,
          frameId: null,
        },
        {
          id: "partly-outside-image",
          type: "image",
          x: 2100,
          y: 100,
          width: 400,
          height: 300,
          frameId: null,
        },
      ],
      { width: 1080, height: 1440 },
    );

    expect(result.find((element) => element.id === "unbound-image"))
      .toMatchObject({ frameId: "slide-2" });
    expect(result.find((element) => element.id === "stale-title"))
      .toMatchObject({ frameId: "slide-1" });
    expect(result.find((element) => element.id === "outside-note"))
      .toMatchObject({ x: -160, y: 120, frameId: null });
    expect(
      result.find((element) => element.id === "partly-outside-image"),
    ).toMatchObject({
      x: 2100,
      y: 100,
      width: 400,
      height: 300,
      frameId: "slide-2",
    });
  });

  it("detects the arrow-key step that would fully detach content from its Slide", () => {
    expect(
      wouldNudgeElementsOutsideOwningSlides(
        [
          {
            id: "slide-1",
            type: "frame",
            x: 0,
            y: 0,
            width: 1080,
            height: 1440,
          },
          {
            id: "image-1",
            type: "image",
            x: 1079,
            y: 100,
            width: 1,
            height: 200,
            frameId: "slide-1",
          },
        ],
        { "image-1": true },
        { x: 1, y: 0 },
      ),
    ).toBe(true);
  });

  it("allows an arrow-key step while content still overlaps its Slide", () => {
    expect(
      wouldNudgeElementsOutsideOwningSlides(
        [
          {
            id: "slide-1",
            type: "frame",
            x: 0,
            y: 0,
            width: 1080,
            height: 1440,
          },
          {
            id: "image-1",
            type: "image",
            x: 1078,
            y: 100,
            width: 10,
            height: 200,
            frameId: "slide-1",
          },
        ],
        { "image-1": true },
        { x: 1, y: 0 },
      ),
    ).toBe(false);
  });

  it("repairs a persisted frame child that is fully outside its owner without rebinding it", () => {
    const result = repairInvalidSlideChildren(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "slide-2",
          type: "frame",
          x: 1200,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "ghost-image",
          type: "image",
          x: 1094,
          y: 100,
          width: 900,
          height: 500,
          frameId: "slide-1",
        },
      ],
    );

    expect(result.find((element) => element.id === "ghost-image")).toMatchObject(
      {
        x: 1016,
        y: 100,
        frameId: "slide-1",
      },
    );
  });

  it("does not snap a frame child back during ordinary scene normalization", () => {
    const result = normalizeSlideFrames(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "dragging-image",
          type: "image",
          x: 1094,
          y: 100,
          width: 900,
          height: 500,
          frameId: "slide-1",
        },
      ],
      { width: 1080, height: 1440 },
    );

    expect(result.find((element) => element.id === "dragging-image"))
      .toMatchObject({ x: 1094, y: 100, frameId: "slide-1" });
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

  it("preserves unchanged element identity when adding a Slide at the end", () => {
    const existingFrame = {
      id: "slide-1",
      type: "frame",
      x: 0,
      y: 0,
      width: 1080,
      height: 1440,
      name: "Slide 1",
      locked: true,
    };
    const existingCard = {
      id: "card-1",
      type: "rectangle",
      x: 100,
      y: 120,
      width: 240,
      height: 160,
      frameId: "slide-1",
    };

    const result = createSlide(
      [existingFrame, existingCard],
      "slide-1",
      { width: 1080, height: 1440 },
      () => "slide-2",
    );

    expect(result.elements.find((element) => element.id === "slide-1")).toBe(
      existingFrame,
    );
    expect(result.elements.find((element) => element.id === "card-1")).toBe(
      existingCard,
    );
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

  it("deletes unbound content inside the removed Slide without corrupting the next Slide", () => {
    const result = deleteSlide(
      [
        {
          id: "slide-1",
          type: "frame",
          x: 0,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "slide-2",
          type: "frame",
          x: 1200,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "unbound-image-2",
          type: "image",
          x: 1300,
          y: 200,
          width: 800,
          height: 600,
          frameId: null,
        },
        {
          id: "slide-3",
          type: "frame",
          x: 2400,
          y: 0,
          width: 1080,
          height: 1440,
        },
        {
          id: "unbound-title-3",
          type: "text",
          x: 2500,
          y: 100,
          width: 400,
          height: 80,
          frameId: null,
          text: "Slide 3 title",
        },
      ],
      "slide-2",
    );

    expect(result.elements.some((element) => element.id === "unbound-image-2"))
      .toBe(false);
    expect(result.elements.find((element) => element.id === "slide-3")?.x)
      .toBe(1200);
    expect(
      result.elements.find((element) => element.id === "unbound-title-3"),
    ).toMatchObject({ x: 1300, text: "Slide 3 title" });
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
