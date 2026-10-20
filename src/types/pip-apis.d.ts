// 內容腳本、popup、選項頁共用的 API 形狀
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
  currentIndexKnown: boolean;
}

interface PipProgressMathApi {
  ratioAt(clientX: number, left: number, width: number): number | null;
  timeAt(ratio: number, duration: number): number;
  valueAt(ratio: number, max: number): number;
}

interface PlaylistRenderingApi {
  render(
    doc: Document,
    panel: HTMLElement,
    items: PlaylistItem[],
    currentIndex: number,
    currentIndexKnown: boolean,
    onSelect: (i: number) => void,
  ): HTMLButtonElement | null;
}

type PlaylistNextItemState = "available" | "unavailable" | "unknown";

interface ContentPlaylistApi {
  getPlaylist(): PlaylistInfo | null;
  hasPlaylist(): boolean;
  selectPlaylistItem(i: number, preparePlaybackState: () => void): void;
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
  selectPlaylistItem(i: number): void;
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
  getDanmakuMessages?(): DanmakuData[];
  loadAllDanmakuMessages?(): Promise<DanmakuData[]>;
  seekDanmakuJump?(seconds: number): void;
  getStoryboardFrame?(seconds: number): StoryboardFrame | null;
  resize(
    innerWidth: number,
    width: number,
    height: number,
  ): Promise<ResizePipResult>;
}

interface PipUiHandle {
  readonly video: HTMLVideoElement;
  setVideo(video: HTMLVideoElement): void;
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
  openDanmakuSearch?(): void;
  toggleDanmakuSearch?(): void;
  setDanmakuMessages?(messages: DanmakuData[], duration?: number): void;
  setDanmakuEnabled(enabled: boolean): void;
  setThumbnailPreviewEnabled(enabled: boolean): void;
  refreshSubtitleTracks(): void;
  refreshSubtitleTranslationPreferences(): void;
  refreshSubtitleTranslationLanguages(): void;
  refreshSubtitleTranslationServices(): void;
  applyControlsLayout?(config?: PlayerControlItemConfig[]): void;
}

interface SubtitleTranslationPanelElements {
  translationButton: HTMLButtonElement;
  translationPanel: HTMLElement;
  subtitlePrimaryRow: HTMLLabelElement;
  subtitlePrimaryText: HTMLSpanElement;
  subtitlePrimaryTrack: HTMLSelectElement;
  translationLanguageRow: HTMLLabelElement;
  translationModeRow: HTMLLabelElement;
  translationServiceLabel: Text;
  translationServiceHintIcon: HTMLSpanElement;
  translationServiceHintTooltip: HTMLDivElement;
  translationService: HTMLSelectElement;
  nativeSubtitleOption: HTMLOptionElement;
  translationEnabledText: HTMLSpanElement;
  translationEnabled: HTMLInputElement;
  subtitlesEnabledText: HTMLSpanElement;
  subtitlesEnabled: HTMLInputElement;
  translationModeText: HTMLSpanElement;
  translationMode: HTMLSelectElement;
  translationLanguageText: HTMLSpanElement;
  translationLanguage: HTMLSelectElement;
  subtitleTranslationLanguages: SubtitleTranslationLanguageOption[];
  preferNativeRow: HTMLLabelElement;
  preferNativeText: HTMLSpanElement;
  preferNative: HTMLInputElement;
}

interface PlaybackControlsElements {
  speedButton: HTMLButtonElement;
  timeGroup: HTMLSpanElement;
  timeCurrent: HTMLInputElement;
  timeDuration: HTMLSpanElement;
  progress: HTMLInputElement;
  progressMax: number;
  volumeControl: HTMLDivElement;
  volumeButton: HTMLButtonElement;
  volumePath: Element;
  volumeValue: HTMLInputElement;
  volumeSlider: HTMLInputElement;
  speedControl: HTMLDivElement;
  speedSlider: HTMLInputElement;
}

interface PlaybackControlsApi {
  create(
    doc: Document,
    translate: (key: string, substitutions?: string | string[]) => string,
    makeButton: (
      action: string,
      label: string,
      ariaLabel: string,
    ) => HTMLButtonElement,
    volumeIconPath: string,
  ): PlaybackControlsElements;
}

interface DanmakuInputPanelApi {
  create(
    doc: Document,
    t: (key: string) => string,
    options: {
      canSend: boolean;
      makeButton(
        action: string,
        label: string,
        ariaLabel: string,
      ): HTMLButtonElement;
    },
  ): {
    toggle: HTMLButtonElement;
    panel: HTMLFormElement;
    input: HTMLInputElement;
    count: HTMLSpanElement;
    submit: HTMLButtonElement;
    status: HTMLDivElement;
  };
}

interface SubtitleTranslationPanelApi {
  create(
    doc: Document,
    translate: (key: string) => string,
  ): SubtitleTranslationPanelElements;
}

interface PipEventScope {
  listen(
    target: EventTarget,
    type: string,
    listener: (e: any) => unknown,
    options?: boolean | AddEventListenerOptions,
  ): void;
  setTimeout(handler: () => void, timeout: number): number;
  clearTimeout(timer: number): void;
  dispose(): void;
}

interface PipEventScopeApi {
  create(win: Window): PipEventScope;
}

interface PipTimeInputApi {
  create(options: {
    input: HTMLInputElement;
    eventScope: PipEventScope;
    parseTime(value: string): number | null;
    getVideo(): HTMLVideoElement | null;
    formatTime(seconds: number): string;
    seek(video: HTMLVideoElement, targetSeconds: number): void;
    showInvalid(): void;
  }): {
    render(): void;
  };
}

interface PipPlaylistPanelApi {
  create(options: {
    document: Document;
    window: Window;
    eventScope: PipEventScope;
    button: HTMLButtonElement;
    panel: HTMLElement;
    getPlaylist(): PlaylistInfo | null;
    selectItem(i: number): void;
    close(): void;
  }): {
    render(): void;
  };
}

interface PipRangeControlsApi {
  create(options: {
    eventScope: PipEventScope;
    volumeSlider: HTMLInputElement;
    speedSlider: HTMLInputElement;
    setVolume(volume: number, enabled: boolean): void;
    getVideo(): HTMLVideoElement | null;
    cancelNextPlaybackRestore(): void;
    update(): void;
    showSpeedFeedback(): void;
  }): void;
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

interface SubtitleLineFitApi {
  calculate(
    naturalWidth: number,
    availableWidth: number,
    minimumScale: number,
  ): { scale: number; needsWrapping: boolean };
}

interface SubtitleFittingApi {
  fit(subtitle: HTMLElement, minimumScale: number): void;
}

interface SubtitleStyleStorageApi {
  normalize(
    stored: unknown,
    defaults: SubtitleStyleSettings,
  ): { style: SubtitleStyleSettings; changed: boolean };
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
  applyLayout(el: HTMLElement, settings: SubtitleLayoutSettings): void;
  apply(el: HTMLElement, settings: SubtitleStyleSettings): void;
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
interface TranslationLanguageOptionData {
  value: string;
  label: string;
  disabled?: boolean;
  selected?: boolean;
}

interface TranslationLanguageOptionsApi {
  nativeTracks(
    tracks: SubtitleTrackOption[],
    selectedTrack: string,
    noTracksLabel: string,
    chooseTrackLabel: string,
  ): TranslationLanguageOptionData[];
  translationLanguages(
    languages: SubtitleTranslationLanguageOption[],
    selectedLanguage: string,
    getLanguageLabel: (code: string) => string,
  ): TranslationLanguageOptionData[];
}

interface SubtitleLanguageTagsApi {
  normalize(code: string): string;
  normalizeSubtitleLanguage(language: string): string;
  matchesSubtitleLanguages(left: string, right: string): boolean;
  matches(left: string, right: string): boolean;
  isValid(code: string): boolean;
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
  getMessages?(): DanmakuData[];
  loadAllMessages?(): Promise<DanmakuData[]>;
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
  isKnownExtensionMessageType(value: unknown): value is ExtensionMessageType;
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
  findVideo(
    includeDeep?: boolean,
    forceDeep?: boolean,
  ): HTMLVideoElement | null;
  isPreviewVideo(el: Element): boolean;
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
    showFeedback(msg: string): void;
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
  selectPlaylistItem(i: number): void;
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
  closePiP(
    closeWindow: boolean,
    onlyIfPaused?: boolean,
    pausePlayback?: boolean,
  ): Promise<void>;
  closePiPIfPaused(preservePlayback?: boolean): Promise<boolean>;
  getActivePipSource(): {
    video: HTMLVideoElement;
    ownerDocument: Document;
    parent: Node | null;
  } | null;
  handoffNativePipVideo(video: HTMLVideoElement): Promise<void>;
  isPipOpen(): boolean;
  isPipPlaying(): boolean;
  isPipVideoStalled(): boolean;
  recoverStalledPipVideo(): boolean;
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

type ShortcutInputResult =
  | { type: "cancel" }
  | { type: "ignore" }
  | {
      type: "status";
      message: string;
      parameter?: string;
      error?: boolean;
    }
  | { type: "shortcut"; shortcut: Shortcut };

interface ShortcutInputApi {
  fromKeyboard(
    e: KeyboardEvent,
    key: ShortcutKey,
    platform: string,
    hasMetaModifier: (e: KeyboardEvent) => boolean,
  ): ShortcutInputResult;
  fromWheel(e: WheelEvent, platform: string): ShortcutInputResult;
}

interface LocalizedMarkupApi {
  create(doc: Document, translate: (key: string) => string): () => void;
}

interface DanmakuStyleOptionsApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: DanmakuSettingsApi;
    t: (key: string, substitutions?: string | string[]) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): {
    render(): void;
    setControlsDisabled(disabled: boolean): void;
    load(): Promise<void>;
    handleStorageChange(change: chrome.storage.StorageChange | undefined): void;
  };
}

interface ExtraBilibiliSettingsApi {
  create(options: {
    enabled: HTMLInputElement;
    url: HTMLInputElement;
    offset: HTMLInputElement;
    offsetError: HTMLElement;
    urlHint: HTMLElement;
    status: HTMLElement;
    switchConfirm: HTMLElement;
    switchConfirmYes: HTMLButtonElement;
    switchConfirmNo: HTMLButtonElement;
    util: PipCompanionUtil;
    storage: StorageAreaAdapter;
    t: (key: string, substitutions?: string | string[]) => string;
  }): void;
}

interface OptionsShortcutSettingsApi {
  create(options: {
    storage: StorageAreaAdapter;
    util: PipCompanionUtil;
    shortcutInput: ShortcutInputApi;
    t: (key: string, substitutions?: string | string[]) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): {
    render(): void;
    load(): Promise<void>;
    handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }): void;
  };
}

interface SubtitleStyleStoreApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: SubtitleSettingsApi;
    t: (key: string) => string;
    showStatus: (msg: string, err?: boolean) => void;
    onChange: () => void;
  }): {
    readonly styles: Record<SubtitleStyleTarget, SubtitleStyleSettings>;
    readonly layout: SubtitleLayoutSettings;
    updateStyle(target: SubtitleStyleTarget, value: unknown): void;
    updateLayout(value: unknown): void;
    saveStyle(target: SubtitleStyleTarget, immediate?: boolean): void;
    saveLayout(immediate?: boolean): void;
    loadStyles(): Promise<void>;
    loadLayout(): Promise<void>;
    handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }): void;
  };
}

interface OptionsSubtitleStyleOptionsApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: SubtitleSettingsApi;
    t: (key: string) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): {
    render(): void;
    setControlsDisabled(): void;
    load(): void;
    handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }): void;
  };
}

interface PopupSubtitleStyleOptionsApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: SubtitleSettingsApi;
    t: (key: string) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): {
    render(): void;
    setControlsDisabled(disabled: boolean): void;
    load(): Promise<void>;
    handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }): void;
  };
}

interface PopupSettingsNavigationApi {
  create(doc: Document): {
    setView(view: "menu" | "danmaku" | "subtitle" | "extra"): void;
  };
}

interface SubtitleTranslationOptionsApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: SubtitleTranslationSettingsApi;
    configApi: SubtitleTranslationConfigApi;
    t: (key: string) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): {
    render(): void;
    update(value: unknown): void;
    load(): Promise<void>;
  };
}

interface RuntimeMessageDispatcher {
  addListener(
    types: ExtensionMessageType | readonly ExtensionMessageType[],
    handler: (
      msg: unknown,
      sender: chrome.runtime.MessageSender,
      sendResponse: (res?: unknown) => void,
    ) => boolean | void | Promise<boolean | void>,
  ): void;
}

interface RuntimeMessageDispatcherFactory {
  (
    register: (
      listener: (
        msg: unknown,
        sender: chrome.runtime.MessageSender,
        sendResponse: (res?: unknown) => void,
      ) => boolean | void,
    ) => void,
    authorize?: (
      msg: Record<string, unknown>,
      sender: chrome.runtime.MessageSender,
    ) => boolean,
  ): RuntimeMessageDispatcher;
}

type PlayerControlId =
  | "danmaku-send"
  | "play"
  | "next"
  | "time"
  | "progress"
  | "volume"
  | "speed"
  | "translation"
  | "playlist"
  | "danmaku-search";

interface PlayerControlItemConfig {
  id: PlayerControlId;
  visible: boolean;
}

interface PlayerControlsSettingsApi {
  STORAGE_KEY: string;
  CONTROL_IDS: readonly PlayerControlId[];
  DEFAULT_CONTROLS_CONFIG: readonly PlayerControlItemConfig[];
  normalize(raw: unknown): PlayerControlItemConfig[];
  getItemName(id: PlayerControlId, t: (key: string) => string): string;
}

interface PlayerControlsOptionsController {
  load(): Promise<void>;
  render(): void;
  handleStorageChange(change: chrome.storage.StorageChange | undefined): void;
}

interface PlayerControlsOptionsApi {
  create(options: {
    storage: StorageAreaAdapter;
    settings: PlayerControlsSettingsApi;
    t: (key: string, substitutions?: string | string[]) => string;
    showStatus: (msg: string, err?: boolean) => void;
  }): PlayerControlsOptionsController;
}

interface PipCompanionGlobal {
  playerControlsSettings: PlayerControlsSettingsApi;
  optionsPlayerControlsOptions: PlayerControlsOptionsApi;
  runtimeMessages: RuntimeMessageDispatcher;
  createRuntimeMessageDispatcher: RuntimeMessageDispatcherFactory;
  locales: Record<"en" | "zh_TW" | "zh_CN", Record<string, LocaleMessage>>;
  localizedMarkup: LocalizedMarkupApi;
  shortcutInput: ShortcutInputApi;
  subtitleStyleStorage: SubtitleStyleStorageApi;
  subtitleStyleStore: SubtitleStyleStoreApi;
  subtitleFitting: SubtitleFittingApi;
  subtitleLineFit: SubtitleLineFitApi;
  storage: {
    local: StorageAreaAdapter;
    session: StorageAreaAdapter;
  };
  customSelect: CustomSelectApi;
  PipAudio: PipAudioApi;
  PipUI: PipUiApi;
  PipEventScope: PipEventScopeApi;
  pipTimeInput: PipTimeInputApi;
  pipPlaylistPanel: PipPlaylistPanelApi;
  pipRangeControls: PipRangeControlsApi;
  PipStyles: { get(): string[] };
  playlistRendering: PlaylistRenderingApi;
  pipProgressMath: PipProgressMathApi;
  translationLanguageOptions: TranslationLanguageOptionsApi;
  subtitleTranslationPanel: SubtitleTranslationPanelApi;
  danmakuInputPanel: DanmakuInputPanelApi;
  danmakuSearchPanel: DanmakuSearchPanelApi;
  playbackControls: PlaybackControlsApi;
  ContentVideo: ContentVideoApi;
  ContentPlatform: ContentPlatformApi;
  ContentSubtitles: ContentSubtitlesApi;
  BilibiliSubtitles: typeof bilibiliSubtitles;
  NativeSecondarySubtitleTrack: NativeSecondarySubtitleTrackApi;
  standardTextTrack: StandardTextTrackProvider;
  subtitleTrackValidation: SubtitleTrackValidationApi;
  subtitleTrackOptions: SubtitleTrackOptionsApi;
  subtitleCueData: SubtitleCueDataApi;
  subtitleRemoteRequests: SubtitleRemoteRequestsApi;
  subtitleClock: SubtitleClockApi;
  nativeSubtitleModes: NativeSubtitleModesApi;
  subtitleFitController: SubtitleFitControllerApi;
  subtitleRendering: SubtitleRenderingApi;
  popupSubtitleStyleRendering: PopupSubtitleStyleRenderingApi;
  popupSubtitleStyleOptions: PopupSubtitleStyleOptionsApi;
  optionsSubtitleStyleOptions: OptionsSubtitleStyleOptionsApi;
  optionsShortcutSettings: OptionsShortcutSettingsApi;
  danmakuStyleOptions: DanmakuStyleOptionsApi;
  settingsNavigation: PopupSettingsNavigationApi;
  subtitleTranslationOptions: SubtitleTranslationOptionsApi;
  extraBilibiliSourceConfig: ExtraBilibiliSourceConfigApi;
  extraBilibiliForm: ExtraBilibiliFormApi;
  extraBilibiliSettings: ExtraBilibiliSettingsApi;
  danmakuStyleRendering: DanmakuStyleRenderingApi;
  subtitleLanguageTags: SubtitleLanguageTagsApi;
  genericSubtitleOverlayDetection: GenericSubtitleOverlayDetectionApi;
  subtitleStyleRendering: SubtitleStyleRenderingApi;
  shortcutSettings: ShortcutSettingsApi;
  subtitleTranslationConfig: SubtitleTranslationConfigApi;
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
  ContentDanmakuJump: ContentDanmakuJumpApi;
  ContentDanmakuSearch: {
    getMessages(): DanmakuData[];
    loadAllMessages(): Promise<DanmakuData[]>;
  };
  ContentYouTubeDanmaku: ContentYouTubeDanmakuApi;
  bilibiliDanmakuConfig: BilibiliDanmakuConfigApi;
  danmakuJump: DanmakuJumpApi;
  danmakuSearch: DanmakuSearchApi;
  danmakuSettings: DanmakuSettingsApi;
  subtitleSettings: SubtitleSettingsApi;
  subtitleTranslationSettings: SubtitleTranslationSettingsApi;
  isValidExtraDanmakuSourceUrl(value: string): boolean;
  site: PipCompanionSiteUtils;
  util: PipCompanionUtil;
}

declare var PipCompanion: PipCompanionGlobal;
