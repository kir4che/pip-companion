interface DanmakuPartText {
  type: "text";
  text: string;
}

interface DanmakuPartImage {
  type: "image";
  src: string;
  alt: string;
}

type DanmakuPart = DanmakuPartText | DanmakuPartImage;
type DanmakuType = "right" | "top" | "bottom";

interface DanmakuData {
  type?: DanmakuType;
  text?: string;
  parts?: DanmakuPart[];
  color?: string;
  isSuperChat?: boolean;
  bgColor?: string;
  amount?: string;
  author?: string;
  messageId?: string;
  id?: string;
  replayTime?: number | null;
  advanced?: BilibiliAdvancedDanmaku;
}

interface DanmakuEmitOptions {
  restore?: boolean;
  elapsed?: number;
}

interface DanmakuItemElement extends HTMLSpanElement {
  danmakuEndTime?: number;
  danmakuOpacityAnimation?: Animation;
}

interface DanmakuPendingItem {
  data: DanmakuData;
  queuedAt: number;
}

interface LaneOccupancy {
  left: number;
  right: number;
}

interface ReplayMessageEntry {
  data: DanmakuData;
  replayTime: number;
  emitted: boolean;
}

interface BilibiliAdvancedDanmaku {
  text: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  sourceWidth: number;
  sourceHeight: number;
  fontSize: number;
  durationMs: number;
  alphaStart: number;
  alphaEnd: number;
  rotateZ: number;
  rotateY: number;
}

type DanmakuFontFamily =
  | "default"
  | "sansSerif"
  | "serif"
  | "monospace"
  | "arial"
  | "notoSansTC"
  | "microsoftJhengHei"
  | "song"
  | "fangSong"
  | "kai";

interface DanmakuStyleSettings {
  fontFamily: DanmakuFontFamily;
  fontSizeScale: number;
  maxFontSize: number;
  opacity: number;
  speedScale: number;
  fontWeight: number;
  displayArea: number;
}

interface DanmakuRendererHandle {
  container: Element;
  overlay: HTMLElement | null;
  duration: number;
  updateStyle(): void;
  updateVisibility(): void;
  setPaused(paused: boolean): void;
  setPlaybackRate(rate: number): void;
  clear(): void;
  purgeBlocked?(predicate: (text?: string | null) => boolean): void;
  beginSeekRestore(): void;
  endSeekRestore(): void;
  emit(data: DanmakuData, options?: DanmakuEmitOptions): void;
  destroy(): void;
}

interface ContentDanmakuRendererDependencies {
  getStyle(): DanmakuStyleSettings;
  isVisible(): boolean;
  isBlocked?(text?: string | null): boolean;
}

interface ContentDanmakuRendererApi {
  create(
    container: Element,
    dependencies: ContentDanmakuRendererDependencies,
    options?: { isPip?: boolean },
  ): DanmakuRendererHandle;
}

interface ContentExtraBilibiliDanmakuDependencies {
  clear?(): void;
  isVisible(): boolean;
  isSourceAvailable(video: HTMLVideoElement | null): boolean;
  broadcast(data: DanmakuData, options?: DanmakuEmitOptions): void;
}

interface ContentExtraBilibiliDanmakuApi {
  create(dependencies: ContentExtraBilibiliDanmakuDependencies): {
    checkAndBind(video: HTMLVideoElement | null): void;
    getSource(): {
      enabled: boolean;
      url: string;
      offsetSeconds: number;
      available: boolean;
      error?: string | null;
      loading?: boolean;
      errorRevision?: number;
    };
    setSource(value: unknown): void;
    getMessages?(): DanmakuData[];
    loadAllMessages?(): Promise<DanmakuData[]>;
    supportsHeatPeaks?(): boolean;
  };
}

interface ContentDanmakuSourcesDependencies {
  isSettingsLoaded(): boolean;
  isVisible(): boolean;
  broadcast(data: DanmakuData, options?: DanmakuEmitOptions): void;
  clear(): void;
}

interface ContentDanmakuSourcesController {
  checkAndBind(): void;
  destroy(): void;
  getMessages?(): DanmakuData[];
}

interface ContentDanmakuSourcesApi {
  parseYouTubeMessage(node: Node | null, consume?: boolean): DanmakuData | null;
  create(
    dependencies: ContentDanmakuSourcesDependencies,
  ): ContentDanmakuSourcesController;
}

interface ContentYouTubeDanmakuDependencies {
  relay?: boolean;
  lateToleranceSeconds: number;
  restoreWindowSeconds: number;
  isSettingsLoaded(): boolean;
  isVisible(): boolean;
  getSourceVideo(): HTMLVideoElement | null;
  getMainRenderer(): DanmakuRendererHandle | null;
  getPipRenderer(): DanmakuRendererHandle | null;
  ensureMainRenderer(): DanmakuRendererHandle | null;
  broadcast(data: DanmakuData, options?: DanmakuEmitOptions): void;
  clear(): void;
}

interface ContentYouTubeDanmakuController {
  checkAndBind(): void;
  isReady(): boolean;
  isLive(): boolean;
  setRelayClock(clock: YouTubeChatClock): void;
  destroy(): void;
  getMessages?(): DanmakuData[];
}

interface ContentYouTubeDanmakuApi {
  create(
    dependencies: ContentYouTubeDanmakuDependencies,
  ): ContentYouTubeDanmakuController;
}

interface DanmakuSearchResult {
  time: number;
  text: string;
  color?: string;
  count?: number;
}

interface DanmakuHeatPeak {
  time: number;
  count: number;
  representativeText: string;
}

interface DanmakuSearchApi {
  searchDanmaku(
    messages: DanmakuData[],
    query: string,
    options?: { maxResults?: number },
  ): DanmakuSearchResult[];
  calculateDanmakuHeatPeaks(
    messages: DanmakuData[],
    duration?: number,
    options?: {
      bucketSeconds?: number;
      topN?: number;
      minDistanceSeconds?: number;
    },
  ): DanmakuHeatPeak[];
}

interface DanmakuSearchPanelElements {
  toggle: HTMLButtonElement;
  panel: HTMLElement;
  input: HTMLInputElement;
  clearButton: HTMLButtonElement;
  closeButton: HTMLButtonElement;
  heatSection: HTMLElement;
  heatList: HTMLElement;
  heatStatus: HTMLElement;
  resultsSection: HTMLElement;
  resultsCount: HTMLElement;
  resultsList: HTMLElement;
  emptyState: HTMLElement;
  focus(): void;
  open(): void;
  close(): void;
  togglePanel(): void;
  isOpen(): boolean;
  setMessages(messages: DanmakuData[], duration?: number): void;
}

interface DanmakuSearchPanelApi {
  create(
    doc: Document,
    t: (key: string, substitutions?: string | string[]) => string,
    options: {
      makeButton(
        action: string,
        label: string,
        ariaLabel: string,
      ): HTMLButtonElement;
      onSeek(seconds: number): void;
      getMessages?: (() => DanmakuData[]) | undefined;
      loadAllMessages?: (() => Promise<DanmakuData[]>) | undefined;
      getDuration?: (() => number | undefined) | undefined;
      shortcutHint?: string | undefined;
      supportsHeatPeaks?: boolean | (() => boolean) | undefined;
    },
  ): DanmakuSearchPanelElements;
}

interface DanmakuBlocklistApi {
  STORAGE_KEY: string;
  MAX_BLOCKLIST_ITEMS: number;
  MAX_PATTERN_LENGTH: number;
  normalize(raw: unknown): string[];
  compileRule(rule: string): ((text: string) => boolean) | null;
  createFilter(rules: readonly string[]): (text?: string | null) => boolean;
}

interface DanmakuBlocklistUiOptions {
  countElement?: HTMLElement | null;
}

interface DanmakuBlocklistUiInstance {
  reload(): void;
}

interface DanmakuBlocklistUiApi {
  create(
    container: HTMLElement,
    t: (key: string, substitutions?: string | string[]) => string,
    options?: DanmakuBlocklistUiOptions,
  ): DanmakuBlocklistUiInstance;
}

interface DanmakuJumpApi {
  parseJumpSeconds(text?: string | null): number | null;
}

interface ContentDanmakuJumpApi {
  handle(data?: DanmakuData | null): void;
  seek(seconds: number): void;
  clearDanmaku?(): void;
}

// 讓其他模組使用的頁面彈幕操作
declare function toggleDanmaku(forceState?: boolean): boolean;
declare function clearDanmaku(): void;
declare function initDanmakuInPip(win: Window, video: HTMLVideoElement): void;
declare function destroyDanmakuInPip(): void;
declare function setDanmakuPaused(paused: boolean): void;
declare function setDanmakuPlaybackRate(rate: number): void;
declare function isDanmakuEnabled(): boolean;
declare function checkAndBindDanmakuChat(): void;
declare function checkAndBindBilibiliDanmaku(
  video: HTMLVideoElement | null,
): void;
declare function checkAndBindExtraBilibiliDanmaku(
  video: HTMLVideoElement | null,
): void;
