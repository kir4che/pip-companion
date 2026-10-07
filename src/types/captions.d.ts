// 字幕文字及其顯示樣式
interface CaptionSegment {
  text: string;
  color?: string;
  bg?: string;
  fontFamily?: string;
  textShadow?: string;
}

interface CaptionLine {
  segments: CaptionSegment[];
}

type CaptionExtract = (node: HTMLElement) => CaptionLine[];
