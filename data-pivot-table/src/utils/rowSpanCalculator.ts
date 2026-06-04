/**
 * 计算每个维度列的 rowSpan 值
 * @param rowHeaders 二维数组，每行包含多个维度值
 * @param dimensionIndex 维度索引（0 为最外层）
 * @returns rowSpan 数组，0 表示该单元格被合并，不渲染
 */
export function calculateRowSpans(
  rowHeaders: string[][],
  dimensionIndex: number
): number[] {
  const spans: number[] = new Array(rowHeaders.length).fill(0);
  let groupStart = 0;

  for (let i = 0; i < rowHeaders.length; i++) {
    // 检查是否应该开始新的分组
    const isNewGroup = i === 0 || !isSameGroup(rowHeaders, i, dimensionIndex);

    if (isNewGroup) {
      // 计算前一组的 rowSpan
      if (i > 0) {
        spans[groupStart] = i - groupStart;
      }
      groupStart = i;
    }
  }

  // 处理最后一组
  spans[groupStart] = rowHeaders.length - groupStart;

  return spans;
}

/**
 * 检查两行在指定维度层级是否属于同一组
 */
function isSameGroup(
  rowHeaders: string[][],
  currentIndex: number,
  dimensionIndex: number
): boolean {
  const current = rowHeaders[currentIndex];
  const previous = rowHeaders[currentIndex - 1];

  // 检查从最外层到当前层的所有维度是否相同
  for (let d = 0; d <= dimensionIndex; d++) {
    if (current[d] !== previous[d]) {
      return false;
    }
  }
  return true;
}

/**
 * 批量计算所有维度的 rowSpan
 */
export function calculateAllRowSpans(
  rowHeaders: string[][],
  dimensionCount: number
): number[][] {
  return Array.from({ length: dimensionCount }, (_, idx) =>
    calculateRowSpans(rowHeaders, idx)
  );
}
