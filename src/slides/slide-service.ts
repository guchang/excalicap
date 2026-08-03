export interface SlideSceneElement {
  readonly id: string;
  readonly type: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name?: string;
  readonly frameId?: string | null;
  readonly isDeleted?: boolean;
  readonly [key: string]: unknown;
}

export interface SlideDescriptor {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly name: string;
}

export interface SlideMutation {
  readonly elements: readonly SlideSceneElement[];
  readonly slides: SlideDescriptor[];
  readonly currentSlideId: string;
}

const SLIDE_GAP = 120;

function frameElements(elements: readonly SlideSceneElement[]) {
  return elements
    .filter((element) => element.type === "frame" && !element.isDeleted)
    .sort((left, right) => left.x - right.x);
}

export function lockSlideFrames(
  elements: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  let changed = false;
  const lockedElements = elements.map((element) => {
    if (element.type !== "frame" || element.locked === true) {
      return element;
    }
    changed = true;
    return { ...element, locked: true };
  });
  let ordinaryElementSeen = false;
  const frameAboveContent = lockedElements.some((element) => {
    if (element.type !== "frame") {
      ordinaryElementSeen = true;
      return false;
    }
    return ordinaryElementSeen;
  });
  if (!frameAboveContent) {
    return changed ? lockedElements : elements;
  }
  return [
    ...lockedElements.filter((element) => element.type === "frame"),
    ...lockedElements.filter((element) => element.type !== "frame"),
  ];
}

export function alignSlidesVertically(
  elements: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  const slides = frameElements(elements);
  const anchorY = slides[0]?.y;
  if (anchorY === undefined) {
    return elements;
  }

  const deltas = new Map(
    slides
      .map((slide) => [slide.id, anchorY - slide.y] as const)
      .filter(([, deltaY]) => deltaY !== 0),
  );
  if (deltas.size === 0) {
    return elements;
  }

  return elements.map((element) => {
    const ownerFrameId =
      element.type === "frame" ? element.id : (element.frameId ?? null);
    const deltaY = ownerFrameId ? deltas.get(ownerFrameId) : undefined;
    return deltaY === undefined
      ? element
      : { ...element, y: element.y + deltaY };
  });
}

export function normalizeSlideFrames(
  elements: readonly SlideSceneElement[],
  frameSize: { readonly width: number; readonly height: number },
): readonly SlideSceneElement[] {
  const frames = frameElements(elements);
  const firstFrame = frames[0];
  if (!firstFrame) {
    return lockSlideFrames(elements);
  }

  let nextX = firstFrame.x;
  const targets = new Map(
    frames.map((frame) => {
      const target = {
        source: frame,
        x: nextX,
        y: firstFrame.y,
      };
      nextX += frameSize.width + SLIDE_GAP;
      return [frame.id, target] as const;
    }),
  );

  const normalized = elements.map((element) => {
    const ownerFrameId =
      element.type === "frame" ? element.id : (element.frameId ?? null);
    const target = ownerFrameId ? targets.get(ownerFrameId) : undefined;
    if (!target) {
      return element;
    }

    const deltaX = target.x - target.source.x;
    const deltaY = target.y - target.source.y;
    if (element.type === "frame") {
      if (
        deltaX === 0 &&
        deltaY === 0 &&
        element.width === frameSize.width &&
        element.height === frameSize.height
      ) {
        return element;
      }
      return {
        ...element,
        x: target.x,
        y: target.y,
        width: frameSize.width,
        height: frameSize.height,
      };
    }

    const isSlideBackground =
      element.type === "rectangle" &&
      element.locked === true &&
      element.x === target.source.x &&
      element.y === target.source.y &&
      element.width === target.source.width &&
      element.height === target.source.height;
    if (isSlideBackground) {
      if (
        deltaX === 0 &&
        deltaY === 0 &&
        element.width === frameSize.width &&
        element.height === frameSize.height
      ) {
        return element;
      }
      return {
        ...element,
        x: target.x,
        y: target.y,
        width: frameSize.width,
        height: frameSize.height,
      };
    }
    if (deltaX === 0 && deltaY === 0) {
      return element;
    }
    return {
      ...element,
      x: element.x + deltaX,
      y: element.y + deltaY,
    };
  });

  const normalizedElements = normalized.every(
    (element, index) => element === elements[index],
  )
    ? elements
    : normalized;
  return lockSlideFrames(normalizedElements);
}

export function getSlides(
  elements: readonly SlideSceneElement[],
): SlideDescriptor[] {
  return frameElements(elements).map((frame, index) => ({
    id: frame.id,
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
    name: `Slide ${index + 1}`,
  }));
}

function arrangeSlides(
  elements: readonly SlideSceneElement[],
  orderedFrameIds: readonly string[],
) {
  const byFrame = new Map(frameElements(elements).map((frame) => [frame.id, frame]));
  const deltas = new Map<string, number>();
  let nextX = 0;

  orderedFrameIds.forEach((frameId, index) => {
    const frame = byFrame.get(frameId);
    if (!frame) {
      throw new Error(`找不到幻灯片 ${frameId}`);
    }
    deltas.set(frameId, nextX - frame.x);
    nextX += frame.width + SLIDE_GAP;
    byFrame.set(frameId, { ...frame, name: `Slide ${index + 1}` });
  });

  return lockSlideFrames(
    elements.map((element) => {
      const ownerFrameId =
        element.type === "frame" ? element.id : (element.frameId ?? null);
      if (!ownerFrameId || !deltas.has(ownerFrameId)) {
        return { ...element };
      }
      const deltaX = deltas.get(ownerFrameId) ?? 0;
      const arranged =
        element.type === "frame"
          ? byFrame.get(ownerFrameId) ?? element
          : element;
      return {
        ...arranged,
        x: element.x + deltaX,
      };
    }),
  );
}

function mutation(
  elements: readonly SlideSceneElement[],
  currentSlideId: string,
): SlideMutation {
  return {
    elements,
    slides: getSlides(elements),
    currentSlideId,
  };
}

export function createSlide(
  elements: readonly SlideSceneElement[],
  afterId: string | null,
  frameSize: { readonly width: number; readonly height: number },
  createId: () => string,
): SlideMutation {
  const slides = getSlides(elements);
  const afterIndex = afterId
    ? slides.findIndex((slide) => slide.id === afterId)
    : slides.length - 1;
  if (afterId && afterIndex < 0) {
    throw new Error(`找不到幻灯片 ${afterId}`);
  }
  const frameId = createId();
  const newFrame: SlideSceneElement = {
    id: frameId,
    type: "frame",
    x: 0,
    y: slides[0]?.y ?? 0,
    width: frameSize.width,
    height: frameSize.height,
    name: "Slide",
    children: [],
  };
  const orderedIds = slides.map((slide) => slide.id);
  orderedIds.splice(afterIndex + 1, 0, frameId);
  const arranged = arrangeSlides([...elements, newFrame], orderedIds);
  return mutation(arranged, frameId);
}

export function deleteSlide(
  elements: readonly SlideSceneElement[],
  frameId: string,
): SlideMutation {
  const slides = getSlides(elements);
  if (slides.length <= 1) {
    throw new Error("至少需要保留一张幻灯片");
  }
  if (!slides.some((slide) => slide.id === frameId)) {
    throw new Error(`找不到幻灯片 ${frameId}`);
  }
  const nextElements = elements.filter(
    (element) => element.id !== frameId && element.frameId !== frameId,
  );
  const remainingIds = slides
    .filter((slide) => slide.id !== frameId)
    .map((slide) => slide.id);
  const arranged = arrangeSlides(nextElements, remainingIds);
  return mutation(arranged, remainingIds[0]);
}

function rewriteReferences(
  value: unknown,
  idMap: ReadonlyMap<string, string>,
): unknown {
  if (typeof value === "string") {
    return idMap.get(value) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => rewriteReferences(item, idMap));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteReferences(item, idMap),
      ]),
    );
  }
  return value;
}

export function duplicateSlide(
  elements: readonly SlideSceneElement[],
  frameId: string,
  createId: () => string,
): SlideMutation {
  const slides = getSlides(elements);
  const sourceIndex = slides.findIndex((slide) => slide.id === frameId);
  if (sourceIndex < 0) {
    throw new Error(`找不到幻灯片 ${frameId}`);
  }
  const sourceElements = elements.filter(
    (element) => element.id === frameId || element.frameId === frameId,
  );
  const idMap = new Map(
    sourceElements.map((element) => [element.id, createId()]),
  );
  const copies = sourceElements.map(
    (element) =>
      rewriteReferences(element, idMap) as SlideSceneElement,
  );
  const copiedFrameId = idMap.get(frameId);
  if (!copiedFrameId) {
    throw new Error("复制幻灯片失败");
  }
  const orderedIds = slides.map((slide) => slide.id);
  orderedIds.splice(sourceIndex + 1, 0, copiedFrameId);
  const arranged = arrangeSlides([...elements, ...copies], orderedIds);
  return mutation(arranged, copiedFrameId);
}

export function reorderSlides(
  elements: readonly SlideSceneElement[],
  orderedFrameIds: readonly string[],
): readonly SlideSceneElement[] {
  const existingIds = getSlides(elements).map((slide) => slide.id);
  if (
    orderedFrameIds.length !== existingIds.length ||
    existingIds.some((id) => !orderedFrameIds.includes(id))
  ) {
    throw new Error("幻灯片排序列表与当前项目不一致");
  }
  return arrangeSlides(elements, orderedFrameIds);
}
