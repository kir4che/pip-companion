"use strict";

const IS_YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
const IS_BILIBILI = /(^|\.)bilibili\.com$/.test(location.hostname);
const IS_TWITCH = /(^|\.)twitch\.tv$/.test(location.hostname);
const IS_BAHAMUT = location.hostname === "ani.gamer.com.tw";

function isBilibiliLivePage() {
  return location.hostname === "live.bilibili.com";
}

const { SHORTCUT_DEFAULTS, SHORTCUT_KEYS, normalizeShortcut, matchesShortcut } =
  globalThis.PipCompanion.util;
const state: State = {
  launchShortcut: { ...SHORTCUT_DEFAULTS.launchShortcut },
  commentsShortcut: { ...SHORTCUT_DEFAULTS.commentsShortcut },
  screenshotShortcut: { ...SHORTCUT_DEFAULTS.screenshotShortcut },
  danmakuShortcut: { ...SHORTCUT_DEFAULTS.danmakuShortcut },
  commentsEnabled: true,
  screenshotEnabled: true,
  danmakuEnabled: true,
  lastNonOneRate: 1.25,
  sourceVideo: null,
  sourceAbort: null,
  videoStash: null,
  nativeCaptionTracks: null,
  youtubeCaptionsInitiallyEnabled: null,
  pipWindow: null,
  pipUi: null,
  globalPipOpen: false,
  captionNode: null,
  captionExtract: null,
  captionObserver: null,
  captionLines: [],
  captionsOn: true,
  opening: false,
  feedbackTimer: 0,
  lastDeepScan: 0,
  deepVideoCache: null,
  lastCaptionScan: 0,
  captionEmptyCount: 0,
  pageToastEl: null,
  pageToastTimer: 0,
  nextControlCacheAt: 0,
  nextControlCache: null,
  nextClickTimer: 0,
  nextClickPending: false,
  scanTimer: 0,
};

void loadSettings();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  let shortcutChanged = false;
  for (const key of SHORTCUT_KEYS) {
    if (!changes[key]) continue;
    state[key] = normalizeShortcut(
      changes[key].newValue,
      SHORTCUT_DEFAULTS[key],
    );
    shortcutChanged = true;
  }

  if (changes.commentsEnabled)
    state.commentsEnabled = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    state.screenshotEnabled = changes.screenshotEnabled.newValue !== false;
  if (changes.danmakuEnabled)
    state.danmakuEnabled = changes.danmakuEnabled.newValue !== false;
  if (shortcutChanged || changes.commentsEnabled || changes.screenshotEnabled)
    nudgeScan();
});

async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get({
      ...SHORTCUT_DEFAULTS,
      commentsEnabled: true,
      screenshotEnabled: true,
      danmakuEnabled: true,
    });
    for (const key of SHORTCUT_KEYS) {
      state[key] = normalizeShortcut(stored[key], SHORTCUT_DEFAULTS[key]);
    }
    state.commentsEnabled = stored.commentsEnabled !== false;
    state.screenshotEnabled = stored.screenshotEnabled !== false;
    state.danmakuEnabled = stored.danmakuEnabled !== false;
  } catch {
    for (const key of SHORTCUT_KEYS) {
      state[key] = { ...SHORTCUT_DEFAULTS[key] };
    }
    state.commentsEnabled = true;
    state.screenshotEnabled = true;
    state.danmakuEnabled = true;
  }

  nudgeScan();
}

function onPageKeyDown(e: KeyboardEvent) {
  const target = e.target;
  if (e.repeat || e.isComposing) return;

  const isEditableTarget =
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']"));

  if (matchesShortcut(e, state.launchShortcut)) {
    if (state.pipWindow && !state.pipWindow.closed) {
      e.preventDefault();
      e.stopPropagation();
      globalThis.PipCompanion.ContentPipLifecycle.closePiP(true);
    } else if (state.globalPipOpen) {
      e.preventDefault();
      e.stopPropagation();
      void chrome.runtime.sendMessage({ type: "CLOSE_ALL_PIP" });
    } else if (!state.sourceVideo || isEditableTarget)
      void chrome.runtime.sendMessage({ type: "CLOSE_ALL_PIP" });
    else {
      e.preventDefault();
      e.stopPropagation();
      void globalThis.PipCompanion.ContentPipLifecycle.openPiP().then(
        (result) => {
          if (!result?.ok)
            globalThis.PipCompanion.ContentFeedback.showPageToast(
              result?.message ?? "無法開啟子母畫面",
            );
        },
      );
    }
    return;
  }

  if (isEditableTarget || !state.sourceVideo) return;
  if (matchesShortcut(e, state.commentsShortcut)) {
    if (!(IS_YOUTUBE || IS_BILIBILI) || !state.commentsEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFloatingComments();
    return;
  }
  if (
    state.danmakuEnabled &&
    isDanmakuEnabled() &&
    (IS_YOUTUBE || IS_BILIBILI || IS_TWITCH || IS_BAHAMUT) &&
    matchesShortcut(e, state.danmakuShortcut)
  ) {
    e.preventDefault();
    e.stopPropagation();
    globalThis.PipCompanion.ContentPlayback.toggleDanmakuFromShortcut();
    return;
  }
  if (matchesShortcut(e, state.screenshotShortcut)) {
    if (!state.screenshotEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    globalThis.PipCompanion.ContentScreenshot.savePipScreenshot();
    return;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PIP_GLOBAL_STATE") {
    state.globalPipOpen = message.pipOpen === true;
    return;
  }
  if (message?.type === "PING") {
    sendResponse({
      ok: true,
      pipOpen: Boolean(state.pipWindow && !state.pipWindow.closed),
    });
    return;
  }
  if (message?.type === "CLOSE_PIP") {
    globalThis.PipCompanion.ContentPipLifecycle.closePiP(true);
    sendResponse({ ok: true });
    return;
  }
  if (message?.type !== "OPEN_PIP") return;
  void globalThis.PipCompanion.ContentPipLifecycle.openPiP().then(sendResponse);
  return true;
});

function scanPage() {
  if (state.pipWindow?.closed)
    globalThis.PipCompanion.ContentPipLifecycle.closePiP(false);

  if (IS_YOUTUBE || IS_BILIBILI) {
    if (state.commentsEnabled)
      ensureFloatingCommentsButton(state.commentsShortcut);
    else
      document
        .querySelectorAll(
          ".yt-floating-comments-btn, .bili-floating-comments-btn",
        )
        .forEach((button) => button.remove());
    if (state.screenshotEnabled)
      globalThis.PipCompanion.ContentScreenshot.ensureScreenshotButton(
        state.screenshotShortcut,
      );
    else document.querySelector(".yt-pip-screenshot-btn")?.remove();
    if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) {
      const comments = getFloatingCommentsRoot();
      if (comments) ensureFloatingCommentsCloseButton(comments);
    }
  }

  const found = globalThis.PipCompanion.ContentVideo.findVideo();
  const current = state.sourceVideo;
  let video = state.pipWindow && state.videoStash ? current : found;
  if (state.pipWindow && state.videoStash && found && found !== current) {
    const stashParent = state.videoStash.parent;
    const sameContainer = Boolean(
      stashParent?.isConnected && stashParent.contains(found),
    );
    if (
      found.videoWidth > 0 &&
      (sameContainer || (current?.paused === true && !found.paused))
    )
      video = found;
  }
  if (IS_YOUTUBE) checkAndBindDanmakuChat();
  if (IS_TWITCH || IS_BAHAMUT || isBilibiliLivePage())
    checkAndBindSiteDanmaku();
  if (!video) {
    if (state.sourceVideo && !state.sourceVideo.isConnected) {
      globalThis.PipCompanion.ContentPipLifecycle.closePiP(true);
      state.sourceAbort?.abort();
      state.sourceAbort = null;
      state.sourceVideo = null;
    }
    return;
  }

  if (video !== state.sourceVideo)
    globalThis.PipCompanion.ContentPipLifecycle.bindSourceVideo(video);
  if (IS_BILIBILI && !isBilibiliLivePage())
    checkAndBindBilibiliDanmaku(state.sourceVideo);
  globalThis.PipCompanion.ContentCaptions.refreshSubtitle();
  globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
}

const SCAN_PIP_MS = 750;
const SCAN_IDLE_MS = 2000;

function scheduleScan() {
  window.clearTimeout(state.scanTimer);
  state.scanTimer = window.setTimeout(
    () => {
      try {
        if (!document.hidden || state.pipWindow) scanPage();
      } finally {
        scheduleScan();
      }
    },
    state.pipWindow ? SCAN_PIP_MS : SCAN_IDLE_MS,
  );
}

function nudgeScan() {
  if (document.hidden && !state.pipWindow) return;
  try {
    scanPage();
  } finally {
    scheduleScan();
  }
}

window.addEventListener("keydown", onPageKeyDown, true);
void chrome.runtime
  .sendMessage({ type: "GET_PIP_STATE" })
  .then((response) => {
    state.globalPipOpen = response?.pipOpen === true;
  })
  .catch(() => {});
window.addEventListener("yt-navigate-finish", () => {
  toggleFloatingComments(false);
  nudgeScan();
});
window.addEventListener("yt-player-updated", nudgeScan);
document.addEventListener("play", nudgeScan, true);
document.addEventListener("loadedmetadata", nudgeScan, true);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) nudgeScan();
});
window.addEventListener("resize", () => {
  if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS))
    updateFloatingCommentsDimensions();
});
document.addEventListener(
  "pointerdown",
  (e) => {
    if (!document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) return;
    const comments = getFloatingCommentsRoot();
    const toggleBtn = document.querySelector(
      ".yt-floating-comments-btn, .bili-floating-comments-btn",
    );
    const target = e.target as Element;
    if (
      comments &&
      !comments.contains(target) &&
      (!toggleBtn || !toggleBtn.contains(target))
    )
      toggleFloatingComments(false);
  },
  true,
);
scanPage();
scheduleScan();
