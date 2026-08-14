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

function rotatedBounds(element: SlideSceneElement) {
  const angle = typeof element.angle === "number" ? element.angle : 0;
  const centerX = element.x + element.width / 2;
  const centerY = element.y + element.height / 2;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const corners = [
    [element.x, element.y],
    [element.x + element.width, element.y],
    [element.x + element.width, element.y + element.height],
    [element.x, element.y + element.height],
  ].map(([x, y]) => ({
    x: centerX + (x - centerX) * cosine - (y - centerY) * sine,
    y: centerY + (x - centerX) * sine + (y - centerY) * cosine,
  }));
  return {
    left: Math.min(...corners.map((corner) => corner.x)),
    top: Math.min(...corners.map((corner) => corner.y)),
    right: Math.max(...corners.map((corner) => corner.x)),
    bottom: Math.max(...corners.map((corner) => corner.y)),
  };
}

function elementOverlapsFrame(
  element: SlideSceneElement,
  frame: SlideSceneElement | SlideDescriptor,
): boolean {
  const bounds = rotatedBounds(element);
  return (
    bounds.right > frame.x &&
    bounds.left < frame.x + frame.width &&
    bounds.bottom > frame.y &&
    bounds.top < frame.y + frame.height
  );
}

export function repairInvalidSlideChildren(
  elements: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  const frames = frameElements(elements);
  const framesById = new Map(frames.map((frame) => [frame.id, frame]));
  let changed = false;
  const restored = elements.map((element) => {
    if (element.type === "frame" || element.isDeleted || !element.frameId) {
      return element;
    }
    const frame = framesById.get(element.frameId);
    if (!frame || elementOverlapsFrame(element, frame)) {
      return element;
    }
    const bounds = rotatedBounds(element);
    const visibleWidth = Math.min(64, frame.width, Math.max(1, element.width));
    const visibleHeight = Math.min(
      64,
      frame.height,
      Math.max(1, element.height),
    );
    let deltaX = 0;
    let deltaY = 0;
    if (bounds.right <= frame.x) {
      deltaX = frame.x + visibleWidth - bounds.right;
    } else if (bounds.left >= frame.x + frame.width) {
      deltaX = frame.x + frame.width - visibleWidth - bounds.left;
    }
    if (bounds.bottom <= frame.y) {
      deltaY = frame.y + visibleHeight - bounds.bottom;
    } else if (bounds.top >= frame.y + frame.height) {
      deltaY = frame.y + frame.height - visibleHeight - bounds.top;
    }
    changed = true;
    return {
      ...element,
      x: element.x + deltaX,
      y: element.y + deltaY,
    };
  });
  return changed ? restored : elements;
}

function owningFrameId(
  element: SlideSceneElement,
  frames: readonly SlideSceneElement[],
): string | null {
  if (element.type === "frame") {
    return element.id;
  }
  if (element.frameId) {
    const explicitFrame = frames.find((frame) => frame.id === element.frameId);
    if (explicitFrame) {
      return elementOverlapsFrame(element, explicitFrame)
        ? explicitFrame.id
        : null;
    }
  }
  const overlappingFrames = frames.filter(
    (frame) => elementOverlapsFrame(element, frame),
  );
  return overlappingFrames.length === 1 ? overlappingFrames[0].id : null;
}

function bindElementsToSlideFrames(
  elements: readonly SlideSceneElement[],
  frames: readonly SlideSceneElement[],
): readonly SlideSceneElement[] {
  let changed = false;
  const boundElements = elements.map((element) => {
    if (element.type === "frame" || element.isDeleted) {
      return element;
    }
    const frameId = owningFrameId(element, frames);
    if (!frameId || element.frameId === frameId) {
      return element;
    }
    changed = true;
    return { ...element, frameId };
  });
  return changed ? boundElements : elements;
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
  const boundElements = bindElementsToSlideFrames(elements, slides);
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
    return boundElements;
  }

  return boundElements.map((element) => {
    const ownerFrameId = owningFrameId(element, slides);
    const deltaY = ownerFrameId ? deltas.get(ownerFrameId) : undefined;
    return deltaY === undefined
      ? element
      : { ...element, y: element.y + deltaY };
  });
}

export function normalizeSlideFrames(
  elements: readonly SlideSceneElement[],
  frameSize?: { readonly width: number; readonly height: number },
): readonly SlideSceneElement[] {
  const frames = frameElements(elements);
  const firstFrame = frames[0];
  if (!firstFrame) {
    return lockSlideFrames(elements);
  }
  const boundElements = bindElementsToSlideFrames(elements, frames);

  let nextX = firstFrame.x;
  const targets = new Map(
    frames.map((frame) => {
      const width = frameSize?.width ?? frame.width;
      const height = frameSize?.height ?? frame.height;
      const target = {
        source: frame,
        x: nextX,
        y: firstFrame.y,
        width,
        height,
      };
      nextX += width + SLIDE_GAP;
      return [frame.id, target] as const;
    }),
  );

  const normalized = boundElements.map((element) => {
    const ownerFrameId = owningFrameId(element, frames);
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
        element.width === target.width &&
        element.height === target.height
      ) {
        return element;
      }
      return {
        ...element,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
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
        element.width === target.width &&
        element.height === target.height
      ) {
        return element;
      }
      return {
        ...element,
        x: target.x,
        y: target.y,
        width: target.width,
        height: target.height,
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

function scalePoint(
  point: unknown,
  scaleX: number,
  scaleY: number,
): unknown {
  if (
    !Array.isArray(point) ||
    typeof point[0] !== "number" ||
    typeof point[1] !== "number"
  ) {
    return point;
  }
  return [point[0] * scaleX, point[1] * scaleY];
}

function scaleBinding(binding: unknown, scale: number): unknown {
  if (!binding || typeof binding !== "object") {
    return binding;
  }
  const gap = (binding as Record<string, unknown>).gap;
  return typeof gap === "number"
    ? { ...binding, gap: gap * scale }
    : binding;
}

function scaleSlideChild(
  element: SlideSceneElement,
  source: SlideSceneElement,
  target: { readonly x: number; readonly y: number },
  scaleX: number,
  scaleY: number,
): SlideSceneElement {
  const uniformScale = Math.min(scaleX, scaleY);
  const next: Record<string, unknown> = {
    ...element,
    x: target.x + (element.x - source.x) * scaleX,
    y: target.y + (element.y - source.y) * scaleY,
    width: element.width * scaleX,
    height: element.height * scaleY,
  };
  if (Array.isArray(element.points)) {
    next.points = element.points.map((point) =>
      scalePoint(point, scaleX, scaleY),
    );
  }
  if (element.lastCommittedPoint) {
    next.lastCommittedPoint = scalePoint(
      element.lastCommittedPoint,
      scaleX,
      scaleY,
    );
  }
  for (const key of ["fontSize", "baseline", "strokeWidth"] as const) {
    if (typeof element[key] === "number") {
      next[key] = element[key] * uniformScale;
    }
  }
  if (element.startBinding) {
    next.startBinding = scaleBinding(element.startBinding, uniformScale);
  }
  if (element.endBinding) {
    next.endBinding = scaleBinding(element.endBinding, uniformScale);
  }
  return next as unknown as SlideSceneElement;
}

/**
 * Explicitly migrates a Slide scene to a different output size. Unlike routine
 * normalization, this scales every bound child with its owning frame so a
 * preset change cannot leave content at coordinates from the old canvas.
 */
export function resizeSlideFrames(
  elements: readonly SlideSceneElement[],
  frameSize: { readonly width: number; readonly height: number },
): readonly SlideSceneElement[] {
  const frames = frameElements(elements);
  const firstFrame = frames[0];
  if (!firstFrame) {
    return lockSlideFrames(elements);
  }
  const boundElements = bindElementsToSlideFrames(elements, frames);
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

  const resized = boundElements.map((element) => {
    const explicitFrameId =
      typeof element.frameId === "string" && targets.has(element.frameId)
        ? element.frameId
        : null;
    const ownerFrameId =
      element.type === "frame"
        ? element.id
        : (explicitFrameId ?? owningFrameId(element, frames));
    const target = ownerFrameId ? targets.get(ownerFrameId) : undefined;
    if (!target) {
      return element;
    }
    if (element.type === "frame") {
      return {
        ...element,
        x: target.x,
        y: target.y,
        width: frameSize.width,
        height: frameSize.height,
      };
    }
    return scaleSlideChild(
      element,
      target.source,
      target,
      frameSize.width / target.source.width,
      frameSize.height / target.source.height,
    );
  });
  return lockSlideFrames(resized);
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

export function isPointOnSlide(
  elements: readonly SlideSceneElement[],
  point: { readonly x: number; readonly y: number },
): boolean {
  return getSlides(elements).some(
    (slide) =>
      point.x >= slide.x &&
      point.x <= slide.x + slide.width &&
      point.y >= slide.y &&
      point.y <= slide.y + slide.height,
  );
}

export function getSlideAtPoint(
  elements: readonly SlideSceneElement[],
  point: { readonly x: number; readonly y: number },
): SlideDescriptor | null {
  return (
    getSlides(elements).find(
      (slide) =>
        point.x >= slide.x &&
        point.x <= slide.x + slide.width &&
        point.y >= slide.y &&
        point.y <= slide.y + slide.height,
    ) ?? null
  );
}

export function wouldNudgeElementsOutsideOwningSlides(
  elements: readonly SlideSceneElement[],
  selectedElementIds: Readonly<Record<string, boolean>>,
  offset: { readonly x: number; readonly y: number },
): boolean {
  const framesById = new Map(
    frameElements(elements).map((frame) => [frame.id, frame]),
  );
  return elements.some((element) => {
    if (
      element.type === "frame" ||
      element.isDeleted ||
      !selectedElementIds[element.id] ||
      !element.frameId
    ) {
      return false;
    }
    const frame = framesById.get(element.frameId);
    if (!frame) {
      return false;
    }
    return !elementOverlapsFrame(
      {
        ...element,
        x: element.x + offset.x,
        y: element.y + offset.y,
      },
      frame,
    );
  });
}

function arrangeSlides(
  elements: readonly SlideSceneElement[],
  orderedFrameIds: readonly string[],
) {
  const frames = frameElements(elements);
  const boundElements = bindElementsToSlideFrames(elements, frames);
  const byFrame = new Map(frames.map((frame) => [frame.id, frame]));
  const deltas = new Map<string, number>();
  let nextX = 0;

  orderedFrameIds.forEach((frameId, index) => {
    const frame = byFrame.get(frameId);
    if (!frame) {
      throw new Error(`找不到幻灯片 ${frameId}`);
    }
    deltas.set(frameId, nextX - frame.x);
    nextX += frame.width + SLIDE_GAP;
    const name = `Slide ${index + 1}`;
    byFrame.set(frameId, frame.name === name ? frame : { ...frame, name });
  });

  return lockSlideFrames(
    boundElements.map((element) => {
      const ownerFrameId = owningFrameId(element, frames);
      if (!ownerFrameId || !deltas.has(ownerFrameId)) {
        return element;
      }
      const deltaX = deltas.get(ownerFrameId) ?? 0;
      const arranged =
        element.type === "frame"
          ? byFrame.get(ownerFrameId) ?? element
          : element;
      const x = element.x + deltaX;
      if (arranged === element && x === element.x) {
        return element;
      }
      if (arranged !== element && x === arranged.x) {
        return arranged;
      }
      return {
        ...arranged,
        x,
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
  const frames = frameElements(elements);
  const nextElements = elements.filter(
    (element) => owningFrameId(element, frames) !== frameId,
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

export function pasteSlides(
  elements: readonly SlideSceneElement[],
  clipboardElements: readonly SlideSceneElement[],
  afterId: string | null,
  createId: () => string,
): SlideMutation {
  const sourceElements = clipboardElements.filter(
    (element) => !element.isDeleted,
  );
  const sourceFrames = frameElements(sourceElements);
  if (sourceFrames.length === 0) {
    throw new Error("剪贴板中没有 Slide");
  }
  const slides = getSlides(elements);
  const afterIndex = afterId
    ? slides.findIndex((slide) => slide.id === afterId)
    : slides.length - 1;
  if (afterId && afterIndex < 0) {
    throw new Error(`找不到幻灯片 ${afterId}`);
  }
  const idMap = new Map(
    sourceElements.map((element) => [element.id, createId()]),
  );
  const copies = sourceElements.map(
    (element) => rewriteReferences(element, idMap) as SlideSceneElement,
  );
  const copiedFrameIds = sourceFrames.map((frame) => idMap.get(frame.id));
  if (copiedFrameIds.some((frameId) => !frameId)) {
    throw new Error("粘贴 Slide 失败");
  }
  const orderedIds = slides.map((slide) => slide.id);
  orderedIds.splice(
    afterIndex + 1,
    0,
    ...(copiedFrameIds as string[]),
  );
  const arranged = arrangeSlides([...elements, ...copies], orderedIds);
  return mutation(arranged, copiedFrameIds[0] as string);
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
