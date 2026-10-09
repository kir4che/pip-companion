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
  beginSeekRestore(): void;
  endSeekRestore(): void;
  emit(data: DanmakuData, options?: DanmakuEmitOptions): void;
  destroy(): void;
}

interface ContentDanmakuRendererDependencies {
  getStyle(): DanmakuStyleSettings;
  isVisible(): boolean;
}

interface ContentDanmakuRendererApi {
  create(
    container: Element,
    dependencies: ContentDanmakuRendererDependencies,
    options?: { isPip?: boolean },
  ): DanmakuRendererHandle;
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
}

interface ContentDanmakuSourcesApi {
  parseYouTubeMessage(node: Node | null): DanmakuData | null;
  create(
    dependencies: ContentDanmakuSourcesDependencies,
  ): ContentDanmakuSourcesController;
}

interface ContentYouTubeDanmakuDependencies {
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
  destroy(): void;
}

interface ContentYouTubeDanmakuApi {
  create(
    dependencies: ContentYouTubeDanmakuDependencies,
  ): ContentYouTubeDanmakuController;
}

// 讓其他模組使用的頁面彈幕操作
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
