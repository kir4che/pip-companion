"use strict";

const VIDEO_SELECTOR = "video.html5-main-video";
const IS_YOUTUBE = /(^|\.)youtube\.com$/.test(location.hostname);
const IS_BILIBILI = /(^|\.)bilibili\.com$/.test(location.hostname);

function isBilibiliVideoPage() {
  return IS_BILIBILI && /^\/video\/(BV[\w]{10}|av\d+)/i.test(location.pathname);
}

const VOLUME_ICON_PATH =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-3-4.24v8.47a4.5 4.5 0 0 0 3-4.23z";
const MUTED_VOLUME_ICON_PATH =
  "M3 9v6h4l5 5V4L7 9H3z M15.5 9.4 16.9 8l2.6 2.6L22.1 8l1.4 1.4-2.6 2.6 2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6z";
const PLAYBACK_RATES = [
  0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75,
  4, 4.25, 4.5, 4.75, 5,
];
const PLAY_ICON_PATH = "M8 5v14l11-7z";
const PAUSE_ICON_PATH = "M6 19h4V5H6v14zm8-14v14h4V5h-4z";
const FRAME_PREV_ICON_PATH = "M14 6l-6 6 6 6V6zm-7 0l-6 6 6 6V6z";
const FRAME_NEXT_ICON_PATH = "M4 6l6 6-6 6V6zm7 0l6 6-6 6V6z";
const PipAudio = globalThis.PipCompanion.PipAudio;
const PipUI = globalThis.PipCompanion.PipUI;
const {
  SHORTCUT_DEFAULTS,
  SHORTCUT_KEYS,
  normalizeShortcut,
  matchesShortcut,
  formatShortcut,
  formatTime,
} = globalThis.PipCompanion.util;
const state: State = {
  launchShortcut: { ...SHORTCUT_DEFAULTS.launchShortcut },
  commentsShortcut: { ...SHORTCUT_DEFAULTS.commentsShortcut },
  screenshotShortcut: { ...SHORTCUT_DEFAULTS.screenshotShortcut },
  danmakuShortcut: { ...SHORTCUT_DEFAULTS.danmakuShortcut },
  commentsEnabled: true,
  screenshotEnabled: true,
  lastNonOneRate: 1.25,
  sourceVideo: null,
  sourceAbort: null,
  videoStash: null,
  nativeCaptionTracks: null,
  pipWindow: null,
  pipUi: null,
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
  if (shortcutChanged || changes.commentsEnabled || changes.screenshotEnabled)
    nudgeScan();
});
async function loadSettings() {
  try {
    const stored = await chrome.storage.local.get({
      ...SHORTCUT_DEFAULTS,
      commentsEnabled: true,
      screenshotEnabled: true,
    });
    for (const key of SHORTCUT_KEYS) {
      state[key] = normalizeShortcut(stored[key], SHORTCUT_DEFAULTS[key]);
    }
    state.commentsEnabled = stored.commentsEnabled !== false;
    state.screenshotEnabled = stored.screenshotEnabled !== false;
  } catch {
    for (const key of SHORTCUT_KEYS) {
      state[key] = { ...SHORTCUT_DEFAULTS[key] };
    }
    state.commentsEnabled = true;
    state.screenshotEnabled = true;
  }
  nudgeScan();
}
function onPageKeyDown(e: KeyboardEvent) {
  const target = e.target;
  if (
    !state.sourceVideo ||
    e.repeat ||
    e.isComposing ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest("input, textarea, select, [contenteditable='true']")))
  )
    return;
  if (matchesShortcut(e, state.commentsShortcut)) {
    if (!IS_YOUTUBE || !state.commentsEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    toggleFloatingComments();
    return;
  }
  if (
    (IS_YOUTUBE || isBilibiliVideoPage()) &&
    matchesShortcut(e, state.danmakuShortcut)
  ) {
    e.preventDefault();
    e.stopPropagation();
    toggleDanmakuWithFeedback();
    return;
  }
  if (matchesShortcut(e, state.screenshotShortcut)) {
    if (!state.screenshotEnabled) return;
    e.preventDefault();
    e.stopPropagation();
    savePipScreenshot();
    return;
  }
  if (!matchesShortcut(e, state.launchShortcut)) return;
  e.preventDefault();
  e.stopPropagation();
  void openPiP().then((result) => {
    if (!result?.ok) showPageToast(result?.message ?? "無法開啟浮窗");
  });
}
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ ok: true });
    return;
  }
  if (message?.type !== "OPEN_PIP") return;
  void openPiP().then(sendResponse);
  return true;
});
// ── 影片來源查找 ──
function getDocumentPip() {
  return window.documentPictureInPicture ?? null;
}
function pickLargestVideo(
  videos: Iterable<HTMLVideoElement>,
): HTMLVideoElement | null {
  let best: HTMLVideoElement | null = null;
  for (const video of videos) {
    if (
      !best ||
      video.videoWidth * video.videoHeight > best.videoWidth * best.videoHeight
    )
      best = video;
  }
  return best;
}
function collectVideosDeep(
  root: Document | ShadowRoot,
  out: HTMLVideoElement[],
): void {
  for (const video of root.querySelectorAll("video")) out.push(video);
  for (const element of root.querySelectorAll("*")) {
    if (element.shadowRoot) collectVideosDeep(element.shadowRoot, out);
  }
  for (const frame of root.querySelectorAll("iframe")) {
    let doc: Document | null = null;
    try {
      doc = frame.contentDocument; // 跨來源會是 null（或拋錯）
    } catch {
      doc = null;
    }
    if (doc) collectVideosDeep(doc, out);
  }
}
const DEEP_SCAN_MS = 1000;
function findVideo(): HTMLVideoElement | null {
  const preferred = document.querySelector(
    VIDEO_SELECTOR,
  ) as HTMLVideoElement | null;
  if (preferred) return preferred;
  const light = pickLargestVideo(document.querySelectorAll("video"));
  if (light) return light;
  if (state.deepVideoCache?.isConnected) return state.deepVideoCache;
  if (Date.now() - state.lastDeepScan < DEEP_SCAN_MS)
    return state.deepVideoCache;
  state.lastDeepScan = Date.now();
  const collected: HTMLVideoElement[] = [];
  collectVideosDeep(document, collected);
  state.deepVideoCache = pickLargestVideo(collected);
  return state.deepVideoCache;
}
const CAPTION_SCAN_MS = 1000;
const CAPTION_EMPTY_LIMIT = 5;
// ── 字幕 ──
function refreshSubtitle(force = false) {
  if (!state.pipUi) {
    state.captionObserver?.disconnect();
    state.captionObserver = null;
    state.captionNode = null;
    state.captionExtract = null;
    state.captionLines = [];
    return;
  }
  let nextNode = state.captionNode;
  if (state.captionNode?.isConnected) {
    if (Date.now() - state.lastCaptionScan >= CAPTION_SCAN_MS) {
      state.lastCaptionScan = Date.now();
      if (extractOverlayLines(state.captionNode).length)
        state.captionEmptyCount = 0;
      else if (++state.captionEmptyCount >= CAPTION_EMPTY_LIMIT) {
        state.captionEmptyCount = 0;
        state.captionObserver?.disconnect();
        state.captionObserver = null;
        state.captionNode = null;
        state.captionExtract = null;
      }
    }
    nextNode = state.captionNode;
  } else {
    if (!force && Date.now() - state.lastCaptionScan < CAPTION_SCAN_MS) return;
    state.lastCaptionScan = Date.now();
    nextNode = findGenericCaptionNode();
  }
  if (nextNode !== state.captionNode) {
    state.captionEmptyCount = 0;
    state.captionObserver?.disconnect();
    state.captionObserver = null;
    state.captionNode = nextNode;
    state.captionExtract = nextNode ? extractOverlayLines : null;
    const node = state.captionNode;
    const extract = state.captionExtract;
    if (node && extract) {
      state.captionObserver = new MutationObserver(() => {
        state.captionLines = extract(node);
        renderSubtitle();
      });
      state.captionObserver.observe(node, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["style"],
      });
    }
    force = true;
  }
  if (!force) return;
  const activeNode = state.captionNode;
  const activeExtract = state.captionExtract;
  state.captionLines =
    activeNode && activeExtract
      ? activeExtract(activeNode)
      : getNativeCaptionLines();
  renderSubtitle();
}
function findGenericCaptionNode() {
  const selector =
    '[class*="subtitle" i], [class*="caption" i], [class*="timedtext" i], [id*="subtitle" i], [id*="caption" i]';
  const scored: { element: HTMLElement; score: number }[] = [];
  for (const element of document.querySelectorAll(
    selector,
  ) as NodeListOf<HTMLElement>) {
    const text = (element.innerText || "").trim();
    if (!text || text.length > 300) continue;
    if (element.querySelector("button, a, input, select, video")) continue;
    const style = getComputedStyle(element);
    if (style.position !== "absolute" && style.position !== "fixed") continue;
    const rect = element.getBoundingClientRect();
    if (rect.width < 40) continue;
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
    let score = 0;
    if (style.pointerEvents === "none") score += 2;
    if (
      element.closest(
        "button, [role='button'], [role='menu'], [role='listbox']",
      )
    )
      score -= 2;
    if (
      element.closest(
        "[class*='control' i], [class*='ctrl' i], [class*='panel' i]",
      )
    )
      score -= 2;
    scored.push({ element, score });
  }
  if (!scored.length) return null;
  const best = Math.max(...scored.map((entry) => entry.score));
  const top = scored
    .filter((entry) => entry.score === best)
    .map((entry) => entry.element);
  return (
    top.find(
      (element) =>
        !top.some((other) => other !== element && other.contains(element)),
    ) ?? top[0]
  );
}
function extractOverlayLines(node: HTMLElement | null) {
  if (!node) return [];
  return (node.innerText || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((text) => ({ segments: [{ text }] }));
}
function getNativeCaptionLines(): CaptionLine[] {
  const lines: CaptionLine[] = [];
  for (const track of state.sourceVideo?.textTracks ?? []) {
    if (
      (track.mode !== "showing" && track.mode !== "hidden") ||
      track.kind === "metadata" ||
      track.kind === "chapters"
    )
      continue;
    for (const cue of track.activeCues ?? []) {
      const vtt = cue as VTTCue;
      const text = (vtt.text || "").replace(/<[^>]*>/g, "");
      for (const part of text.split(/\r?\n/)) {
        if (part.trim()) lines.push({ segments: [{ text: part.trim() }] });
      }
    }
  }
  return lines;
}
function suppressNativeCaptions() {
  if (state.captionNode || !state.videoStash) return;
  for (const track of state.sourceVideo?.textTracks ?? []) {
    if (
      track.kind === "metadata" ||
      track.kind === "chapters" ||
      track.mode !== "showing"
    )
      continue;
    (state.nativeCaptionTracks ??= new Set()).add(track);
    track.mode = "hidden";
  }
}
function restoreNativeCaptionModes() {
  for (const track of state.nativeCaptionTracks ?? []) {
    if (track.mode === "hidden") track.mode = "showing";
  }
  state.nativeCaptionTracks = null;
}
function syncNativeCaptions() {
  if (!state.pipUi || state.captionNode) return;
  suppressNativeCaptions();
  state.captionLines = getNativeCaptionLines();
  renderSubtitle();
}
function renderSubtitle() {
  if (!state.pipUi) return;
  state.pipUi.subtitle.replaceChildren();
  if (!state.captionsOn || !state.captionLines.length) {
    state.pipUi.subtitle.hidden = true;
    return;
  }
  state.pipUi.subtitle.hidden = false;
  const doc = state.pipUi.subtitle.ownerDocument;
  for (const line of state.captionLines) {
    const lineEl = doc.createElement("div");
    lineEl.className = "subtitle-line";
    for (const seg of line.segments) {
      const segEl = doc.createElement("span");
      segEl.className = "subtitle-segment";
      segEl.textContent = seg.text;
      if (seg.color) segEl.style.color = seg.color;
      if (seg.bg) segEl.style.background = seg.bg;
      if (seg.fontFamily) segEl.style.fontFamily = seg.fontFamily;
      if (seg.textShadow) segEl.style.textShadow = seg.textShadow;
      lineEl.appendChild(segEl);
    }
    state.pipUi.subtitle.appendChild(lineEl);
  }
}
// ── 浮窗回饋 ──
function revealFeedback() {
  if (!state.pipUi) return;
  state.pipUi.feedback.hidden = false;
  window.clearTimeout(state.feedbackTimer);
  state.feedbackTimer = window.setTimeout(() => {
    if (state.pipUi) state.pipUi.feedback.hidden = true;
  }, 900);
}
function showFeedback(text: string) {
  if (!state.pipUi) {
    showPageToast(text);
    return;
  }
  state.pipUi.feedback.dataset.mode = "text";
  state.pipUi.feedback.textContent = text;
  revealFeedback();
}
function showPageToast(text: string) {
  if (!state.pageToastEl) {
    state.pageToastEl = document.createElement("div");
    state.pageToastEl.setAttribute("role", "status");
    state.pageToastEl.setAttribute("aria-live", "polite");
    state.pageToastEl.style.cssText = [
      "position:fixed",
      "left:50%",
      "bottom:80px",
      "transform:translateX(-50%)",
      "z-index:2147483647",
      "max-width:80vw",
      "padding:10px 16px",
      "border-radius:8px",
      "background:rgba(0,0,0,0.82)",
      "color:#fff",
      "font:500 14px/1.4 system-ui,-apple-system,sans-serif",
      "pointer-events:none",
      "opacity:0",
      "transition:opacity 0.2s ease",
    ].join(";");
  }
  state.pageToastEl.textContent = text;
  (document.body ?? document.documentElement).appendChild(state.pageToastEl);
  state.pageToastEl.style.opacity = "1";
  const toastEl = state.pageToastEl;
  window.clearTimeout(state.pageToastTimer);
  state.pageToastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, 1200);
}
function showIconFeedback(pathData: string) {
  if (!state.pipUi) return;
  const doc = state.pipUi.feedback.ownerDocument;
  const icon = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("aria-hidden", "true");
  const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", pathData);
  icon.append(path);
  state.pipUi.feedback.dataset.mode = "icon";
  state.pipUi.feedback.replaceChildren(icon);
  revealFeedback();
}
function showPlaybackFeedback(paused: boolean) {
  showIconFeedback(paused ? PAUSE_ICON_PATH : PLAY_ICON_PATH);
}
function showFrameStepIcon(backward: boolean) {
  showIconFeedback(backward ? FRAME_PREV_ICON_PATH : FRAME_NEXT_ICON_PATH);
}
function showVolumeFeedback() {
  if (!state.sourceVideo) return;
  const isMuted = state.sourceVideo.muted || getSourceVolumePercent() === 0;
  showFeedback(isMuted ? "0%" : `${Math.round(getSourceVolumePercent())}%`);
}
function getYouTubePlayer(): YouTubePlayer | null {
  return document.querySelector("#movie_player") as YouTubePlayer | null;
}
// ── 截圖 ──
function screenshotFilename() {
  const title =
    document.title
      .replace(/\s*[-–]\s*YouTube\s*$/i, "")
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/^\.+/, "")
      .trim()
      .slice(0, 80) || "Screenshot";
  const now = new Date();
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}_${pad(now.getMilliseconds(), 3)}`;
  return `${title}_${dateStr}.png`;
}
function downloadViaAnchor(url: string, filename: string) {
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } catch {
    // 失敗即放棄下載
  }
}
function savePipScreenshot() {
  if (!state.screenshotEnabled) return;
  const video =
    (state.sourceVideo?.videoWidth ? state.sourceVideo : null) ||
    (state.pipUi?.video?.videoWidth ? state.pipUi.video : null) ||
    findVideo();
  if (!video || !video.videoWidth || !video.videoHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    downloadViaAnchor(canvas.toDataURL("image/png"), screenshotFilename());
    showFeedback("已截圖");
  } catch (error) {
    showFeedback(
      error instanceof Error && error.name === "SecurityError"
        ? "跨來源影片無法截圖"
        : "截圖失敗",
    );
  }
}
// ── 播放控制 / 下一集 ──
function getSourceVolumePercent() {
  return PipAudio.getVolumePercent(state.sourceVideo);
}
function setSourceVolumePercent(percent: number, unmute: boolean) {
  const video = state.sourceVideo;
  if (!video) return;
  if (
    percent > 100 &&
    state.pipWindow &&
    !PipAudio.isActiveFor(video) &&
    !PipAudio.start(video, state.pipWindow)
  )
    percent = 100;
  PipAudio.setVolumePercent(video, percent, unmute, getYouTubePlayer());
  updatePlaybackUi();
}
const PLAYER_CONTAINERS = [
  "#movie_player",
  ".bpx-player",
  "#bilibili-player",
  ".bilibili-player",
  ".watch-video",
  "[data-uia='player']",
];
const NEXT_LABEL = /next|下一|下一个|下一個|다음/i;
function findNextControl(): NextControl | null {
  const known = (document.querySelector("#movie_player .ytp-next-button") ??
    document.querySelector('[data-uia="control-next"]') ??
    document.querySelector(
      '[data-uia="next-episode-seamless-button"]',
    )) as NextControl | null;
  if (known) return known;
  for (const containerSelector of PLAYER_CONTAINERS) {
    const container = document.querySelector(containerSelector);
    if (!container) continue;
    const candidate = Array.from(
      container.querySelectorAll(
        "button, a, [role='button'], [aria-label], [title]",
      ) as NodeListOf<NextControl>,
    ).find((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${
        element.getAttribute("title") ?? ""
      }`;
      return !element.disabled && NEXT_LABEL.test(label);
    });
    if (candidate) return candidate;
  }
  return null;
}
const NEXT_CONTROL_CACHE_MS = 800;
function findNextControlCached() {
  if (Date.now() - state.nextControlCacheAt < NEXT_CONTROL_CACHE_MS) {
    if (!state.nextControlCache || state.nextControlCache.isConnected)
      return state.nextControlCache;
  }
  state.nextControlCacheAt = Date.now();
  state.nextControlCache = findNextControl();
  return state.nextControlCache;
}
const NEXT_RETRY_MS = 250;
const NEXT_RETRY_LIMIT = 12;
function playNextVideo() {
  const player = getYouTubePlayer();
  if (player?.nextVideo) {
    try {
      player.nextVideo();
      return;
    } catch {
      // 失敗則改用看得見的下一集按鈕
    }
  }
  if (state.nextClickPending) return;
  state.nextClickPending = true;
  tryNextOnce(0);
}
function tryNextOnce(attempt: number) {
  const control = findNextControl();
  if (
    control &&
    !control.disabled &&
    control.getAttribute("aria-disabled") !== "true"
  ) {
    state.nextClickPending = false;
    control.click();
    return;
  }
  if (attempt >= NEXT_RETRY_LIMIT) {
    state.nextClickPending = false;
    return;
  }
  window.clearTimeout(state.nextClickTimer);
  state.nextClickTimer = window.setTimeout(
    () => tryNextOnce(attempt + 1),
    NEXT_RETRY_MS,
  );
}
function updatePlaybackUi() {
  if (!state.sourceVideo || !state.pipUi) return;
  const player = getYouTubePlayer();
  let muted = state.sourceVideo.muted || state.sourceVideo.volume === 0;
  try {
    muted = muted || Boolean(player?.isMuted?.());
  } catch {
    // YouTube 播放器 API 不可用時，改用 media 元素的靜音狀態。
  }
  state.pipUi.playButton.textContent = state.sourceVideo.paused ? "▶" : "Ⅱ";
  state.pipUi.playButton.setAttribute(
    "aria-label",
    state.sourceVideo.paused ? "播放影片" : "暫停影片",
  );
  const playbackRate = Math.round(state.sourceVideo.playbackRate * 100) / 100;
  const speedLabel = `${playbackRate}×`;
  state.pipUi.speedButton.textContent = speedLabel;
  state.pipUi.speedButton.setAttribute("aria-label", `播放速度 ${speedLabel}`);
  state.pipUi.speedSlider.value = String(playbackRate);
  state.pipUi.volumeButton.setAttribute(
    "aria-label",
    muted ? "取消靜音" : "靜音",
  );
  state.pipUi.volumePath.setAttribute(
    "d",
    muted ? MUTED_VOLUME_ICON_PATH : VOLUME_ICON_PATH,
  );
  const volumePercent = Math.round(getSourceVolumePercent());
  state.pipUi.volumeSlider.value = String(volumePercent);
  state.pipUi.volumeSlider.max = String(PipAudio.maxVolume(state.sourceVideo));
  if (
    state.pipUi.volumeValue.ownerDocument.activeElement !==
    state.pipUi.volumeValue
  )
    state.pipUi.volumeValue.value = String(volumePercent);
  const duration = Number.isFinite(state.sourceVideo.duration)
    ? state.sourceVideo.duration
    : 0;
  const durationText = formatTime(duration);
  if (
    state.pipUi.timeCurrent.ownerDocument.activeElement !==
    state.pipUi.timeCurrent
  ) {
    const timeText = formatTime(state.sourceVideo.currentTime);
    state.pipUi.timeCurrent.value = timeText;
    state.pipUi.timeCurrent.size = Math.max(4, timeText.length);
  }
  state.pipUi.timeDuration.textContent = `/ ${durationText}`;
  const progressPercent =
    duration > 0 && Number.isFinite(state.sourceVideo.currentTime)
      ? Math.max(
          0,
          Math.min(100, (state.sourceVideo.currentTime / duration) * 100),
        )
      : 0;
  state.pipUi.miniProgressFill.style.width = `${progressPercent}%`;
  state.pipUi.miniProgress.setAttribute(
    "aria-valuenow",
    String(Math.round(progressPercent)),
  );
  state.pipUi.progress.disabled = duration <= 0;
  state.pipUi.progress.setAttribute(
    "aria-valuetext",
    `${formatTime(state.sourceVideo.currentTime)} / ${formatTime(duration)}`,
  );
  if (
    state.pipUi.progress.ownerDocument.activeElement !== state.pipUi.progress
  ) {
    state.pipUi.progress.value =
      duration > 0
        ? String(Math.round((state.sourceVideo.currentTime / duration) * 1000))
        : "0";
  }
  const nextControl = findNextControlCached();
  state.pipUi.nextButton.disabled = player
    ? !player.nextVideo &&
      (!nextControl ||
        nextControl.disabled ||
        nextControl.getAttribute("aria-disabled") === "true")
    : !nextControl;
}
function togglePlayback() {
  if (!state.sourceVideo) return;
  const willPlay = state.sourceVideo.paused;
  if (willPlay) void state.sourceVideo.play().catch(() => {});
  else state.sourceVideo.pause();
  showPlaybackFeedback(!willPlay);
}
function adjustPlaybackRate(direction: number) {
  const video = state.sourceVideo;
  if (!video) return;
  let nextRate;
  if (direction > 0)
    nextRate = PLAYBACK_RATES.find((rate) => rate > video.playbackRate + 0.001);
  else {
    for (let index = PLAYBACK_RATES.length - 1; index >= 0; index--) {
      if (PLAYBACK_RATES[index] < video.playbackRate - 0.001) {
        nextRate = PLAYBACK_RATES[index];
        break;
      }
    }
  }
  if (nextRate === undefined)
    nextRate = PLAYBACK_RATES[direction > 0 ? PLAYBACK_RATES.length - 1 : 0];
  video.playbackRate = nextRate;
  updatePlaybackUi();
}
function togglePlaybackRate() {
  const video = state.sourceVideo;
  if (!video) return;
  if (Math.abs(video.playbackRate - 1) > 0.001) {
    state.lastNonOneRate = video.playbackRate;
    video.playbackRate = 1;
  } else video.playbackRate = state.lastNonOneRate;
  updatePlaybackUi();
}
function toggleMute() {
  if (!state.sourceVideo) return;
  PipAudio.toggleMute(state.sourceVideo, getYouTubePlayer());
  updatePlaybackUi();
  showVolumeFeedback();
}
function toggleCaptions() {
  state.captionsOn = !state.captionsOn;
  renderSubtitle();
  showFeedback(state.captionsOn ? "字幕: 開" : "字幕: 關");
}
function toggleDanmakuWithFeedback() {
  showFeedback(toggleDanmaku() ? "彈幕: 開" : "彈幕: 關");
}
function resizePipWindow(innerWidth: number, width: number, height: number) {
  return chrome.runtime.sendMessage({
    type: "RESIZE_PIP_WINDOW",
    innerWidth,
    width,
    height,
  });
}
// ── PiP UI 建立 ──
function createPipUi(win: Window, video: HTMLVideoElement) {
  return PipUI.create(
    win,
    {
      volumeIconPath: VOLUME_ICON_PATH,
      getVideo: () => state.sourceVideo,
      updatePlaybackUi,
      togglePlayback,
      adjustPlaybackRate,
      togglePlaybackRate,
      toggleMute,
      playNext: playNextVideo,
      setVolume: setSourceVolumePercent,
      getMaxVolume: () => PipAudio.maxVolume(state.sourceVideo),
      showFeedback,
      showVolumeFeedback,
      showFrameStepIcon,
      getVolumePercent: getSourceVolumePercent,
      toggleCaptions,
      toggleComments: toggleFloatingComments,
      toggleDanmaku: toggleDanmakuWithFeedback,
      matchesCommentsShortcut: (event) =>
        state.commentsEnabled && matchesShortcut(event, state.commentsShortcut),
      matchesDanmakuShortcut: (event) =>
        (IS_YOUTUBE || isBilibiliVideoPage()) &&
        matchesShortcut(event, state.danmakuShortcut),
      matchesScreenshotShortcut: (event) =>
        state.screenshotEnabled &&
        matchesShortcut(event, state.screenshotShortcut),
      screenshot: savePipScreenshot,
      formatTime,
      resize: resizePipWindow,
    },
    video,
  );
}
// ── 搬元素生命週期 ──
function stashSourceVideo() {
  const video = state.sourceVideo;
  if (!video) return;
  const rect = video.getBoundingClientRect();
  const parent = video.parentNode;
  state.videoStash = {
    parent,
    next: video.nextSibling,
    inlineStyle: video.style.cssText,
    controls: video.controls,
    placeholder: null,
  };
  if (rect.width > 0 && rect.height > 0 && parent) {
    const placeholder = video.ownerDocument.createElement("div");
    placeholder.setAttribute("aria-hidden", "true");
    const display = getComputedStyle(video).display;
    placeholder.style.display = display === "inline" ? "inline-block" : display;
    placeholder.style.width = `${rect.width}px`;
    placeholder.style.height = `${rect.height}px`;
    placeholder.style.flex = "0 0 auto";
    placeholder.style.pointerEvents = "none";
    parent.insertBefore(placeholder, video);
    state.videoStash.placeholder = placeholder;
  }
  video.controls = false;
}
function restoreSourceVideo() {
  const stash = state.videoStash;
  state.videoStash = null;
  if (!stash || !state.sourceVideo) return;
  stash.placeholder?.remove();
  state.sourceVideo.controls = stash.controls;
  state.sourceVideo.style.cssText = stash.inlineStyle;
  if (stash.parent?.isConnected) {
    stash.parent.insertBefore(
      state.sourceVideo,
      stash.next?.isConnected ? stash.next : null,
    );
  } else state.sourceVideo.remove();
}
function remountSourceVideo() {
  if (!state.pipUi || !state.sourceVideo) return;
  const wasPlaying = !state.sourceVideo.paused;
  stashSourceVideo();
  state.pipUi.screen.append(state.sourceVideo);
  state.sourceVideo.style.cssText = "";
  suppressNativeCaptions();
  PipAudio.start(state.sourceVideo, state.pipWindow);
  if (wasPlaying) void state.sourceVideo.play().catch(() => {});
}
function releasePipVideo() {
  PipAudio.stop();
  restoreNativeCaptionModes();
  restoreSourceVideo();
}
function resumePlayback() {
  if (!state.pipUi) return;
  void state.pipUi.video.play().catch(() => {});
}
function bindSourceVideo(video: HTMLVideoElement) {
  if (state.pipWindow && state.videoStash) restoreSourceVideo();
  state.sourceAbort?.abort();
  state.sourceAbort = new AbortController();
  state.sourceVideo = video;
  const signal = state.sourceAbort.signal;
  setDanmakuPlaybackRate(video.playbackRate);
  setDanmakuPaused(video.paused);
  const sync = () => {
    updatePlaybackUi();
    refreshSubtitle();
  };
  const resetPipAudioToNative = () => {
    if (!PipAudio.isActiveFor(video)) return;
    PipAudio.resetToNative(video);
    updatePlaybackUi();
  };
  const syncVolume = () => {
    PipAudio.syncNativeVolume(video);
    sync();
  };
  const isNativeVolumeControl = (target: EventTarget | null) =>
    Boolean(
      target instanceof Element &&
      target.closest(".ytp-volume-panel, .ytp-mute-button"),
    );
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (isNativeVolumeControl(e.target)) resetPipAudioToNative();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "wheel",
    (e) => {
      if (isNativeVolumeControl(e.target)) resetPipAudioToNative();
    },
    { capture: true, passive: true, signal },
  );
  document.addEventListener(
    "keydown",
    (e) => {
      const target = e.target as Element;
      const activeElement = document.activeElement;
      if (
        !["ArrowUp", "ArrowDown", "m"].includes(e.key.toLowerCase()) ||
        (!target?.closest?.("#movie_player") &&
          !activeElement?.closest?.("#movie_player"))
      )
        return;
      resetPipAudioToNative();
    },
    { capture: true, signal },
  );
  video.addEventListener(
    "play",
    () => {
      sync();
      setDanmakuPaused(false);
    },
    { signal },
  );
  video.addEventListener(
    "pause",
    () => {
      sync();
      setDanmakuPaused(true);
    },
    { signal },
  );
  video.addEventListener(
    "ratechange",
    () => setDanmakuPlaybackRate(video.playbackRate),
    { signal },
  );
  for (const eventName of [
    "timeupdate",
    "durationchange",
    "seeked",
    "ratechange",
  ]) {
    video.addEventListener(eventName, sync, { signal });
  }
  video.addEventListener("volumechange", syncVolume, { signal });
  const trackList = video.textTracks;
  const syncCaptions = () => syncNativeCaptions();
  trackList.addEventListener("change", syncCaptions, { signal });
  trackList.addEventListener("removetrack", syncCaptions, { signal });
  trackList.addEventListener(
    "addtrack",
    (e) => {
      e.track?.addEventListener("cuechange", syncCaptions, { signal });
      syncCaptions();
    },
    { signal },
  );
  for (const track of trackList) {
    track.addEventListener("cuechange", syncCaptions, { signal });
  }
  updatePlaybackUi();
  refreshSubtitle(true);
  if (state.pipWindow) remountSourceVideo();
}
function closePiP(closeWindow: boolean) {
  const oldWindow = state.pipWindow;
  window.clearTimeout(state.feedbackTimer);
  state.feedbackTimer = 0;
  window.clearTimeout(state.nextClickTimer);
  state.nextClickTimer = 0;
  state.nextClickPending = false;
  state.pipWindow = null;
  state.pipUi = null;
  state.captionObserver?.disconnect();
  state.captionObserver = null;
  state.captionNode = null;
  state.captionExtract = null;
  state.captionLines = [];
  destroyDanmakuInPip();
  releasePipVideo();
  if (closeWindow && oldWindow && !oldWindow.closed) oldWindow.close();
}
async function openPiP() {
  if (state.opening) return { ok: false, message: "浮窗正在開啟" };
  if (!state.sourceVideo) return { ok: false, message: "請先開啟有影片的頁面" };
  if (state.pipWindow && !state.pipWindow.closed) {
    state.pipWindow.focus();
    return { ok: true };
  }
  state.opening = true;
  const openingVideo = state.sourceVideo;
  try {
    const documentPip = getDocumentPip();
    if (!documentPip) throw new Error("Document PiP unavailable");
    PipAudio.prepare();
    const windowPromise = documentPip.requestWindow({
      width: 640,
      height: 360,
    });
    const nextWindow = await windowPromise;
    if (state.sourceVideo !== openingVideo) {
      nextWindow.close();
      throw new Error("source changed");
    }
    state.pipWindow = nextWindow;
    nextWindow.addEventListener(
      "pagehide",
      () => {
        if (state.pipWindow === nextWindow) closePiP(false);
      },
      { once: true },
    );
    state.pipUi = createPipUi(nextWindow, openingVideo);
    if (state.sourceVideo !== openingVideo) throw new Error("source changed");
    remountSourceVideo();
    if (IS_YOUTUBE || IS_BILIBILI) initDanmakuInPip(nextWindow, openingVideo);
    refreshSubtitle(true);
    updatePlaybackUi();
    if (!state.sourceVideo.paused) resumePlayback();
    return { ok: true };
  } catch (error) {
    if (state.pipWindow) closePiP(true);
    const gestureRequired =
      error instanceof DOMException && error.name === "NotAllowedError";
    return {
      ok: false,
      message: gestureRequired
        ? "Chrome 要求在頁面上操作；請關閉選單後按設定的快捷鍵。"
        : `此影片目前無法開啟浮窗（${error instanceof Error ? error.name : "unknown"}）`,
    };
  } finally {
    state.opening = false;
  }
}

// ── YouTube 控制列按鈕 ──
function ensureScreenshotButton(shortcut: Shortcut) {
  const rightControls = document.querySelector(".ytp-right-controls");
  if (!rightControls) return;

  const shortcutText = formatShortcut(shortcut);
  const tooltipText = `截圖 (${shortcutText})`;
  const existing = rightControls.querySelector(".yt-pip-screenshot-btn");
  if (existing) {
    if (existing.getAttribute("data-shortcut") === shortcutText) return;
    existing.remove();
  }

  const btn = document.createElement("button");
  btn.className = "ytp-button yt-pip-screenshot-btn";
  btn.type = "button";
  btn.setAttribute("aria-label", tooltipText);
  btn.setAttribute("data-tooltip-title", tooltipText);
  btn.setAttribute("data-title-no-tooltip", "截圖");
  btn.setAttribute("aria-keyshortcuts", formatShortcut(shortcut, true));
  btn.setAttribute("data-shortcut", shortcutText);

  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("fill", "currentColor");
  path.setAttribute(
    "d",
    "M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z",
  );
  svg.appendChild(path);
  btn.appendChild(svg);

  btn.addEventListener("click", () => savePipScreenshot());

  const tooltip = document.createElement("div");
  tooltip.className = "yt-pip-screenshot-tooltip";
  tooltip.textContent = tooltipText;
  btn.appendChild(tooltip);
  btn.addEventListener("pointerenter", () => tooltip.classList.add("show"));
  btn.addEventListener("pointerleave", () => tooltip.classList.remove("show"));

  const anchor =
    rightControls.querySelector(".yt-floating-comments-btn") ??
    rightControls.querySelector(".ytp-subtitles-button");
  if (anchor) anchor.after(btn);
  else rightControls.appendChild(btn);
}
// ── 掃描迴圈 / 啟動 ──
function scanPage() {
  if (IS_YOUTUBE) {
    if (state.commentsEnabled)
      ensureFloatingCommentsButton(state.commentsShortcut);
    else document.querySelector(".yt-floating-comments-btn")?.remove();
    if (state.screenshotEnabled)
      ensureScreenshotButton(state.screenshotShortcut);
    else document.querySelector(".yt-pip-screenshot-btn")?.remove();
    if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) {
      const comments =
        document.querySelector("#comments") ||
        document.querySelector("ytd-comments");
      if (comments) ensureFloatingCommentsCloseButton(comments);
    }
  }
  const found = findVideo();
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
  if (!video) {
    if (state.sourceVideo && !state.sourceVideo.isConnected) {
      closePiP(true);
      state.sourceAbort?.abort();
      state.sourceAbort = null;
      state.sourceVideo = null;
    }
    return;
  }
  if (video !== state.sourceVideo) bindSourceVideo(video);
  if (IS_BILIBILI) checkAndBindBilibiliDanmaku(state.sourceVideo);
  refreshSubtitle();
  updatePlaybackUi();
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
    const comments =
      document.querySelector("#comments") ||
      document.querySelector("ytd-comments");
    const toggleBtn = document.querySelector(".yt-floating-comments-btn");
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
