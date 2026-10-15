type PipOperationResult =
  { ok: true } | { ok: false; message: string; code?: "GESTURE_REQUIRED" };

type ResizePipResult = { ok: true } | { ok: false };

// PiP 音訊控制功能
interface PipAudioApi {
  getVolumePercent(
    video: HTMLVideoElement | null,
    ignoreMuted?: boolean,
  ): number;
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

type SeekSeconds = 1 | 3 | 5 | 10 | 15 | 30;

interface PlaylistItem {
  index: number;
  title: string;
  duration?: string;
  videoId?: string;
}

interface PlaylistInfo {
  items: PlaylistItem[];
  currentIndex: number;
}

type PlaylistNextItemState = "available" | "unavailable" | "unknown";

interface ContentPlaylistApi {
  getPlaylist(): PlaylistInfo | null;
  hasPlaylist(): boolean;
  selectPlaylistItem(index: number, preparePlaybackState: () => void): void;
  getNextItemState(): PlaylistNextItemState;
}

// 巴哈動畫瘋縮圖資料格式
interface BahaStoryboardData {
  sn?: string;
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
  cancelNextPlaybackRestore(): void;
  getSeekSeconds(): SeekSeconds;
  updatePlaybackUi(): void;
  togglePlayback(): void;
  adjustPlaybackRate(direction: number): void;
  togglePlaybackRate(): void;
  toggleMute(): void;
  playNext(): void;
  getPlaylist(): PlaylistInfo | null;
  selectPlaylistItem(index: number): void;
  setVolume(percent: number, unmute: boolean): void;
  getMaxVolume(): number;
  showFeedback(text: string): void;
  showVolumeFeedback(): void;
  showFrameStepIcon(backward: boolean): void;
  getVolumePercent(): number;
  toggleSubtitles(): void;
  getSubtitlesEnabled(): boolean;
  isSubtitleTranslationSuspended(): boolean;
  resumeSubtitleTranslation(): void;
  hasSubtitleSource(): boolean;
  getSubtitleTracks(): SubtitleTrackOption[];
  selectSubtitleTrack(id: string): void;
  getSecondarySubtitleTracks(): SubtitleTrackOption[];
  getSelectedSecondarySubtitleTrack(): string;
  selectSecondarySubtitleTrack(id: string): void;
  getSubtitleTranslationPreferences(): SubtitleTranslationPreferences;
  getSubtitleTranslationLanguages(): Promise<
    SubtitleTranslationLanguageOption[]
  >;
  getSubtitleTranslationServices(): Promise<SubtitleTranslationServices | null>;
  setSubtitleTranslationProvider(
    provider: SubtitleTranslationProvider,
  ): Promise<boolean>;
  setSubtitleTranslationPreferences(
    preferences: SubtitleTranslationPreferences,
  ): void;
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
  matchesShortcut(e: KeyboardEvent, key: ShortcutKey): boolean;
  matchesWheelShortcut(e: WheelEvent): boolean;
  getShortcut(key: ShortcutKey): Shortcut;
  closePip(): void;
  screenshot(): void;
  formatTime(seconds: number): string;
  getStoryboardFrame?(seconds: number): StoryboardFrame | null;
  resize(
    innerWidth: number,
    width: number,
    height: number,
  ): Promise<ResizePipResult>;
}

interface PipUiHandle {
  readonly video: HTMLVideoElement;
  readonly screen: HTMLElement;
  readonly subtitle: HTMLElement;
  readonly feedback: HTMLElement;
  readonly volumeValue: HTMLInputElement;
  readonly volumeButton: HTMLButtonElement;
  readonly volumePath: Element;
  readonly playButton: HTMLButtonElement;
  readonly nextButton: HTMLButtonElement;
  readonly playlistButton: HTMLButtonElement;
  readonly playlistPanel: HTMLElement;
  readonly speedControl: HTMLElement;
  readonly speedButton: HTMLButtonElement;
  readonly speedSlider: HTMLInputElement;
  readonly volumeSlider: HTMLInputElement;
  readonly progress: HTMLInputElement;
  readonly timeCurrent: HTMLInputElement;
  readonly timeDuration: HTMLElement;
  readonly miniProgress: HTMLElement;
  readonly miniProgressFill: HTMLElement;
  readonly timeTooltip: HTMLElement;
  readonly timeTooltipThumb: HTMLElement;
  readonly timeTooltipText: HTMLElement;
  dispose(): void;
  refreshLocale(): void;
  refreshShortcuts(): void;
  setDanmakuEnabled(enabled: boolean): void;
  setThumbnailPreviewEnabled(enabled: boolean): void;
  refreshSubtitleTracks(): void;
  refreshSubtitleTranslationPreferences(): void;
  refreshSubtitleTranslationLanguages(): void;
  refreshSubtitleTranslationServices(): void;
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

interface SubtitleSettingsApi {
  STORAGE_KEY: string;
  SECONDARY_STORAGE_KEY: string;
  LAYOUT_STORAGE_KEY: string;
  FONT_FAMILIES: Record<SubtitleFontFamily, string>;
  DEFAULTS: SubtitleStyleSettings;
  SECONDARY_DEFAULTS: SubtitleStyleSettings;
  LAYOUT_DEFAULTS: SubtitleLayoutSettings;
  normalize(
    value: unknown,
    defaults?: SubtitleStyleSettings,
  ): SubtitleStyleSettings;
  normalizeLayout(value: unknown): SubtitleLayoutSettings;
  scrubOrphanedStyleFields(
    stored: unknown,
    normalized: SubtitleStyleSettings,
  ): { style: SubtitleStyleSettings; changed: boolean };
  applyLayout(element: HTMLElement, settings: SubtitleLayoutSettings): void;
  apply(element: HTMLElement, settings: SubtitleStyleSettings): void;
}

type SubtitleTranslationProvider = "microsoft" | "google" | "deepl";
interface SubtitleTranslationServiceOption {
  provider: SubtitleTranslationProvider;
  configured: boolean;
}
interface SubtitleTranslationServices {
  provider: SubtitleTranslationProvider;
  services: SubtitleTranslationServiceOption[];
}
type SubtitleTranslationLanguage = string;
interface SubtitleTranslationLanguageOption {
  code: SubtitleTranslationLanguage;
  label: string;
}

type SubtitleTranslationMode = "translation-only" | "bilingual";
interface SubtitleTranslationPreferences {
  enabled: boolean;
  mode: SubtitleTranslationMode;
  targetLanguage: SubtitleTranslationLanguage;
  preferNative: boolean;
  useNativeSecondaryTrack: boolean;
}
interface SubtitleTranslationSettingsApi {
  PREFERENCES_KEY: string;
  CONFIG_KEY: string;
  LANGUAGES: readonly SubtitleTranslationLanguage[];
  DEFAULT_PREFERENCES: SubtitleTranslationPreferences;
  normalizePreferences(value: unknown): SubtitleTranslationPreferences;
  getLanguageLabel(code: SubtitleTranslationLanguage): string;
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
  getMessage(key: string, substitutions?: string | string[]): string;
  getLocale(): "en" | "zh_TW" | "zh_CN";
  getHtmlLanguage(): "en" | "zh-Hant" | "zh-Hans";
  setLanguagePreference(value: unknown): "auto" | "en" | "zh_TW" | "zh_CN";
  getLanguagePreference(): "auto" | "en" | "zh_TW" | "zh_CN";
  SHORTCUT_DEFAULTS: Record<ShortcutKey, Shortcut>;
  SHORTCUT_KEYS: ShortcutKey[];
  DEFAULT_SEEK_SECONDS: SeekSeconds;
  SEEK_SECONDS_OPTIONS: readonly SeekSeconds[];
  normalizeSeekSeconds(value: unknown): SeekSeconds;
  isRecord(value: unknown): value is Record<string, unknown>;
  isValidExtraDanmakuSourceUrl(value: string): boolean;
  isExtensionMessage(value: unknown): value is ExtensionMessage;
  normalizeShortcut(value: unknown, fallback: Shortcut): Shortcut;
  hasMetaModifier(e: KeyboardEvent): boolean;
  matchesShortcut(e: KeyboardEvent, shortcut: Shortcut): boolean;
  matchesWheelShortcut(e: WheelEvent, shortcut: Shortcut): boolean;
  formatShortcut(value: Shortcut, forAria?: boolean, spaced?: boolean): string;
  formatTime(seconds: number): string;
  parseTime(input: string): number | null;
}

interface ContentPlatformCapabilities {
  id: "youtube" | "bilibili" | "twitch" | "bahamut" | "generic";
  subtitless: boolean;
  danmakuDisplay: boolean;
  danmakuSend: boolean;
  screenshot: boolean;
}

interface ContentPlatformApi {
  getCapabilities(): ContentPlatformCapabilities;
}

interface ContentVideoApi {
  getDocumentPip(): Window["documentPictureInPicture"];
  findVideo(includeDeep?: boolean): HTMLVideoElement | null;
}

interface SubtitleTranslationRuntime {
  onConfigChanged(previous: unknown, next: unknown): void;
  onPreferencesChanged(
    previous: SubtitleTranslationPreferences | null,
    next: SubtitleTranslationPreferences,
  ): void;
  onSubtitlesEnabledChanged(enabled: boolean): void;
  getRenderedSubtitleLines(sourceLines: SubtitleLine[]): RenderedSubtitleLine[];
}

interface SubtitleTranslationApi {
  create(options: {
    getPreferences(): SubtitleTranslationPreferences;
    isSubtitlesEnabled(): boolean;
    isSubtitleTranslationSuspended(): boolean;
    isNativeSecondaryActive(): boolean;
    getNativeSecondaryLines(): SubtitleLine[];
    hasSupportedTrack(): boolean;
    prefersNativeSubtitle(targetLanguage: string): boolean;
    getPreferNativeSecondaryLines(
      targetLanguage: string,
    ): SubtitleLine[] | null;
    showFeedback(message: string): void;
    render(): void;
  }): SubtitleTranslationRuntime;
}

interface NativeSecondarySubtitleTrackController {
  setVideo(video: HTMLVideoElement | null): void;
  getTrack(): TextTrack | null;
  hasTrack(): boolean;
  select(track: TextTrack, primary: TextTrack | null): boolean;
  activate(): void;
  clear(disable?: boolean): void;
  getLines(currentTime: number): SubtitleLine[];
}

interface NativeSecondarySubtitleTrackApi {
  create(options: {
    rememberMode(track: TextTrack): void;
    onChange(): void;
  }): NativeSecondarySubtitleTrackController;
}

interface ContentSubtitlesApi {
  initializeSubtitlesOn(): void;
  setNativeSubtitleVideo(video: HTMLVideoElement | null): void;
  onTranslationPreferencesChanged(
    previous: SubtitleTranslationPreferences | null,
    next: SubtitleTranslationPreferences,
  ): void;
  onTranslationConfigChanged(previous: unknown, next: unknown): void;
  setSubtitleEnabledOverride(enabled: boolean, nativeControl?: boolean): void;
  setSubtitlesEnabledFromPipShortcut(enabled: boolean): void;
  cancelSubtitleInitialization(): void;
  isSubtitleTranslationSuspended(): boolean;
  resumeSubtitleTranslation(): void;
  hasSubtitleSource(): boolean;
  getNativeSubtitleTracks(): SubtitleTrackOption[];
  selectNativeSubtitleTrack(id: string): void;
  getSecondarySubtitleTracks(): SubtitleTrackOption[];
  getSelectedSecondarySubtitleTrack(): string;
  selectSecondarySubtitleTrack(id: string): void;
  prepareNativeSubtitles(): void;
  refreshSubtitle(force?: boolean): void;
  restoreNativeSubtitleModes(): void;
  syncNativeSubtitles(): void;
  renderSubtitle(): void;
  suppressNativeSubtitles(): void;
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
  getPlaylist(): PlaylistInfo | null;
  selectPlaylistItem(index: number): void;
  applyPendingNextPlaybackState(video: HTMLVideoElement): void;
  cancelNextVideoRequest(): void;
  cancelNextPlaybackRestore(): void;
  updatePlaybackUi(): void;
  togglePlayback(): void;
  adjustPlaybackRate(direction: number): void;
  togglePlaybackRate(): void;
  toggleMute(): void;
  toggleSubtitles(): void;
  toggleDanmakuFromShortcut(): void;
  isLiveStream(video: HTMLVideoElement | null): boolean;
  resizePipWindow(
    innerWidth: number,
    width: number,
    height: number,
  ): Promise<ResizePipResult>;
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
  closePiP(closeWindow: boolean): Promise<void>;
  openPiP(): Promise<PipOperationResult>;
  restorePipBounds(): Promise<{ ok?: boolean; missing?: boolean }>;
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
  isNetflixHost(hostname: string): boolean;
  isHahowHost(hostname: string): boolean;
  isGamerHost(hostname: string): boolean;
  parseYouTubeVideoId(href: string): string | null;
  parseBilibiliVideoPath(pathname: string): BilibiliVideoPath | null;
}

interface LocaleMessage {
  message: string;
}

interface CustomSelectApi {
  enhance(select: HTMLSelectElement): void;
  enhanceAll(root?: ParentNode): void;
  containsTarget(
    select: HTMLSelectElement,
    target: EventTarget | null,
  ): boolean;
  closeForSelect(select: HTMLSelectElement): void;
  disposeForSelect(select: HTMLSelectElement): void;
  isOpenForTarget(target: EventTarget | null): boolean;
}

interface PipCompanionGlobal {
  locales: Record<"en" | "zh_TW" | "zh_CN", Record<string, LocaleMessage>>;
  customSelect: CustomSelectApi;
  PipAudio: PipAudioApi;
  PipUI: PipUiApi;
  ContentVideo: ContentVideoApi;
  ContentPlatform: ContentPlatformApi;
  ContentSubtitles: ContentSubtitlesApi;
  BilibiliSubtitles: typeof bilibiliSubtitles;
  NativeSecondarySubtitleTrack: NativeSecondarySubtitleTrackApi;
  standardTextTrack: StandardTextTrackProvider;
  SubtitleTranslation: SubtitleTranslationApi;
  ContentFeedback: ContentFeedbackApi;
  ContentPlayback: ContentPlaybackApi;
  ContentPlaylist: ContentPlaylistApi;
  ContentStoryboard: ContentStoryboardApi;
  ContentScreenshot: ContentScreenshotApi;
  ContentPipLifecycle: ContentPipLifecycleApi;
  ContentBilibiliDanmaku: ContentBilibiliDanmakuApi;
  ContentExtraBilibiliDanmaku: ContentExtraBilibiliDanmakuApi;
  ContentBahamutDanmakuSender: ContentBahamutDanmakuSenderApi;
  ContentBilibiliDanmakuSender: ContentBilibiliDanmakuSenderApi;
  ContentYouTubeDanmakuSender: ContentYouTubeDanmakuSenderApi;
  ContentDanmakuSender: ContentDanmakuSenderApi;
  ContentDanmakuRenderer: ContentDanmakuRendererApi;
  ContentDanmakuSources: ContentDanmakuSourcesApi;
  ContentYouTubeDanmaku: ContentYouTubeDanmakuApi;
  bilibiliDanmakuConfig: BilibiliDanmakuConfigApi;
  danmakuSettings: DanmakuSettingsApi;
  subtitleSettings: SubtitleSettingsApi;
  subtitleTranslationSettings: SubtitleTranslationSettingsApi;
  site: PipCompanionSiteUtils;
  util: PipCompanionUtil;
}

declare var PipCompanion: PipCompanionGlobal;
