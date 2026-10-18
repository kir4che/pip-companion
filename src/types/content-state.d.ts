// 記錄頁面與浮動視窗運作狀態
type NextControl = HTMLElement & { disabled?: boolean };

interface PendingNextPlaybackState {
  volumePercent: number;
  muted: boolean;
  playbackRate: number;
}

interface VideoStash {
  parent: Node | null;
  next: Node | null;
  inlineStyle: string;
  controls: boolean;
  placeholder: HTMLElement | null;
}

type PipSession =
  | { phase: "closed" } // 沒有 PiP 視窗
  | { phase: "opening" } // 等待瀏覽器建立視窗
  | { phase: "waiting"; window: Window; waitTimer: number | null } // 等待影片
  | { phase: "active"; window: Window; ui: PipUiHandle }; // 影片已掛載

interface State {
  // 快捷鍵與功能開關
  shortcuts: Record<ShortcutKey, Shortcut>;
  commentsEnabled: boolean;
  screenshotEnabled: boolean;
  danmakuEnabled: boolean;
  thumbnailPreviewEnabled: boolean;
  followPlaybackPip: boolean;
  pauseOnPipClose: boolean;
  seekSeconds: SeekSeconds;

  // 目前播放的影片與浮動視窗狀態
  lastNonOneRate: number;
  sourceVideo: HTMLVideoElement | null;
  sourceAbort: AbortController | null;
  videoStash: VideoStash | null;
  pipSession: PipSession;
  readonly pipWindow: Window | null;
  readonly pipUi: PipUiHandle | null;
  globalPipOpen: boolean;
  globalPipSourcePlaying: boolean;
  pipHandoffPending: boolean;

  // 字幕來源與顯示狀態
  nativeSubtitleTracks: Map<TextTrack, TextTrackMode> | null;
  youtubeSubtitlesInitiallyEnabled: boolean | null;
  subtitleNode: HTMLElement | null;
  subtitleExtract: SubtitleExtract | null;
  subtitleObserver: MutationObserver | null;
  subtitleLines: SubtitleLine[];
  subtitleStyle: SubtitleStyleSettings;
  secondarySubtitleStyle: SubtitleStyleSettings;
  subtitleLayout: SubtitleLayoutSettings;
  subtitleTranslationPreferences: SubtitleTranslationPreferences;
  subtitlessOn: boolean;
  lastSubtitleScan: number;

  // 頁面提示、播放控制與掃描排程
  feedbackTimer: number;
  lastDeepScan: number;
  deepVideoCache: HTMLVideoElement | null;
  pageToastEl: HTMLElement | null;
  pageToastTimer: number;
  nextControlCacheAt: number;
  nextControlCache: NextControl | null;
  nextClickTimer: number;
  nextClickPending: boolean;
  nextVideoRequested: boolean;
  nextPlaybackState: PendingNextPlaybackState | null;
  nextVideoSourceKey: string;
  scanTimer: number;
}
