// 字幕文字片段
interface CaptionSegment {
  text: string;
}

interface CaptionLine {
  segments: CaptionSegment[];
}

type CaptionFontFamily = DanmakuFontFamily;
type CaptionEdgeStyle = "none" | "shadow" | "raised" | "depressed" | "outline";
interface CaptionStyleSettings {
  fontFamily: CaptionFontFamily;
  fontWeight: number;
  lineHeightScale: number;
  fontSizeScale: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  edgeStyle: CaptionEdgeStyle;
  edgeColor: string;
  outlineWidth: number;
  bottomOffset: number;
}

type CaptionExtract = (node: HTMLElement) => CaptionLine[];
