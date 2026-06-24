const DIMENSION_KEYWORDS = [
  '应用',
  '国家',
  '买量渠道',
  '渠道',
  '版本',
  '日期',
  '标准广告场景',
  '聚合广告场景',
];

const HIGHLIGHT_PATTERN = new RegExp(
  `(${DIMENSION_KEYWORDS.join('|')})\\s+([\\w\\u4e00-\\u9fa5\\-\\.]+)`,
  'g'
);

export interface HighlightSegment {
  text: string;
  isHighlight: boolean;
}

export function parseHighlightSegments(text: string): HighlightSegment[] {
  const segments: HighlightSegment[] = [];
  let lastIndex = 0;

  const regex = new RegExp(HIGHLIGHT_PATTERN.source, 'g');
  let match = regex.exec(text);

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        text: text.slice(lastIndex, match.index),
        isHighlight: false,
      });
    }
    segments.push({
      text: match[0],
      isHighlight: true,
    });
    lastIndex = match.index + match[0].length;
    match = regex.exec(text);
  }

  if (lastIndex < text.length) {
    segments.push({
      text: text.slice(lastIndex),
      isHighlight: false,
    });
  }

  return segments;
}
