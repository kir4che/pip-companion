"use strict";

const DANMAKU_STORAGE_KEY = "danmakuEnabled";
const DANMAKU_STYLE_STORAGE_KEY =
  globalThis.PipCompanion.danmakuSettings.STORAGE_KEY;
const DANMAKU_BLOCKLIST_STORAGE_KEY =
  globalThis.PipCompanion.danmakuBlocklist?.STORAGE_KEY ?? "danmakuBlocklist";
const danmakuSiteUtils = globalThis.PipCompanion.site;
const DANMAKU_IS_YOUTUBE = danmakuSiteUtils.isYouTubeHost(location.hostname);
const DANMAKU_IS_BILIBILI = danmakuSiteUtils.isBilibiliHost(location.hostname);
const DANMAKU_IS_BILIBILI_LIVE = danmakuSiteUtils.isBilibiliLiveHost(
  location.hostname,
);
const DANMAKU_IS_TWITCH = danmakuSiteUtils.isTwitchHost(location.hostname);
const DANMAKU_IS_BAHAMUT = danmakuSiteUtils.isBahamutHost(location.hostname);
const DANMAKU_IS_SUPPORTED_SITE =
  DANMAKU_IS_YOUTUBE ||
  DANMAKU_IS_BILIBILI ||
  DANMAKU_IS_TWITCH ||
  DANMAKU_IS_BAHAMUT;
const REPLAY_LATE_TOLERANCE_SECONDS = 5;
const REPLAY_RESTORE_WINDOW_SECONDS = 5;
const MAX_SCROLL_DANMAKU_RESTORE_SECONDS = 3;
const MAX_FIXED_DANMAKU_RESTORE_SECONDS = 2;
// 依解析器的 600 秒上限及最慢 50% 速度設定計算
const MAX_ADVANCED_DANMAKU_RESTORE_SECONDS = 1200;

let danmakuEnabled = true;
let danmakuVisible = true;
let danmakuSettingsLoaded = false;
let danmakuEnabledChangedDuringLoad = false;
let danmakuStyleChangedDuringLoad = false;
let danmakuStyle = globalThis.PipCompanion.danmakuSettings.normalize(null);
let danmakuBlocklist: string[] = [];
let isDanmakuBlocked: (text?: string | null) => boolean = () => false;
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
  checkAndBindExtraBilibiliDanmaku(state.sourceVideo);
}

function toggleDanmaku(forceState?: boolean): boolean {
  if (
    !DANMAKU_IS_SUPPORTED_SITE ||
    (!danmakuEnabled && typeof forceState !== "boolean")
  )
    return false;
  danmakuVisible =
    typeof forceState === "boolean" ? forceState : !danmakuVisible;
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
  if (DANMAKU_IS_BILIBILI)
    return document.querySelector<HTMLElement>(
      "#bilibili-player, .bpx-player, .bilibili-player",
    );
  if (DANMAKU_IS_YOUTUBE)
    return document.querySelector<HTMLElement>("#movie_player");
  const video =
    (state.sourceVideo?.ownerDocument === document
      ? state.sourceVideo
      : null) ?? globalThis.PipCompanion.ContentVideo.findVideo();
  if (!video || video.ownerDocument !== document) return null;
  const player = video.closest<HTMLElement>(
    "video-js, .video-js, [data-uia='player'], .watch-video, #ani_video, .anime_video_area",
  );
  const mainPlayer = player ?? video.parentElement ?? null;
  return mainPlayer && mainPlayer.ownerDocument === document
    ? mainPlayer
    : null;
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
      {
        getStyle: () => danmakuStyle,
        isVisible: isDanmakuVisible,
        isBlocked: (text) => isDanmakuBlocked(text),
      },
      { isPip: false },
    );
    mainDanmakuRenderer.setPlaybackRate(danmakuPlaybackRate);
    mainDanmakuRenderer.setPaused(danmakuPaused);
  }
  return mainDanmakuRenderer;
}

let pipVideoAbortController: AbortController | null = null;

function initDanmakuInPip(
  win: Window | null,
  video: HTMLVideoElement | null,
): void {
  if (!win || win.closed) return;
  const screen =
    win.document.querySelector<HTMLElement>(".screen") || win.document.body;
  if (!screen) return;
  pipDanmakuRenderer?.destroy();
  pipDanmakuRenderer = globalThis.PipCompanion.ContentDanmakuRenderer.create(
    screen,
    {
      getStyle: () => danmakuStyle,
      isVisible: isDanmakuVisible,
      isBlocked: (text) => isDanmakuBlocked(text),
    },
    { isPip: true },
  );
  pipDanmakuRenderer.updateVisibility();
  pipDanmakuRenderer.setPlaybackRate(
    video?.playbackRate ?? danmakuPlaybackRate,
  );
  pipDanmakuRenderer.setPaused(video?.paused ?? danmakuPaused);

  pipVideoAbortController?.abort();
  if (video) {
    pipVideoAbortController = new AbortController();
    const signal = pipVideoAbortController.signal;
    video.addEventListener("seeking", clearDanmaku, { signal });
    video.addEventListener("seeked", clearDanmaku, { signal });
  }

  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE) {
    bilibiliDanmakuController.setSourceVideo(video);
    bilibiliDanmakuController.checkAndBind(video);
  }
  if (DANMAKU_IS_YOUTUBE) checkAndBindDanmakuChat();
  if (DANMAKU_IS_TWITCH || DANMAKU_IS_BAHAMUT || DANMAKU_IS_BILIBILI_LIVE)
    checkAndBindSiteDanmaku();
}

function destroyDanmakuInPip(): void {
  pipVideoAbortController?.abort();
  pipVideoAbortController = null;
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
  if (
    !data ||
    !danmakuSettingsLoaded ||
    !isDanmakuVisible() ||
    isDanmakuBlocked(data.text)
  )
    return;
  const main = ensureMainRenderer();
  if (
    main &&
    main.container &&
    main.container !== pipDanmakuRenderer?.container &&
    main.container.ownerDocument === document
  ) {
    main.emit(data, options);
  }
  pipDanmakuRenderer?.emit(data, options);
}

// 冷卻時間用來擋掉主畫面與 PiP 重複發射、以及跳轉後補發的彈幕
const DANMAKU_JUMP_COOLDOWN_MS = 2000;
const DANMAKU_JUMP_MIN_DELTA_SECONDS = 1;
let lastDanmakuJumpAt = 0;

function handleDanmakuJump(data?: DanmakuData | null): void {
  // 彈幕停用或不顯示時，跳轉一併停用。
  if (
    !state.danmakuJumpEnabled ||
    !isDanmakuVisible() ||
    !data?.text ||
    isDanmakuBlocked(data.text)
  )
    return;
  const seconds = globalThis.PipCompanion.danmakuJump.parseJumpSeconds(
    data.text,
  );
  if (seconds === null) return;
  const video = state.sourceVideo;
  if (!video || !Number.isFinite(video.duration) || seconds >= video.duration)
    return;
  // 只往前跳：時間戳可能來自舊剪輯或亂喊，往回拉會打斷觀看；也順帶擋掉跳轉後補發的彈幕迴圈。
  if (seconds - video.currentTime < DANMAKU_JUMP_MIN_DELTA_SECONDS) return;
  const now = Date.now();
  if (now - lastDanmakuJumpAt < DANMAKU_JUMP_COOLDOWN_MS) return;
  lastDanmakuJumpAt = now;
  clearDanmaku();
  video.currentTime = seconds;
}

// 使用者手動點擊空降彈幕：不做冷卻與 1 秒門檻（明確的點擊意圖），但只擋無效目標
function seekDanmakuJump(seconds: number): void {
  const video = state.sourceVideo;
  if (
    !video ||
    !Number.isFinite(seconds) ||
    !Number.isFinite(video.duration) ||
    seconds >= video.duration
  )
    return;
  // 點擊後也進冷卻，避免來源補發的彈幕立刻觸發自動跳轉
  lastDanmakuJumpAt = Date.now();
  clearDanmaku();
  video.currentTime = seconds;
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
    getSourceVideo: () => state.sourceVideo,
  });
const extraBilibiliDanmakuController =
  globalThis.PipCompanion.ContentExtraBilibiliDanmaku.create({
    lateToleranceSeconds: REPLAY_LATE_TOLERANCE_SECONDS,
    clear: clearDanmaku,
    isVisible: isDanmakuVisible,
    isSourceAvailable: (video) =>
      !DANMAKU_IS_BAHAMUT &&
      !(
        DANMAKU_IS_BILIBILI_LIVE ||
        (!(DANMAKU_IS_YOUTUBE || DANMAKU_IS_TWITCH) &&
          (globalThis.PipCompanion.ContentPlayback?.isLiveStream?.(
            video ?? state.sourceVideo,
          ) ??
            false))
      ),
    broadcast: broadcastDanmaku,
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

function checkAndBindExtraBilibiliDanmaku(
  video: HTMLVideoElement | null,
): void {
  extraBilibiliDanmakuController.checkAndBind(video);
}

try {
  function applyDanmakuBlocklist(raw: unknown) {
    danmakuBlocklist =
      globalThis.PipCompanion.danmakuBlocklist?.normalize?.(raw) ?? [];
    isDanmakuBlocked =
      globalThis.PipCompanion.danmakuBlocklist?.createFilter?.(
        danmakuBlocklist,
      ) ?? (() => false);
    mainDanmakuRenderer?.purgeBlocked?.(isDanmakuBlocked);
    pipDanmakuRenderer?.purgeBlocked?.(isDanmakuBlocked);
  }

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
        const val = changes[DANMAKU_STORAGE_KEY].newValue;
        danmakuEnabled = val === undefined ? true : Boolean(val);
        updateAllDanmakuVisibility();
      }
      if (changes[DANMAKU_BLOCKLIST_STORAGE_KEY]) {
        applyDanmakuBlocklist(changes[DANMAKU_BLOCKLIST_STORAGE_KEY].newValue);
      }
    });
  }

  chrome.storage.local.get(
    [
      DANMAKU_STORAGE_KEY,
      DANMAKU_STYLE_STORAGE_KEY,
      DANMAKU_BLOCKLIST_STORAGE_KEY,
    ],
    (result) => {
      if (!danmakuEnabledChangedDuringLoad) {
        const storedValue = result?.[DANMAKU_STORAGE_KEY];
        danmakuEnabled =
          storedValue === undefined ? true : Boolean(storedValue);
      }
      if (!danmakuStyleChangedDuringLoad)
        danmakuStyle = globalThis.PipCompanion.danmakuSettings.normalize(
          result?.[DANMAKU_STYLE_STORAGE_KEY],
        );
      applyDanmakuBlocklist(result?.[DANMAKU_BLOCKLIST_STORAGE_KEY]);
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

globalThis.PipCompanion.ContentDanmakuJump = {
  handle: handleDanmakuJump,
  seek: seekDanmakuJump,
  clearDanmaku,
};

let bahamutFullMessages: DanmakuData[] | null = null;
let bahamutVideoSn: string | null = null;

async function loadBahamutDanmakuMessages(): Promise<DanmakuData[]> {
  const currentSn =
    new URL(location.href).searchParams.get("sn") ||
    (window as unknown as { animefun?: { videoSn?: string | number } })
      ?.animefun?.videoSn;
  const snStr = currentSn ? String(currentSn) : null;
  if (!snStr) return [];
  if (bahamutFullMessages && bahamutVideoSn === snStr)
    return bahamutFullMessages;
  try {
    const res: unknown = await chrome.runtime.sendMessage({
      type: "GET_BAHAMUT_DANMAKU",
      videoSn: snStr,
    } satisfies ExtensionMessage);
    if (
      globalThis.PipCompanion.util.isRecord(res) &&
      res.ok === true &&
      Array.isArray(res.messages)
    ) {
      bahamutVideoSn = snStr;
      bahamutFullMessages = res.messages;
      return bahamutFullMessages;
    }
  } catch {}
  return [];
}

function mergeExtraDanmakuMessages(base: DanmakuData[]): DanmakuData[] {
  const extra = extraBilibiliDanmakuController.getMessages?.() || [];
  if (extra.length === 0) return base;
  return base.length > 0 ? base.concat(extra) : extra;
}

function getAllDanmakuMessages(): DanmakuData[] {
  let list: DanmakuData[] = [];
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE)
    list = bilibiliDanmakuController.getMessages?.() || [];
  else if (DANMAKU_IS_BAHAMUT) list = bahamutFullMessages || [];
  else if (DANMAKU_IS_YOUTUBE)
    list = youtubeDanmakuController.getMessages?.() || [];
  else if (DANMAKU_IS_TWITCH)
    list = danmakuSourcesController.getMessages?.() || [];

  return mergeExtraDanmakuMessages(list).filter(
    (m) => !isDanmakuBlocked(m.text),
  );
}

async function loadAllDanmakuMessages(): Promise<DanmakuData[]> {
  let list: DanmakuData[] = [];
  if (DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE)
    list =
      (await bilibiliDanmakuController.loadAllMessages?.()) ||
      bilibiliDanmakuController.getMessages?.() ||
      [];
  else if (DANMAKU_IS_BAHAMUT) list = await loadBahamutDanmakuMessages();
  else if (DANMAKU_IS_YOUTUBE)
    list = youtubeDanmakuController.getMessages?.() || [];
  else if (DANMAKU_IS_TWITCH)
    list = danmakuSourcesController.getMessages?.() || [];

  const extra =
    (await extraBilibiliDanmakuController.loadAllMessages?.()) ||
    extraBilibiliDanmakuController.getMessages?.() ||
    [];
  if (extra.length > 0) list = list.length > 0 ? list.concat(extra) : extra;

  return list.filter((m) => !isDanmakuBlocked(m.text));
}

function supportsDanmakuHeatPeaks(): boolean {
  if ((DANMAKU_IS_BILIBILI && !DANMAKU_IS_BILIBILI_LIVE) || DANMAKU_IS_BAHAMUT)
    return true;
  return extraBilibiliDanmakuController.supportsHeatPeaks?.() ?? false;
}

globalThis.PipCompanion.ContentDanmakuSearch = {
  getMessages: getAllDanmakuMessages,
  loadAllMessages: loadAllDanmakuMessages,
  supportsHeatPeaks: supportsDanmakuHeatPeaks,
};

if (DANMAKU_IS_YOUTUBE) {
  window.addEventListener("yt-navigate-finish", () => {
    setTimeout(checkAndBindDanmakuChat, 600);
  });

  checkAndBindDanmakuChat();
}
