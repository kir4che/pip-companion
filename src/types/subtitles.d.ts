// 字幕文字片段
interface SubtitleSegment {
  text: string;
}

interface SubtitleLine {
  segments: SubtitleSegment[];
  from?: number;
  to?: number;
}

interface RenderedSubtitleLine {
  line: SubtitleLine;
  role: "primary" | "secondary";
  pairIndex: number;
}

interface TimedSubtitleCue {
  from: number;
  to: number;
  content: string;
}

interface SubtitleTrackOption {
  id: string;
  index: number;
  label: string;
  language?: string;
  selected: boolean;
}

interface SubtitleTranslationConfig {
  provider: SubtitleTranslationProvider;
  microsoftKey: string;
  microsoftRegion: string;
  googleKey: string;
  deeplKey: string;
}

interface StandardTextTrackProvider {
  getTracks(video: HTMLVideoElement | null): TextTrack[];
  getSelectedTrack(
    video: HTMLVideoElement | null,
    preferred: TextTrack | null,
  ): TextTrack | null;
  getLines(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): SubtitleLine[];
  getActiveLines(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    currentTime: number,
  ): SubtitleLine[];
  getTimedCues(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): TimedSubtitleCue[];
  selectTrack(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    beforeChange: (track: TextTrack) => void,
  ): boolean;
}

type SubtitleFontFamily = DanmakuFontFamily;
type SubtitleEdgeStyle = "none" | "shadow" | "raised" | "depressed" | "outline";
interface SubtitleStyleSettings {
  fontFamily: SubtitleFontFamily;
  fontWeight: number;
  lineHeightScale: number;
  fontSizeScale: number;
  textColor: string;
  backgroundColor: string;
  backgroundOpacity: number;
  edgeStyle: SubtitleEdgeStyle;
  edgeColor: string;
  edgeIntensity: number;
  bottomOffset: number;
}

interface SubtitleLayoutSettings {
  backgroundColor: string;
  backgroundOpacity: number;
  bottomOffset: number;
  pairGap: number;
  letterSpacing: number;
}

type SubtitleExtract = (node: HTMLElement) => SubtitleLine[];
