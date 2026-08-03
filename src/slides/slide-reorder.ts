export function moveSlideToSlot(
  orderedIds: readonly string[],
  slideId: string,
  slot: number,
): readonly string[] {
  const sourceIndex = orderedIds.indexOf(slideId);
  if (sourceIndex < 0) {
    throw new Error(`找不到幻灯片 ${slideId}`);
  }

  const remainingIds = orderedIds.filter((id) => id !== slideId);
  if (!Number.isInteger(slot) || slot < 0 || slot > remainingIds.length) {
    throw new Error("幻灯片插入位置无效");
  }

  const nextIds = [...remainingIds];
  nextIds.splice(slot, 0, slideId);
  return nextIds.every((id, index) => id === orderedIds[index])
    ? orderedIds
    : nextIds;
}
