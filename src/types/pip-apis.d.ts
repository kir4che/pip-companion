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

// 縮圖預覽影格資訊
interface StoryboardFrame {
  url: string;
  x: number;
  y: number;
  width: number;
  height: number;
  sheetWidth?: number;
  sheetHeight?: number;
}

// 巴哈動畫瘋縮圖資料格式
interface BahaStoryboardData {
  sn: string;
  width: number;
  height: number;
  cols: number;
  rows: number;
  interval: number;
  images: string[];
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
  canSendDanmaku: boolean;
  getDanmakuCharacterLimit(): number | null;
  sendDanmaku(text: string): Promise<{
    ok: boolean;
    nativeInputCleared: boolean;
  }>;
  matchesCommentsShortcut(e: KeyboardEvent): boolean;
  matchesDanmakuShortcut(e: KeyboardEvent): boolean;
  matchesScreenshotShortcut(e: KeyboardEvent): boolean;
  matchesLaunchShortcut(e: KeyboardEvent): boolean;
  closePip(): void;
  screenshot(): void;
  formatTime(seconds: number): string;
  getStoryboardFrame?(seconds: number): StoryboardFrame | null;
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
  timeTooltipThumb: HTMLElement;
  timeTooltipText: HTMLElement;
  setDanmakuEnabled(enabled: boolean): void;
}

interface PipUiApi {
  create(
    win: Window,
    actions: PipUiActions,
    video: HTMLVideoElement,
  ): PipUiHandle;
}

// 擴充功能彈出視窗與頁面共用的工具
interface DanmakuSettingsApi {
  STORAGE_KEY: string;
  FONT_FAMILIES: Record<DanmakuFontFamily, string>;
  SPEED_OPTIONS: readonly { value: number; label: string }[];
  DEFAULTS: DanmakuStyleSettings;
  normalize(value: unknown): DanmakuStyleSettings;
}

interface CaptionSettingsApi {
  STORAGE_KEY: string;
  FONT_FAMILIES: Record<CaptionFontFamily, string>;
  DEFAULTS: CaptionStyleSettings;
  normalize(value: unknown): CaptionStyleSettings;
  apply(element: HTMLElement, settings: CaptionStyleSettings): void;
}

interface BilibiliDanmakuRenderer {
  duration: number;
  clear(): void;
  beginSeekRestore(): void;
  endSeekRestore(): void;
  emit(data: DanmakuData, options?: DanmakuEmitOptions): void;
  setPlaybackRate(rate: number): void;
}

interface ContentBilibiliDanmakuDependencies {
  getRenderer(): BilibiliDanmakuRenderer | null;
  isSettingsLoaded(): boolean;
  isVisible(): boolean;
  getSpeedScale(): number;
  lateToleranceSeconds: number;
  restoreWindowSeconds: number;
  maxScrollRestoreSeconds: number;
  maxFixedRestoreSeconds: number;
  maxAdvancedRestoreSeconds: number;
}

interface ContentBilibiliDanmakuController {
  setSourceVideo(video: HTMLVideoElement | null): void;
  checkAndBind(video: HTMLVideoElement | null): void;
  destroy(): void;
}

interface ContentBilibiliDanmakuApi {
  create(
    dependencies: ContentBilibiliDanmakuDependencies,
  ): ContentBilibiliDanmakuController;
}

interface PipCompanionUtil {
  SHORTCUT_DEFAULTS: Record<ShortcutKey, Shortcut>;
  SHORTCUT_KEYS: ShortcutKey[];
  FIXED_SHORTCUTS: { label: string; shortcut: Shortcut }[];
  normalizeShortcut(value: unknown, fallback: Shortcut): Shortcut;
  hasMetaModifier(e: KeyboardEvent): boolean;
  matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean;
  formatShortcut(value: Shortcut, forAria?: boolean): string;
  formatTime(seconds: number): string;
  parseTime(input: string): number | null;
}

interface ContentVideoApi {
  getDocumentPip(): Window["documentPictureInPicture"];
  findVideo(): HTMLVideoElement | null;
}

interface ContentCaptionsApi {
  initializeCaptionsOn(): void;
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
  toggleDanmakuFromShortcut(): void;
  isLiveStream(video: HTMLVideoElement | null): boolean;
  resizePipWindow(
    innerWidth: number,
    width: number,
    height: number,
  ): Promise<unknown>;
}

interface ContentStoryboardApi {
  getFrame(
    seconds: number,
    video: HTMLVideoElement | null,
  ): StoryboardFrame | null;
  preload(video: HTMLVideoElement | null): void;
  reset(): void;
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

interface ContentDanmakuSenderPlatformApi {
  isSupportedPage(): boolean;
  getCharacterLimit(): number | null;
  send(text: string): Promise<{
    ok: boolean;
    nativeInputCleared: boolean;
  }>;
}

type ContentBahamutDanmakuSenderApi = ContentDanmakuSenderPlatformApi;
type ContentBilibiliDanmakuSenderApi = ContentDanmakuSenderPlatformApi;
type ContentYouTubeDanmakuSenderApi = ContentDanmakuSenderPlatformApi;

type ContentDanmakuSenderApi = ContentDanmakuSenderPlatformApi;

interface BilibiliDanmakuConfigApi {
  segmentSeconds: number;
}

interface BilibiliVideoPath {
  videoId: string;
  bvid: string;
  avid: string;
}

interface PipCompanionSiteUtils {
  isYouTubeHost(hostname: string): boolean;
  isBilibiliHost(hostname: string): boolean;
  isBilibiliLiveHost(hostname: string): boolean;
  isTwitchHost(hostname: string): boolean;
  isBahamutHost(hostname: string): boolean;
  isGamerHost(hostname: string): boolean;
  parseYouTubeVideoId(href: string): string | null;
  parseBilibiliVideoPath(pathname: string): BilibiliVideoPath | null;
}

interface PipCompanionGlobal {
  PipAudio: PipAudioApi;
  PipUI: PipUiApi;
  ContentVideo: ContentVideoApi;
  ContentCaptions: ContentCaptionsApi;
  ContentFeedback: ContentFeedbackApi;
  ContentPlayback: ContentPlaybackApi;
  ContentStoryboard: ContentStoryboardApi;
  ContentScreenshot: ContentScreenshotApi;
  ContentPipLifecycle: ContentPipLifecycleApi;
  ContentBilibiliDanmaku: ContentBilibiliDanmakuApi;
  ContentBahamutDanmakuSender: ContentBahamutDanmakuSenderApi;
  ContentBilibiliDanmakuSender: ContentBilibiliDanmakuSenderApi;
  ContentYouTubeDanmakuSender: ContentYouTubeDanmakuSenderApi;
  ContentDanmakuSender: ContentDanmakuSenderApi;
  ContentDanmakuRenderer: ContentDanmakuRendererApi;
  ContentDanmakuSources: ContentDanmakuSourcesApi;
  ContentYouTubeDanmaku: ContentYouTubeDanmakuApi;
  bilibiliDanmakuConfig: BilibiliDanmakuConfigApi;
  danmakuSettings: DanmakuSettingsApi;
  captionSettings: CaptionSettingsApi;
  site: PipCompanionSiteUtils;
  util: PipCompanionUtil;
}

declare var PipCompanion: PipCompanionGlobal;
