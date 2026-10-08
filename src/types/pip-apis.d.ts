// PiP 音訊控制功能
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

// 建立 PiP 介面時會用到的操作與回呼
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
  speedControl: HTMLElement;
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

// 擴充功能彈出視窗與頁面共用的工具
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

interface ContentVideoApi {
  getDocumentPip(): Window["documentPictureInPicture"];
  findVideo(): HTMLVideoElement | null;
}

interface ContentCaptionsApi {
  prepareNativeCaptions(): void;
  refreshSubtitle(force?: boolean): void;
  restoreNativeCaptionModes(): void;
  syncNativeCaptions(): void;
  renderSubtitle(): void;
  suppressNativeCaptions(): void;
}

interface ContentFeedbackApi {
  showFeedback(text: string): void;
  showPageToast(text: string): void;
  showPlaybackFeedback(paused: boolean): void;
  showFrameStepIcon(backward: boolean): void;
  showVolumeFeedback(): void;
}

interface ContentPlaybackApi {
  VOLUME_ICON_PATH: string;
  getSourceVolumePercent(): number;
  setSourceVolumePercent(percent: number, unmute: boolean): void;
  playNextVideo(): void;
  updatePlaybackUi(): void;
  togglePlayback(): void;
  adjustPlaybackRate(direction: number): void;
  togglePlaybackRate(): void;
  toggleMute(): void;
  toggleCaptions(): void;
  toggleDanmakuWithFeedback(): void;
  resizePipWindow(
    innerWidth: number,
    width: number,
    height: number,
  ): Promise<unknown>;
}

interface ContentScreenshotApi {
  savePipScreenshot(): void;
  ensureScreenshotButton(shortcut: Shortcut): void;
}

interface ContentPipLifecycleApi {
  bindSourceVideo(video: HTMLVideoElement): void;
  closePiP(closeWindow: boolean): void;
  openPiP(): Promise<{ ok: boolean; message?: string }>;
}

interface PipCompanionGlobal {
  PipAudio: PipAudioApi;
  PipUI: PipUiApi;
  ContentVideo: ContentVideoApi;
  ContentCaptions: ContentCaptionsApi;
  ContentFeedback: ContentFeedbackApi;
  ContentPlayback: ContentPlaybackApi;
  ContentScreenshot: ContentScreenshotApi;
  ContentPipLifecycle: ContentPipLifecycleApi;
  util: PipCompanionUtil;
}

declare var PipCompanion: PipCompanionGlobal;
