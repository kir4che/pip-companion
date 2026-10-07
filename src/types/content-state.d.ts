// 記錄頁面與浮動視窗運作狀態的資料型別
type NextControl = HTMLElement & { disabled?: boolean };

interface VideoStash {
  parent: Node | null;
  next: Node | null;
  inlineStyle: string;
  controls: boolean;
  placeholder: HTMLElement | null;
}

interface State {
  // 快捷鍵與功能開關
  launchShortcut: Shortcut;
  commentsShortcut: Shortcut;
  screenshotShortcut: Shortcut;
  danmakuShortcut: Shortcut;
  commentsEnabled: boolean;
  screenshotEnabled: boolean;

  // 目前播放的影片與浮動視窗狀態
  lastNonOneRate: number;
  sourceVideo: HTMLVideoElement | null;
  sourceAbort: AbortController | null;
  videoStash: VideoStash | null;
  pipWindow: Window | null;
  pipUi: PipUiHandle | null;
  opening: boolean;

  // 字幕來源與顯示狀態
  nativeCaptionTracks: Map<TextTrack, TextTrackMode> | null;
  youtubeCaptionsInitiallyEnabled: boolean | null;
  captionNode: HTMLElement | null;
  captionExtract: CaptionExtract | null;
  captionObserver: MutationObserver | null;
  captionLines: CaptionLine[];
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
