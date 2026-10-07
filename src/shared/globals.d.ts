// Keyboard shortcut settings shared by the popup and content scripts.
interface Shortcut {
  code: string;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

type ShortcutKey =
  | "launchShortcut"
  | "commentsShortcut"
  | "screenshotShortcut"
  | "danmakuShortcut";

// Browser APIs and YouTube player methods not included in the standard DOM types.
interface Window {
  documentPictureInPicture?: {
    requestWindow(options?: {
      width?: number;
      height?: number;
    }): Promise<Window>;
  } | null;
}

interface YouTubePlayer extends HTMLElement {
  nextVideo?: () => void;
  isMuted?: () => boolean;
  mute?: () => void;
  unMute?: () => void;
  toggleSubtitles?: () => void;
}

// Caption data copied from YouTube's rendered subtitle DOM.
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

// Content-script state and source-video restoration data.
type NextControl = HTMLElement & { disabled?: boolean };

interface VideoStash {
  parent: Node | null;
  next: Node | null;
  inlineStyle: string;
  controls: boolean;
  placeholder: HTMLElement | null;
}

interface State {
  // User preferences.
  launchShortcut: Shortcut;
  commentsShortcut: Shortcut;
  screenshotShortcut: Shortcut;
  danmakuShortcut: Shortcut;
  commentsEnabled: boolean;
  screenshotEnabled: boolean;

  // Source video and PiP lifecycle.
  lastNonOneRate: number;
  sourceVideo: HTMLVideoElement | null;
  sourceAbort: AbortController | null;
  videoStash: VideoStash | null;
  pipWindow: Window | null;
  pipUi: PipUiHandle | null;
  opening: boolean;

  // Subtitle tracking.
  nativeCaptionTracks: Set<TextTrack> | null;
  captionNode: HTMLElement | null;
  captionExtract: CaptionExtract | null;
  captionObserver: MutationObserver | null;
  captionLines: CaptionLine[];
  captionsOn: boolean;
  lastCaptionScan: number;
  captionEmptyCount: number;

  // Page UI, playback controls, and scanning timers.
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

// PiP audio module API.
interface PipAudioApi {
  getVolumePercent(video: HTMLVideoElement | null): number;
  isActiveFor(video: HTMLVideoElement | null): boolean;
  maxVolume(video: HTMLVideoElement | null): number;
  prepare(): void;
  resetToNative(video: HTMLVideoElement): void;
  setVolumePercent(
    video: HTMLVideoElement,
    percent: number,
    unmute: boolean,
    player: YouTubePlayer | null,
  ): void;
  start(video: HTMLVideoElement, pipWindow: Window | null): boolean;
  stop(): void;
  syncNativeVolume(video: HTMLVideoElement): void;
  toggleMute(video: HTMLVideoElement, player: YouTubePlayer | null): void;
}

// PiP UI module API and the callbacks supplied by the content-script coordinator.
interface PipUiActions {
  volumeIconPath: string;
  getVideo(): HTMLVideoElement | null;
  updatePlaybackUi(): void;
  togglePlayback(): void;
  adjustPlaybackRate(direction: number): void;
  togglePlaybackRate(): void;
  toggleMute(): void;
  playNext(): void;
  setVolume(percent: number, unmute: boolean): void;
  getMaxVolume(): number;
  showFeedback(text: string): void;
  showVolumeFeedback(): void;
  showFrameStepIcon(backward: boolean): void;
  getVolumePercent(): number;
  toggleCaptions(): void;
  toggleComments(): void;
  toggleDanmaku(): void;
  matchesCommentsShortcut(event: KeyboardEvent): boolean;
  matchesDanmakuShortcut(event: KeyboardEvent): boolean;
  matchesScreenshotShortcut(event: KeyboardEvent): boolean;
  screenshot(): void;
  formatTime(seconds: number): string;
  resize(innerWidth: number, width: number, height: number): Promise<unknown>;
}

interface PipUiHandle {
  video: HTMLVideoElement;
  screen: HTMLElement;
  subtitle: HTMLElement;
  feedback: HTMLElement;
  volumeValue: HTMLInputElement;
  volumeButton: HTMLButtonElement;
  volumePath: Element;
  playButton: HTMLButtonElement;
  nextButton: HTMLButtonElement;
  speedButton: HTMLButtonElement;
  speedSlider: HTMLInputElement;
  volumeSlider: HTMLInputElement;
  progress: HTMLInputElement;
  timeCurrent: HTMLInputElement;
  timeDuration: HTMLElement;
  miniProgress: HTMLElement;
  miniProgressFill: HTMLElement;
  timeTooltip: HTMLElement;
}

interface PipUiApi {
  create(
    win: Window,
    actions: PipUiActions,
    video: HTMLVideoElement,
  ): PipUiHandle;
}

// Shared utility API exposed to the popup and content scripts.
interface PipCompanionUtil {
  SHORTCUT_DEFAULTS: Record<ShortcutKey, Shortcut>;
  SHORTCUT_KEYS: ShortcutKey[];
  FIXED_SHORTCUTS: { label: string; shortcut: Shortcut }[];
  normalizeShortcut(value: unknown, fallback: Shortcut): Shortcut;
  matchesShortcut(event: KeyboardEvent, shortcut: Shortcut): boolean;
  formatShortcut(value: Shortcut, forAria?: boolean): string;
  formatTime(seconds: number): string;
  parseTime(input: string): number | null;
}

interface PipCompanionGlobal {
  PipAudio: PipAudioApi;
  PipUI: PipUiApi;
  util: PipCompanionUtil;
}

declare var PipCompanion: PipCompanionGlobal;

// Danmaku module functions shared by the content-script modules.
declare function toggleDanmaku(forceState?: boolean): boolean;
declare function initDanmakuInPip(win: Window, video: HTMLVideoElement): void;
declare function destroyDanmakuInPip(): void;
declare function setDanmakuPaused(paused: boolean): void;
declare function setDanmakuPlaybackRate(rate: number): void;
declare function isDanmakuEnabled(): boolean;
declare function checkAndBindDanmakuChat(): void;
declare function checkAndBindBilibiliDanmaku(
  video: HTMLVideoElement | null,
): void;
