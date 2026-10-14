"use strict";

const contentSiteUtils = globalThis.PipCompanion.site;
const IS_YOUTUBE = contentSiteUtils.isYouTubeHost(location.hostname);
const IS_BILIBILI = contentSiteUtils.isBilibiliHost(location.hostname);
const IS_TWITCH = contentSiteUtils.isTwitchHost(location.hostname);
const IS_BAHAMUT = contentSiteUtils.isBahamutHost(location.hostname);

function isBilibiliLivePage() {
  return contentSiteUtils.isBilibiliLiveHost(location.hostname);
}

function isPointerHoveringVideo(video: HTMLVideoElement): boolean {
  for (
    let element: Element | null = video;
    element;
    element = element.parentElement
  )
    if (element.matches(":hover")) return true;
  return false;
}

const {
  SHORTCUT_DEFAULTS,
  SHORTCUT_KEYS,
  DEFAULT_SEEK_SECONDS,
  normalizeSeekSeconds,
  normalizeShortcut,
  matchesShortcut,
} = globalThis.PipCompanion.util;
const captionSettings = globalThis.PipCompanion.captionSettings;
let pipHandoffRetryAfter = 0;
const PIP_HANDOFF_RETRY_DELAY_MS = 1500;
let pipSourceRecoveryStartedAt = 0;
const PIP_SOURCE_RECOVERY_WAIT_MS = 5000;

const state: State = {
  shortcuts: { ...SHORTCUT_DEFAULTS },
  commentsEnabled: true,
  screenshotEnabled: true,
  danmakuEnabled: true,
  thumbnailPreviewEnabled: true,
  followPlaybackPip: false,
  seekSeconds: DEFAULT_SEEK_SECONDS,
  lastNonOneRate: 1.25,
  sourceVideo: null,
  sourceAbort: null,
  videoStash: null,
  nativeCaptionTracks: null,
  youtubeCaptionsInitiallyEnabled: null,
  pipSession: { phase: "closed" },
  get pipWindow() {
    const session = this.pipSession;
    return session.phase === "waiting" || session.phase === "active"
      ? session.window
      : null;
  },
  get pipUi() {
    const session = this.pipSession;
    return session.phase === "active" ? session.ui : null;
  },
  globalPipOpen: false,
  globalPipSourcePlaying: true,
  pipHandoffPending: false,
  captionNode: null,
  captionExtract: null,
  captionObserver: null,
  captionLines: [],
  captionStyle: { ...captionSettings.DEFAULTS },
  captionsOn: true,
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
  nextVideoRequested: false,
  nextPlaybackState: null,
  nextVideoSourceKey: "",
  scanTimer: 0,
};
let captionStyleRevision = 0;

void loadSettings();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.uiLanguage) {
    globalThis.PipCompanion.util.setLanguagePreference(
      changes.uiLanguage.newValue,
    );
    state.pipUi?.refreshLocale();
    nudgeScan();
  }
  let shortcutChanged = false;
  for (const key of SHORTCUT_KEYS) {
    if (!changes[key]) continue;
    state.shortcuts[key] = normalizeShortcut(
      changes[key].newValue,
      SHORTCUT_DEFAULTS[key],
    );
    shortcutChanged = true;
  }

  if (changes.commentsEnabled)
    state.commentsEnabled = changes.commentsEnabled.newValue !== false;
  if (changes.screenshotEnabled)
    state.screenshotEnabled = changes.screenshotEnabled.newValue !== false;
  if (changes.thumbnailPreviewEnabled) {
    state.thumbnailPreviewEnabled =
      changes.thumbnailPreviewEnabled.newValue !== false;
    state.pipUi?.setThumbnailPreviewEnabled(state.thumbnailPreviewEnabled);
    if (state.thumbnailPreviewEnabled)
      globalThis.PipCompanion.ContentStoryboard.preload(state.sourceVideo);
  }
  if (shortcutChanged) state.pipUi?.refreshShortcuts();

  if (changes.danmakuEnabled) {
    state.danmakuEnabled = changes.danmakuEnabled.newValue !== false;
    state.pipUi?.setDanmakuEnabled(state.danmakuEnabled);
  }
  if (changes.followPlaybackPip) {
    state.followPlaybackPip = changes.followPlaybackPip.newValue === true;
    if (state.followPlaybackPip) void requestPipHandoff();
  }
  if (changes.seekSeconds)
    state.seekSeconds = normalizeSeekSeconds(changes.seekSeconds.newValue);
  const captionStyleChange = changes[captionSettings.STORAGE_KEY];
  if (captionStyleChange) {
    captionStyleRevision++;
    state.captionStyle = captionSettings.normalize(captionStyleChange.newValue);
    globalThis.PipCompanion.ContentCaptions.renderSubtitle();
  }
  if (shortcutChanged || changes.commentsEnabled || changes.screenshotEnabled)
    nudgeScan();
});

async function loadSettings() {
  const styleRevision = captionStyleRevision;
  try {
    const stored = await chrome.storage.local.get({
      ...SHORTCUT_DEFAULTS,
      commentsEnabled: true,
      screenshotEnabled: true,
      danmakuEnabled: true,
      thumbnailPreviewEnabled: true,
      followPlaybackPip: false,
      seekSeconds: DEFAULT_SEEK_SECONDS,
      uiLanguage: "auto",
      [captionSettings.STORAGE_KEY]: captionSettings.DEFAULTS,
    });
    globalThis.PipCompanion.util.setLanguagePreference(stored.uiLanguage);
    for (const key of SHORTCUT_KEYS) {
      state.shortcuts[key] = normalizeShortcut(
        stored[key],
        SHORTCUT_DEFAULTS[key],
      );
    }
    state.commentsEnabled = stored.commentsEnabled !== false;
    state.screenshotEnabled = stored.screenshotEnabled !== false;
    state.danmakuEnabled = stored.danmakuEnabled !== false;
    state.thumbnailPreviewEnabled = stored.thumbnailPreviewEnabled !== false;
    state.followPlaybackPip = stored.followPlaybackPip === true;
    state.seekSeconds = normalizeSeekSeconds(stored.seekSeconds);
    if (styleRevision === captionStyleRevision)
      state.captionStyle = captionSettings.normalize(
        stored[captionSettings.STORAGE_KEY],
      );
  } catch {
    state.shortcuts = { ...SHORTCUT_DEFAULTS };
    state.commentsEnabled = true;
    state.screenshotEnabled = true;
    state.danmakuEnabled = true;
    state.thumbnailPreviewEnabled = true;
    state.followPlaybackPip = false;
    state.seekSeconds = DEFAULT_SEEK_SECONDS;
    if (styleRevision === captionStyleRevision)
      state.captionStyle = { ...captionSettings.DEFAULTS };
  }

  state.pipUi?.setThumbnailPreviewEnabled(state.thumbnailPreviewEnabled);
  if (state.thumbnailPreviewEnabled)
    globalThis.PipCompanion.ContentStoryboard.preload(state.sourceVideo);
  globalThis.PipCompanion.ContentCaptions.renderSubtitle();
  nudgeScan();
  void requestPipHandoff();
}

function onPageKeyDown(e: KeyboardEvent) {
  const target = e.target;
  if (e.repeat || e.isComposing) return;

  const isEditableTarget =
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      target.closest("input, textarea, select, [contenteditable='true']"));

  if (matchesShortcut(e, state.shortcuts.launchShortcut)) {
    if (
      state.pipSession.phase !== "closed" &&
      state.pipWindow &&
      !state.pipWindow.closed
    ) {
      e.preventDefault();
      e.stopPropagation();
      globalThis.PipCompanion.ContentPipLifecycle.closePiP(true);
    } else if (state.globalPipOpen) {
      e.preventDefault();
      e.stopPropagation();
      void chrome.runtime.sendMessage({
        type: "CLOSE_ALL_PIP",
      } satisfies ExtensionMessage);
    } else if (isEditableTarget) return;
    else {
      const video =
        state.sourceVideo ??
        globalThis.PipCompanion.ContentVideo.findVideo(false);
      if (video && video !== state.sourceVideo)
        globalThis.PipCompanion.ContentPipLifecycle.bindSourceVideo(video);
      e.preventDefault();
      e.stopPropagation();
      void globalThis.PipCompanion.ContentPipLifecycle.openPiP().then(
        (result) => {
          if (!result.ok)
            globalThis.PipCompanion.ContentFeedback.showPageToast(
              result.message,
            );
        },
      );
    }
    return;
  }

  if (isEditableTarget || !state.sourceVideo) return;
  if (matchesShortcut(e, state.shortcuts.commentsShortcut)) {
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
    matchesShortcut(e, state.shortcuts.danmakuShortcut)
  ) {
    e.preventDefault();
    e.stopPropagation();
    globalThis.PipCompanion.ContentPlayback.toggleDanmakuFromShortcut();
    return;
  }
  if (matchesShortcut(e, state.shortcuts.screenshotShortcut)) {
    if (!state.screenshotEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    globalThis.PipCompanion.ContentScreenshot.savePipScreenshot();
    return;
  }
}

chrome.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    if (!globalThis.PipCompanion.util.isExtensionMessage(message)) return;
    if (message.type === "PIP_GLOBAL_STATE") {
      state.globalPipOpen = message.pipOpen === true;
      state.globalPipSourcePlaying = message.pipOpen
        ? message.sourcePlaying !== false
        : true;
      if (message.pipOpen && !state.globalPipSourcePlaying)
        void requestPipHandoff();
      return;
    }
    if (message.type === "PIP_SOURCE_PLAYBACK_CHANGED") {
      state.globalPipSourcePlaying = message.playing;
      pipHandoffRetryAfter = 0;
      if (!message.playing) void requestPipHandoff();
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
    void globalThis.PipCompanion.ContentPipLifecycle.openPiP().then(
      sendResponse,
    );
    return true;
  },
);

function scanPage() {
  if (state.pipWindow?.closed)
    globalThis.PipCompanion.ContentPipLifecycle.closePiP(false);

  if (IS_YOUTUBE || IS_BILIBILI) {
    if (state.commentsEnabled && IS_YOUTUBE)
      ensureFloatingCommentsButton(state.shortcuts.commentsShortcut);
    else
      document
        .querySelectorAll(
          ".yt-floating-comments-btn, .bili-floating-comments-btn",
        )
        .forEach((button) => button.remove());
    if (state.screenshotEnabled)
      globalThis.PipCompanion.ContentScreenshot.ensureScreenshotButton(
        state.shortcuts.screenshotShortcut,
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
  if (state.pipWindow && state.videoStash && current && !current.isConnected) {
    pipSourceRecoveryStartedAt ||= Date.now();
    const container = state.videoStash.parent;
    // 來源失效只找原容器，不能改接頁面上其他影片。
    const replacement =
      container?.isConnected && "querySelectorAll" in container
        ? Array.from(
            (container as ParentNode).querySelectorAll<HTMLVideoElement>(
              "video",
            ),
          ).find((candidate) => candidate.videoWidth > 0 && !candidate.ended)
        : null;
    if (replacement) {
      video = replacement;
      pipSourceRecoveryStartedAt = 0;
    } else if (
      Date.now() - pipSourceRecoveryStartedAt <
      PIP_SOURCE_RECOVERY_WAIT_MS
    )
      return;
    else video = null;
  } else {
    pipSourceRecoveryStartedAt = 0;
    if (
      state.nextVideoRequested &&
      state.pipWindow &&
      state.videoStash &&
      found &&
      found !== current &&
      !isPointerHoveringVideo(found) &&
      found.videoWidth > 0 &&
      !found.ended
    )
      video = found; // 下一集換片才跟著切，避免誤綁廣告或預覽。
    else if (
      state.followPlaybackPip &&
      state.pipWindow &&
      state.videoStash &&
      found &&
      found !== current &&
      !isPointerHoveringVideo(found)
    ) {
      const stashParent = state.videoStash.parent;
      const sameContainer = Boolean(
        stashParent?.isConnected && stashParent.contains(found),
      );
      if (
        found.videoWidth > 0 &&
        !found.paused &&
        !found.ended &&
        (sameContainer || current?.paused === true)
      )
        video = found;
    }
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
  else if (
    state.nextVideoRequested &&
    state.nextPlaybackState &&
    (video.currentSrc || video.src || "") !== state.nextVideoSourceKey
  ) {
    globalThis.PipCompanion.ContentPlayback.applyPendingNextPlaybackState(
      video,
    );
    state.nextVideoRequested = false;
  }
  if (IS_BILIBILI && !isBilibiliLivePage())
    checkAndBindBilibiliDanmaku(state.sourceVideo);
  globalThis.PipCompanion.ContentCaptions.refreshSubtitle();
  globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
}

const SCAN_PIP_MS = 750;
const SCAN_NEXT_VIDEO_MS = 150;
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
    state.pipSession.phase === "active"
      ? state.nextVideoRequested
        ? SCAN_NEXT_VIDEO_MS
        : SCAN_PIP_MS
      : SCAN_IDLE_MS,
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

async function requestPipHandoff() {
  if (
    Date.now() < pipHandoffRetryAfter ||
    !state.followPlaybackPip ||
    !state.globalPipOpen ||
    state.globalPipSourcePlaying ||
    state.pipWindow ||
    state.pipHandoffPending
  )
    return;

  let video = state.sourceVideo;
  if (!video || !video.isConnected || video.paused || video.ended) {
    video = globalThis.PipCompanion.ContentVideo.findVideo();
    if (video && video !== state.sourceVideo) {
      if (isPointerHoveringVideo(video)) return;
      globalThis.PipCompanion.ContentPipLifecycle.bindSourceVideo(video);
    }
  }
  if (!video || video.paused || video.ended) return;

  state.pipHandoffPending = true;
  try {
    const response = await chrome.runtime.sendMessage({
      type: "REQUEST_PIP_HANDOFF",
    } satisfies ExtensionMessage);
    if (response?.ok === true) pipHandoffRetryAfter = 0;
    else {
      pipHandoffRetryAfter = Date.now() + PIP_HANDOFF_RETRY_DELAY_MS;
      if (state.sourceVideo && !state.sourceVideo.paused)
        globalThis.PipCompanion.ContentFeedback.showPageToast(
          globalThis.PipCompanion.util.getMessage("contentHandoffFailed"),
        );
    }
  } catch {
    pipHandoffRetryAfter = Date.now() + PIP_HANDOFF_RETRY_DELAY_MS;
  } finally {
    state.pipHandoffPending = false;
  }
}

window.addEventListener("keydown", onPageKeyDown, true);
void chrome.runtime
  .sendMessage({ type: "GET_PIP_STATE" } satisfies ExtensionMessage)
  .then((response) => {
    state.globalPipOpen = response?.pipOpen === true;
    state.globalPipSourcePlaying = response?.sourcePlaying !== false;
    if (state.globalPipOpen && !state.globalPipSourcePlaying)
      void requestPipHandoff();
  })
  .catch(() => {});
window.addEventListener("yt-navigate-finish", () => {
  toggleFloatingComments(false);
  nudgeScan();
});
window.addEventListener("yt-player-updated", nudgeScan);
document.addEventListener(
  "play",
  () => {
    pipHandoffRetryAfter = 0;
    nudgeScan();
    void requestPipHandoff();
  },
  true,
);

for (const gestureEvent of ["pointerdown", "keydown"] as const) {
  document.addEventListener(
    gestureEvent,
    () => {
      void requestPipHandoff();
    },
    true,
  );
}

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
    const target = e.target;
    if (!(target instanceof Element)) return;
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
