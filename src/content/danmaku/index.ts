"use strict";

const DANMAKU_STORAGE_KEY = "danmakuEnabled";
const DANMAKU_VISIBILITY_STORAGE_KEY = "danmakuVisible";
const DANMAKU_STYLE_STORAGE_KEY =
  globalThis.PipCompanion.danmakuSettings.STORAGE_KEY;
const DANMAKU_IS_YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
const DANMAKU_IS_BILIBILI = /(^|\.)bilibili\.com$/.test(location.hostname);
const DANMAKU_IS_BILIBILI_LIVE = location.hostname === "live.bilibili.com";
const DANMAKU_IS_TWITCH = /(^|\.)twitch\.tv$/.test(location.hostname);
const DANMAKU_IS_BAHAMUT = location.hostname === "ani.gamer.com.tw";
const DANMAKU_IS_SUPPORTED_SITE =
  DANMAKU_IS_YOUTUBE ||
  DANMAKU_IS_BILIBILI ||
  DANMAKU_IS_TWITCH ||
  DANMAKU_IS_BAHAMUT;
const REPLAY_LATE_TOLERANCE_SECONDS = 0.5;
const REPLAY_RESTORE_WINDOW_SECONDS = 5;
const MAX_SCROLL_DANMAKU_RESTORE_SECONDS = 3;
const MAX_FIXED_DANMAKU_RESTORE_SECONDS = 2;
// 依解析器的 600 秒上限及最慢 50% 速度設定計算
const MAX_ADVANCED_DANMAKU_RESTORE_SECONDS = 1200;

let danmakuEnabled = false;
let danmakuVisible = true;
let danmakuSettingsLoaded = false;
let danmakuEnabledChangedDuringLoad = false;
let danmakuVisibilityChangedDuringLoad = false;
let danmakuStyleChangedDuringLoad = false;
let danmakuStyle = globalThis.PipCompanion.danmakuSettings.normalize(null);
let danmakuPlaybackRate = 1;
let danmakuPaused = false;
let mainDanmakuRenderer: DanmakuRendererHandle | null = null;
let pipDanmakuRenderer: DanmakuRendererHandle | null = null;

function updateAllDanmakuStyles(): void {
  mainDanmakuRenderer?.updateStyle();
  pipDanmakuRenderer?.updateStyle();
}

function updateAllDanmakuVisibility(): void {
  mainDanmakuRenderer?.updateVisibility();
  pipDanmakuRenderer?.updateVisibility();

  if (DANMAKU_IS_YOUTUBE) checkAndBindDanmakuChat();
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE)
    bilibiliDanmakuController.checkAndBind(null);
  if (DANMAKU_IS_TWITCH || DANMAKU_IS_BAHAMUT || DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindSiteDanmaku();
}

function toggleDanmaku(forceState?: boolean): boolean {
  if (!DANMAKU_IS_SUPPORTED_SITE || !danmakuEnabled) return false;
  if (!danmakuSettingsLoaded) danmakuVisibilityChangedDuringLoad = true;
  danmakuVisible =
    typeof forceState === "boolean" ? forceState : !danmakuVisible;
  try {
    chrome.storage.local.set({
      [DANMAKU_VISIBILITY_STORAGE_KEY]: danmakuVisible,
    });
  } catch {}
  updateAllDanmakuVisibility();
  return danmakuVisible;
}

function isDanmakuEnabled(): boolean {
  return danmakuEnabled;
}

function isDanmakuVisible(): boolean {
  return danmakuEnabled && danmakuVisible;
}

const bilibiliDanmakuController =
  globalThis.PipCompanion.ContentBilibiliDanmaku.create({
    getRenderer: () => pipDanmakuRenderer,
    isSettingsLoaded: () => danmakuSettingsLoaded,
    isVisible: isDanmakuVisible,
    getSpeedScale: () => danmakuStyle.speedScale,
    lateToleranceSeconds: REPLAY_LATE_TOLERANCE_SECONDS,
    restoreWindowSeconds: REPLAY_RESTORE_WINDOW_SECONDS,
    maxScrollRestoreSeconds: MAX_SCROLL_DANMAKU_RESTORE_SECONDS,
    maxFixedRestoreSeconds: MAX_FIXED_DANMAKU_RESTORE_SECONDS,
    maxAdvancedRestoreSeconds: MAX_ADVANCED_DANMAKU_RESTORE_SECONDS,
  });

function checkAndBindBilibiliDanmaku(video: HTMLVideoElement | null): void {
  bilibiliDanmakuController.checkAndBind(video);
}

const TWITCH_MAIN_VIDEO_SELECTORS = [
  '[data-a-target="video-player"] video',
  ".video-player video",
  ".video-player__container video",
  ".video-player__default-player video",
];

function getMainPlayer(): HTMLElement | null {
  if (DANMAKU_IS_TWITCH) {
    for (const selector of TWITCH_MAIN_VIDEO_SELECTORS) {
      const video = document.querySelector<HTMLVideoElement>(selector);
      if (!video) continue;
      return (
        video.closest<HTMLElement>(
          '.video-player__container, .video-player, [data-a-target="video-player"]',
        ) || video.parentElement
      );
    }
    return null;
  }
  return document.querySelector<HTMLElement>("#movie_player");
}

function ensureMainRenderer(): DanmakuRendererHandle | null {
  const player = getMainPlayer();
  if (!player) return null;
  if (
    !mainDanmakuRenderer ||
    mainDanmakuRenderer.container !== player ||
    !mainDanmakuRenderer.overlay?.isConnected
  ) {
    mainDanmakuRenderer?.destroy();
    mainDanmakuRenderer = globalThis.PipCompanion.ContentDanmakuRenderer.create(
      player,
      { getStyle: () => danmakuStyle, isVisible: isDanmakuVisible },
      { isPip: false },
    );
    mainDanmakuRenderer.setPlaybackRate(danmakuPlaybackRate);
    mainDanmakuRenderer.setPaused(danmakuPaused);
  }
  return mainDanmakuRenderer;
}

function initDanmakuInPip(
  win: Window | null,
  video: HTMLVideoElement | null,
): void {
  if (!DANMAKU_IS_SUPPORTED_SITE || !win || win.closed) return;
  const screen =
    win.document.querySelector<HTMLElement>(".screen") || win.document.body;
  if (!screen) return;
  pipDanmakuRenderer?.destroy();
  pipDanmakuRenderer = globalThis.PipCompanion.ContentDanmakuRenderer.create(
    screen,
    { getStyle: () => danmakuStyle, isVisible: isDanmakuVisible },
    { isPip: true },
  );
  pipDanmakuRenderer.updateVisibility();
  pipDanmakuRenderer.setPlaybackRate(
    video?.playbackRate ?? danmakuPlaybackRate,
  );
  pipDanmakuRenderer.setPaused(video?.paused ?? danmakuPaused);
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE) {
    bilibiliDanmakuController.setSourceVideo(video);
    bilibiliDanmakuController.checkAndBind(video);
  }
  if (DANMAKU_IS_TWITCH || DANMAKU_IS_BAHAMUT || DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindSiteDanmaku();
}

function destroyDanmakuInPip(): void {
  bilibiliDanmakuController.destroy();
  pipDanmakuRenderer?.destroy();
  pipDanmakuRenderer = null;
}

function setDanmakuPaused(paused: boolean): void {
  danmakuPaused = paused;
  mainDanmakuRenderer?.setPaused(paused);
  pipDanmakuRenderer?.setPaused(paused);
}

function setDanmakuPlaybackRate(rate: number): void {
  danmakuPlaybackRate = Number.isFinite(rate) && rate > 0 ? rate : 1;
  mainDanmakuRenderer?.setPlaybackRate(danmakuPlaybackRate);
  pipDanmakuRenderer?.setPlaybackRate(danmakuPlaybackRate);
}

function broadcastDanmaku(
  data?: DanmakuData | null,
  options: DanmakuEmitOptions = {},
): void {
  if (!data || !danmakuSettingsLoaded || !isDanmakuVisible()) return;
  ensureMainRenderer();
  mainDanmakuRenderer?.emit(data, options);
  pipDanmakuRenderer?.emit(data, options);
}

function clearDanmaku(): void {
  mainDanmakuRenderer?.clear();
  pipDanmakuRenderer?.clear();
}

const danmakuSourcesController =
  globalThis.PipCompanion.ContentDanmakuSources.create({
    isSettingsLoaded: () => danmakuSettingsLoaded,
    isVisible: isDanmakuVisible,
    broadcast: broadcastDanmaku,
    clear: clearDanmaku,
  });
const youtubeDanmakuController =
  globalThis.PipCompanion.ContentYouTubeDanmaku.create({
    lateToleranceSeconds: REPLAY_LATE_TOLERANCE_SECONDS,
    restoreWindowSeconds: REPLAY_RESTORE_WINDOW_SECONDS,
    isSettingsLoaded: () => danmakuSettingsLoaded,
    isVisible: isDanmakuVisible,
    getSourceVideo: () => state.sourceVideo,
    getMainRenderer: () => mainDanmakuRenderer,
    getPipRenderer: () => pipDanmakuRenderer,
    ensureMainRenderer,
    broadcast: broadcastDanmaku,
    clear: clearDanmaku,
  });

function checkAndBindDanmakuChat(): void {
  youtubeDanmakuController.checkAndBind();
}

function checkAndBindSiteDanmaku(): void {
  danmakuSourcesController.checkAndBind();
}

if (DANMAKU_IS_SUPPORTED_SITE) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName !== "local") return;
        if (changes[DANMAKU_STYLE_STORAGE_KEY]) {
          if (!danmakuSettingsLoaded) danmakuStyleChangedDuringLoad = true;
          danmakuStyle = globalThis.PipCompanion.danmakuSettings.normalize(
            changes[DANMAKU_STYLE_STORAGE_KEY].newValue,
          );
          updateAllDanmakuStyles();
        }
        if (changes[DANMAKU_STORAGE_KEY]) {
          if (!danmakuSettingsLoaded) danmakuEnabledChangedDuringLoad = true;
          const change = changes[DANMAKU_STORAGE_KEY];
          const val =
            change && typeof change === "object" && "newValue" in change
              ? change.newValue
              : change;
          danmakuEnabled = val === undefined ? true : Boolean(val);
          updateAllDanmakuVisibility();
        }
        if (changes[DANMAKU_VISIBILITY_STORAGE_KEY]) {
          if (!danmakuSettingsLoaded) danmakuVisibilityChangedDuringLoad = true;
          const change = changes[DANMAKU_VISIBILITY_STORAGE_KEY];
          const val =
            change && typeof change === "object" && "newValue" in change
              ? change.newValue
              : change;
          danmakuVisible = val === undefined ? true : Boolean(val);
          updateAllDanmakuVisibility();
        }
      });
    }

    chrome.storage.local.get(
      [
        DANMAKU_STORAGE_KEY,
        DANMAKU_VISIBILITY_STORAGE_KEY,
        DANMAKU_STYLE_STORAGE_KEY,
      ],
      (result) => {
        if (!danmakuEnabledChangedDuringLoad) {
          const storedValue = result?.[DANMAKU_STORAGE_KEY];
          danmakuEnabled =
            storedValue === undefined ? true : Boolean(storedValue);
        }
        if (!danmakuVisibilityChangedDuringLoad) {
          const storedVisibility = result?.[DANMAKU_VISIBILITY_STORAGE_KEY];
          danmakuVisible =
            storedVisibility === undefined ? true : Boolean(storedVisibility);
        }
        if (!danmakuStyleChangedDuringLoad)
          danmakuStyle = globalThis.PipCompanion.danmakuSettings.normalize(
            result?.[DANMAKU_STYLE_STORAGE_KEY],
          );
        danmakuSettingsLoaded = true;
        updateAllDanmakuStyles();
        updateAllDanmakuVisibility();
      },
    );
  } catch {
    danmakuEnabled = true;
    danmakuVisible = true;
    danmakuSettingsLoaded = true;
    updateAllDanmakuStyles();
    updateAllDanmakuVisibility();
  }
}

Object.assign(globalThis, {
  toggleDanmaku,
  initDanmakuInPip,
  destroyDanmakuInPip,
  setDanmakuPaused,
  setDanmakuPlaybackRate,
  isDanmakuEnabled,
  checkAndBindDanmakuChat,
  checkAndBindBilibiliDanmaku,
  checkAndBindSiteDanmaku,
  broadcastDanmaku,
});

if (DANMAKU_IS_YOUTUBE) {
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(checkAndBindDanmakuChat, 600);
  });

  checkAndBindDanmakuChat();
}
