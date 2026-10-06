"use strict";
const SHORTCUT_KEY = "launchShortcut";
const DEFAULT_SHORTCUT = {
  code: "KeyP",
  ctrl: false,
  alt: true,
  shift: true,
  meta: false,
};
const VIDEO_SELECTOR = "video.html5-main-video";
const CAPTION_SELECTOR = ".ytp-caption-window-container";
const VOLUME_ICON_PATH =
  "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-3-4.24v8.47a4.5 4.5 0 0 0 3-4.23z";
const MUTED_VOLUME_ICON_PATH =
  "M3 9v6h4l5 5V4L7 9H3z M15.5 9.4 16.9 8l2.6 2.6L22.1 8l1.4 1.4-2.6 2.6 2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6z";
const PLAYBACK_RATES = [
  0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75, 4,
  4.25, 4.5, 4.75, 5,
];
const PipAudio = globalThis.CaptionPiP.PipAudio;
const PipUI = globalThis.CaptionPiP.PipUI;
let launchShortcut = { ...DEFAULT_SHORTCUT };
let sourceVideo = null;
let sourceAbort = null;
let captureAbort = null;
let capturedStream = null;
let pipWindow = null;
let pipUi = null;
let captionNode = null;
let captionObserver = null;
let captionLines = [];
let opening = false;
let volumeFeedbackTimer = 0;
void loadShortcut();
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes[SHORTCUT_KEY]) {
    launchShortcut = normalizeShortcut(changes[SHORTCUT_KEY].newValue);
  }
});
function normalizeShortcut(value) {
  if (!value || typeof value !== "object") return { ...DEFAULT_SHORTCUT };
  const shortcut = value;
  return {
    code:
      typeof shortcut.code === "string" ? shortcut.code : DEFAULT_SHORTCUT.code,
    ctrl:
      typeof shortcut.ctrl === "boolean"
        ? shortcut.ctrl
        : DEFAULT_SHORTCUT.ctrl,
    alt:
      typeof shortcut.alt === "boolean" ? shortcut.alt : DEFAULT_SHORTCUT.alt,
    shift:
      typeof shortcut.shift === "boolean"
        ? shortcut.shift
        : DEFAULT_SHORTCUT.shift,
    meta:
      typeof shortcut.meta === "boolean"
        ? shortcut.meta
        : DEFAULT_SHORTCUT.meta,
  };
}
async function loadShortcut() {
  try {
    const stored = await chrome.storage.local.get(SHORTCUT_KEY);
    launchShortcut = normalizeShortcut(stored[SHORTCUT_KEY]);
  } catch {
    launchShortcut = { ...DEFAULT_SHORTCUT };
  }
}
function onPageKeyDown(event) {
  const target = event.target;
  if (
    !sourceVideo ||
    event.repeat ||
    event.isComposing ||
    (target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.closest("input, textarea, select, [contenteditable='true']")))
  )
    return;
  const isAltC =
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "c" || event.code === "KeyC");
  if (isAltC) {
    event.preventDefault();
    event.stopPropagation();
    toggleFloatingComments();
    return;
  }
  const isAltP =
    event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey &&
    (event.key.toLowerCase() === "p" || event.code === "KeyP");
  if (isAltP) {
    event.preventDefault();
    event.stopPropagation();
    savePipScreenshot();
    return;
  }
  if (
    event.code !== launchShortcut.code ||
    event.ctrlKey !== launchShortcut.ctrl ||
    event.altKey !== launchShortcut.alt ||
    event.shiftKey !== launchShortcut.shift ||
    event.metaKey !== launchShortcut.meta
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  void openPiP();
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
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remainder = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}
function getDocumentPip() {
  return window.documentPictureInPicture ?? null;
}
function extractCaptionLines(node) {
  if (!node) return [];

  const allWindows = Array.from(
    node.querySelectorAll("[class*='caption-window']"),
  );
  const visibleWindows = allWindows.filter(
    (w) =>
      w.style.display !== "none" &&
      w.style.visibility !== "hidden" &&
      w.getAttribute("aria-hidden") !== "true",
  );
  const activeTarget = visibleWindows.length
    ? visibleWindows[visibleWindows.length - 1]
    : node;

  const rawLines = Array.from(
    activeTarget.querySelectorAll(".caption-visual-line"),
  );
  let candidateLines = [];

  if (rawLines.length) {
    candidateLines = rawLines.map((line) => {
      const segs = Array.from(line.querySelectorAll(".ytp-caption-segment"));
      return {
        segments: segs
          .map((s) => ({
            text: s.textContent || "",
            color: s.style.color || "",
            bg: s.style.backgroundColor || s.style.background || "",
            fontFamily: s.style.fontFamily || "",
            textShadow: s.style.textShadow || "",
          }))
          .filter((s) => s.text.trim().length > 0),
      };
    });
  } else {
    const segs = Array.from(
      activeTarget.querySelectorAll(".ytp-caption-segment"),
    );
    if (segs.length) {
      candidateLines = [
        {
          segments: segs
            .map((s) => ({
              text: s.textContent || "",
              color: s.style.color || "",
              bg: s.style.backgroundColor || s.style.background || "",
              fontFamily: s.style.fontFamily || "",
              textShadow: s.style.textShadow || "",
            }))
            .filter((s) => s.text.trim().length > 0),
        },
      ];
    }
  }

  const deduplicated = [];
  for (const line of candidateLines) {
    if (!line.segments.length) continue;
    const lineText = line.segments
      .map((s) => s.text)
      .join(" ")
      .trim();
    const prevText = deduplicated.length
      ? deduplicated[deduplicated.length - 1].segments
          .map((s) => s.text)
          .join(" ")
          .trim()
      : "";
    if (lineText && lineText !== prevText) {
      deduplicated.push(line);
    }
  }

  return deduplicated;
}
function refreshSubtitle() {
  if (!pipUi) {
    captionObserver?.disconnect();
    captionObserver = null;
    captionNode = null;
    captionLines = [];
    return;
  }
  const nextNode = document.querySelector(CAPTION_SELECTOR);
  if (nextNode !== captionNode) {
    captionObserver?.disconnect();
    captionObserver = null;
    captionNode = nextNode;
    if (captionNode) {
      captionObserver = new MutationObserver(() => {
        captionLines = extractCaptionLines(captionNode);
        renderSubtitle();
      });
      captionObserver.observe(captionNode, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }
  }
  captionLines = extractCaptionLines(captionNode);
  renderSubtitle();
}
function renderSubtitle() {
  if (!pipUi) return;
  pipUi.subtitle.replaceChildren();
  if (!captionLines.length) {
    pipUi.subtitle.hidden = true;
    return;
  }
  pipUi.subtitle.hidden = false;
  const doc = pipUi.subtitle.ownerDocument;
  for (const line of captionLines) {
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
    pipUi.subtitle.appendChild(lineEl);
  }
}
function showVolumeFeedback(text = "") {
  if (!pipUi || !sourceVideo) return;
  const isMuted = sourceVideo.muted || getSourceVolumePercent() === 0;
  pipUi.volumeFeedback.textContent =
    text ||
    (isMuted ? "靜音" : `音量 ${Math.round(getSourceVolumePercent())}%`);
  pipUi.volumeFeedback.hidden = false;
  window.clearTimeout(volumeFeedbackTimer);
  volumeFeedbackTimer = window.setTimeout(() => {
    if (pipUi) pipUi.volumeFeedback.hidden = true;
  }, 900);
}
function getYouTubePlayer() {
  return document.querySelector("#movie_player");
}
function savePipScreenshot() {
  const video =
    (sourceVideo?.videoWidth ? sourceVideo : null) ||
    (pipUi?.video?.videoWidth ? pipUi.video : null) ||
    document.querySelector(VIDEO_SELECTOR);
  if (!video || !video.videoWidth || !video.videoHeight) return;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const context = canvas.getContext("2d");
  if (!context) return;
  try {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const title =
      document.title
        .replace(/\s*[-–]\s*YouTube\s*$/i, "")
        .replace(/[\\/:*?"<>|]/g, "_")
        .trim()
        .slice(0, 80) || "YouTube";
    const now = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const filename = `${title}_${dateStr}.png`;
    const dataUrl = canvas.toDataURL("image/png");

    const downloadViaAnchor = () => {
      try {
        const link = document.createElement("a");
        link.href = dataUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch {}
    };

    try {
      chrome.runtime.sendMessage(
        {
          type: "SAVE_PIP_SCREENSHOT",
          dataUrl,
          filename,
        },
        (result) => {
          if (!result?.ok) downloadViaAnchor();
        },
      );
    } catch {
      downloadViaAnchor();
    }
    if (pipUi) {
      pipUi.volumeFeedback.textContent = "已截圖";
      pipUi.volumeFeedback.hidden = false;
      window.clearTimeout(volumeFeedbackTimer);
      volumeFeedbackTimer = window.setTimeout(() => {
        if (pipUi) pipUi.volumeFeedback.hidden = true;
      }, 900);
    }
  } catch {}
}
function getSourceVolumePercent() {
  return PipAudio.getVolumePercent(sourceVideo);
}
function setSourceVolumePercent(percent, unmute) {
  PipAudio.setVolumePercent(sourceVideo, percent, unmute, getYouTubePlayer());
  updatePlaybackUi();
}
function playNextYouTubeVideo() {
  const player = getYouTubePlayer();
  if (player?.nextVideo) {
    try {
      player.nextVideo();
      return;
    } catch {
      // Fall through to YouTube's visible next button.
    }
  }
  document.querySelector("#movie_player .ytp-next-button")?.click();
}
function updatePlaybackUi() {
  if (!sourceVideo || !pipUi) return;
  const player = getYouTubePlayer();
  let muted = sourceVideo.muted || sourceVideo.volume === 0;
  try {
    muted = muted || Boolean(player?.isMuted?.());
  } catch {
    // Use the media element mute state if YouTube's player API is unavailable.
  }
  pipUi.playButton.textContent = sourceVideo.paused ? "▶" : "Ⅱ";
  pipUi.playButton.setAttribute(
    "aria-label",
    sourceVideo.paused ? "播放影片" : "暫停影片",
  );
  const playbackRate = Math.round(sourceVideo.playbackRate * 100) / 100;
  const speedLabel = `${playbackRate}×`;
  pipUi.speedButton.textContent = speedLabel;
  pipUi.speedButton.setAttribute("aria-label", `播放速度 ${speedLabel}`);
  pipUi.speedSlider.value = String(playbackRate);
  pipUi.volumeButton.setAttribute("aria-label", muted ? "取消靜音" : "靜音");
  pipUi.volumePath.setAttribute(
    "d",
    muted ? MUTED_VOLUME_ICON_PATH : VOLUME_ICON_PATH,
  );
  pipUi.volumeSlider.value = String(Math.round(getSourceVolumePercent()));
  pipUi.volumeSlider.max = String(PipAudio.maxVolume(sourceVideo));
  if (pipUi.volumeValue.ownerDocument.activeElement !== pipUi.volumeValue) {
    pipUi.volumeValue.value = String(Math.round(getSourceVolumePercent()));
  }
  pipUi.timeLabel.textContent = `${formatTime(sourceVideo.currentTime)} / ${formatTime(sourceVideo.duration)}`;
  const duration = Number.isFinite(sourceVideo.duration)
    ? sourceVideo.duration
    : 0;
  const progressPercent =
    duration > 0 && Number.isFinite(sourceVideo.currentTime)
      ? Math.max(0, Math.min(100, (sourceVideo.currentTime / duration) * 100))
      : 0;
  pipUi.miniProgressFill.style.width = `${progressPercent}%`;
  pipUi.miniProgress.setAttribute(
    "aria-valuenow",
    String(Math.round(progressPercent)),
  );
  pipUi.progress.disabled = duration <= 0;
  pipUi.progress.setAttribute(
    "aria-valuetext",
    `${formatTime(sourceVideo.currentTime)} / ${formatTime(duration)}`,
  );
  if (pipUi.progress.ownerDocument.activeElement !== pipUi.progress) {
    pipUi.progress.value =
      duration > 0
        ? String(Math.round((sourceVideo.currentTime / duration) * 1000))
        : "0";
  }
  const nextButton = document.querySelector("#movie_player .ytp-next-button");
  pipUi.nextButton.disabled =
    !player?.nextVideo &&
    (!nextButton ||
      nextButton.disabled ||
      nextButton.getAttribute("aria-disabled") === "true");
}
function togglePlayback() {
  if (!sourceVideo) return;
  if (sourceVideo.paused) {
    void sourceVideo.play().catch(() => {});
  } else {
    sourceVideo.pause();
  }
}
function adjustPlaybackRate(direction, wrapAtEnd = false) {
  const video = sourceVideo;
  if (!video) return;
  let nextRate;
  if (direction > 0) {
    nextRate = PLAYBACK_RATES.find((rate) => rate > video.playbackRate + 0.001);
  } else {
    for (let index = PLAYBACK_RATES.length - 1; index >= 0; index--) {
      if (PLAYBACK_RATES[index] < video.playbackRate - 0.001) {
        nextRate = PLAYBACK_RATES[index];
        break;
      }
    }
  }
  if (nextRate === undefined) {
    nextRate = wrapAtEnd
      ? PLAYBACK_RATES[direction > 0 ? 0 : PLAYBACK_RATES.length - 1]
      : PLAYBACK_RATES[direction > 0 ? PLAYBACK_RATES.length - 1 : 0];
  }
  video.playbackRate = nextRate;
  updatePlaybackUi();
}
function toggleMute() {
  if (!sourceVideo) return;
  PipAudio.toggleMute(sourceVideo, getYouTubePlayer());
  updatePlaybackUi();
  showVolumeFeedback();
}
function toggleYouTubeSubtitles() {
  try {
    getYouTubePlayer()?.toggleSubtitles?.();
  } catch {
    // YouTube's player ignores caption toggles when no track is available.
  }
}
function resizePipWindow(innerWidth, width, height) {
  return chrome.runtime.sendMessage({
    type: "RESIZE_PIP_WINDOW",
    innerWidth,
    width,
    height,
  });
}
function createPipUi(win) {
  return PipUI.create(win, {
    volumeIconPath: VOLUME_ICON_PATH,
    getVideo: () => sourceVideo,
    updatePlaybackUi,
    togglePlayback,
    adjustPlaybackRate,
    toggleMute,
    playNext: playNextYouTubeVideo,
    setVolume: setSourceVolumePercent,
    getMaxVolume: () => PipAudio.maxVolume(sourceVideo),
    showFeedback: showVolumeFeedback,
    showVolumeFeedback,
    getVolumePercent: getSourceVolumePercent,
    toggleCaptions: toggleYouTubeSubtitles,
    toggleComments: toggleFloatingComments,
    screenshot: savePipScreenshot,
    formatTime,
    resize: resizePipWindow,
    playMirroredVideo,
  });
}
function stopCapturedStream() {
  captureAbort?.abort();
  captureAbort = null;
  pipUi?.video.pause();
  if (pipUi) pipUi.video.srcObject = null;
  PipAudio.stop();
  capturedStream?.getTracks().forEach((track) => track.stop());
  capturedStream = null;
}
function playMirroredVideo() {
  if (!pipUi) return;
  // PiP autoplay rejections are not actionable; avoid covering the video with a banner.
  void pipUi.video.play().catch(() => {});
}
function displayCapturedTracks(stream) {
  if (!pipUi) return;
  const videoTracks = stream.getVideoTracks();
  if (!videoTracks.length) {
    pipUi.video.srcObject = null;
    return;
  }
  pipUi.video.srcObject = new MediaStream(videoTracks);
  const triggerPlay = () => {
    if (sourceVideo && !sourceVideo.paused) {
      playMirroredVideo();
    }
  };
  pipUi.video.addEventListener("loadedmetadata", triggerPlay, { once: true });
  pipUi.video.addEventListener("canplay", triggerPlay, { once: true });
  triggerPlay();
}
function attachCapturedStream(stream) {
  stopCapturedStream();
  capturedStream = stream;
  for (const track of stream.getAudioTracks()) track.stop();
  captureAbort = new AbortController();
  const signal = captureAbort.signal;
  displayCapturedTracks(stream);
  if (sourceVideo) PipAudio.start(sourceVideo, pipWindow);
  updatePlaybackUi();
  stream.addEventListener("addtrack", () => displayCapturedTracks(stream), {
    signal,
  });
  stream.addEventListener("removetrack", () => displayCapturedTracks(stream), {
    signal,
  });
}
function startCapture(video) {
  if (!pipWindow || !pipUi) return;
  const captureable = video;
  if (!captureable.captureStream) throw new Error("captureStream unavailable");
  const stream = captureable.captureStream();
  if (!stream.getVideoTracks().length) {
    stream.getTracks().forEach((track) => track.stop());
    throw new Error("no video track");
  }
  attachCapturedStream(stream);
}
function bindSourceVideo(video) {
  sourceAbort?.abort();
  sourceAbort = new AbortController();
  sourceVideo = video;
  const signal = sourceAbort.signal;
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
  const isNativeVolumeControl = (target) =>
    Boolean(target?.closest?.(".ytp-volume-panel, .ytp-mute-button"));
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (isNativeVolumeControl(event.target)) resetPipAudioToNative();
    },
    { capture: true, signal },
  );
  document.addEventListener(
    "wheel",
    (event) => {
      if (isNativeVolumeControl(event.target)) resetPipAudioToNative();
    },
    { capture: true, passive: true, signal },
  );
  document.addEventListener(
    "keydown",
    (event) => {
      const target = event.target;
      const activeElement = document.activeElement;
      if (
        !["ArrowUp", "ArrowDown", "m"].includes(event.key.toLowerCase()) ||
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
      if (pipUi) playMirroredVideo();
    },
    { signal },
  );
  video.addEventListener(
    "pause",
    () => {
      sync();
      pipUi?.video.pause();
    },
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
  video.addEventListener(
    "emptied",
    () => {
      if (pipWindow) {
        stopCapturedStream();
      }
    },
    { signal },
  );
  const retryCapture = () => {
    if (!pipWindow || capturedStream) return;
    try {
      startCapture(video);
    } catch {}
  };
  video.addEventListener("loadedmetadata", retryCapture, { signal });
  video.addEventListener("canplay", retryCapture, { signal });
  if (pipWindow) {
    try {
      startCapture(video);
    } catch {}
  }
  updatePlaybackUi();
  refreshSubtitle();
}
function closePiP(closeWindow) {
  const oldWindow = pipWindow;
  window.clearTimeout(volumeFeedbackTimer);
  volumeFeedbackTimer = 0;
  pipWindow = null;
  pipUi = null;
  captionObserver?.disconnect();
  captionObserver = null;
  captionNode = null;
  captionLines = [];
  stopCapturedStream();
  if (closeWindow && oldWindow && !oldWindow.closed) oldWindow.close();
}
async function openPiP() {
  if (opening) return { ok: false, message: "浮窗正在開啟。" };
  if (!sourceVideo)
    return { ok: false, message: "請先開啟 YouTube 影片頁面。" };
  if (pipWindow && !pipWindow.closed) {
    pipWindow.focus();
    return { ok: true };
  }
  opening = true;
  let stream = null;
  const openingVideo = sourceVideo;
  try {
    const documentPip = getDocumentPip();
    if (!documentPip) throw new Error("Document PiP unavailable");
    const captureable = openingVideo;
    if (!captureable.captureStream)
      throw new Error("captureStream unavailable");
    stream = captureable.captureStream();
    if (!stream.getVideoTracks().length) throw new Error("no video track");
    PipAudio.prepare();
    const windowPromise = documentPip.requestWindow({
      width: 640,
      height: 360,
    });
    const nextWindow = await windowPromise;
    if (sourceVideo !== openingVideo) {
      nextWindow.close();
      throw new Error("source changed");
    }
    pipWindow = nextWindow;
    nextWindow.addEventListener(
      "pagehide",
      () => {
        if (pipWindow === nextWindow) closePiP(false);
      },
      { once: true },
    );
    pipUi = createPipUi(nextWindow);
    if (sourceVideo !== openingVideo) throw new Error("source changed");
    refreshSubtitle();
    attachCapturedStream(stream);
    stream = null;
    updatePlaybackUi();
    if (!sourceVideo.paused) {
      playMirroredVideo();
    }
    return { ok: true };
  } catch (error) {
    stream?.getTracks().forEach((track) => track.stop());
    if (pipWindow) closePiP(true);
    const gestureRequired =
      error instanceof DOMException && error.name === "NotAllowedError";
    return {
      ok: false,
      message: gestureRequired
        ? "Chrome 要求在 YouTube 頁面操作；請關閉選單後按設定的快捷鍵。"
        : "此影片目前無法開啟浮窗",
    };
  } finally {
    opening = false;
  }
}

function scanPage() {
  ensureFloatingCommentsButton();
  if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) {
    const comments =
      document.querySelector("#comments") ||
      document.querySelector("ytd-comments");
    if (comments) ensureFloatingCommentsCloseButton(comments);
  }
  const video = document.querySelector(VIDEO_SELECTOR);
  if (!video) {
    if (sourceVideo && !sourceVideo.isConnected) {
      closePiP(true);
      sourceAbort?.abort();
      sourceAbort = null;
      sourceVideo = null;
    }
    return;
  }
  if (video !== sourceVideo) bindSourceVideo(video);
  refreshSubtitle();
}
window.addEventListener("keydown", onPageKeyDown, true);
window.addEventListener("yt-navigate-finish", () => {
  toggleFloatingComments(false);
  scanPage();
});
window.addEventListener("yt-player-updated", scanPage);
window.setInterval(scanPage, 750);
window.addEventListener("resize", () => {
  if (document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) {
    updateFloatingCommentsDimensions();
  }
});
document.addEventListener(
  "pointerdown",
  (event) => {
    if (!document.body.classList.contains(FLOATING_COMMENTS_BODY_CLASS)) return;
    const comments =
      document.querySelector("#comments") ||
      document.querySelector("ytd-comments");
    const toggleBtn = document.querySelector(".yt-floating-comments-btn");
    const target = event.target;
    if (
      comments &&
      !comments.contains(target) &&
      (!toggleBtn || !toggleBtn.contains(target))
    ) {
      toggleFloatingComments(false);
    }
  },
  true,
);
scanPage();
