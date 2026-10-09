// 記錄頁面與浮動視窗運作狀態的資料型別
type NextControl = HTMLElement & { disabled?: boolean };

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
  launchShortcut: Shortcut;
  commentsShortcut: Shortcut;
  screenshotShortcut: Shortcut;
  danmakuShortcut: Shortcut;
  commentsEnabled: boolean;
  screenshotEnabled: boolean;
  danmakuEnabled: boolean;

  // 目前播放的影片與浮動視窗狀態
  lastNonOneRate: number;
  sourceVideo: HTMLVideoElement | null;
  sourceAbort: AbortController | null;
  videoStash: VideoStash | null;
  pipSession: PipSession;
  readonly pipWindow: Window | null;
  readonly pipUi: PipUiHandle | null;
  globalPipOpen: boolean;

  // 字幕來源與顯示狀態
  nativeCaptionTracks: Map<TextTrack, TextTrackMode> | null;
  youtubeCaptionsInitiallyEnabled: boolean | null;
  captionNode: HTMLElement | null;
  captionExtract: CaptionExtract | null;
  captionObserver: MutationObserver | null;
  captionLines: CaptionLine[];
  captionStyle: CaptionStyleSettings;
  captionsOn: boolean;
  lastCaptionScan: number;
  captionEmptyCount: number;

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
  scanTimer: number;
}
