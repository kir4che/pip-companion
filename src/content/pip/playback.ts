"use strict";

globalThis.PipCompanion.ContentPlayback = (() => {
  const VOLUME_ICON_PATH =
    "M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-3-4.24v8.47a4.5 4.5 0 0 0 3-4.23z";
  const MUTED_VOLUME_ICON_PATH =
    "M3 9v6h4l5 5V4L7 9H3z M15.5 9.4 16.9 8l2.6 2.6L22.1 8l1.4 1.4-2.6 2.6 2.6 2.6-1.4 1.4-2.6-2.6-2.6 2.6-1.4-1.4 2.6-2.6z";
  const PLAYBACK_RATES = [
    0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 3.25, 3.5, 3.75,
    4, 4.25, 4.5, 4.75, 5,
  ];

  function getYouTubePlayer(): YouTubePlayer | null {
    return document.querySelector("#movie_player") as YouTubePlayer | null;
  }

  function getSourceVolumePercent() {
    return globalThis.PipCompanion.PipAudio.getVolumePercent(state.sourceVideo);
  }

  function setSourceVolumePercent(percent: number, unmute: boolean) {
    const video = state.sourceVideo;
    if (!video) return;
    if (
      percent > 100 &&
      state.pipWindow &&
      !globalThis.PipCompanion.PipAudio.isActiveFor(video) &&
      !globalThis.PipCompanion.PipAudio.start(video, state.pipWindow)
    )
      percent = 100;

    globalThis.PipCompanion.PipAudio.setVolumePercent(
      video,
      percent,
      unmute,
      getYouTubePlayer(),
    );
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
    state.pipUi.speedButton.setAttribute(
      "aria-label",
      `播放速度 ${speedLabel}`,
    );
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
    state.pipUi.volumeSlider.max = String(
      globalThis.PipCompanion.PipAudio.maxVolume(state.sourceVideo),
    );
    if (
      state.pipUi.volumeValue.ownerDocument.activeElement !==
      state.pipUi.volumeValue
    )
      state.pipUi.volumeValue.value = String(volumePercent);

    const duration = Number.isFinite(state.sourceVideo.duration)
      ? state.sourceVideo.duration
      : 0;
    const durationText = globalThis.PipCompanion.util.formatTime(duration);
    if (
      state.pipUi.timeCurrent.ownerDocument.activeElement !==
      state.pipUi.timeCurrent
    ) {
      const timeText = globalThis.PipCompanion.util.formatTime(
        state.sourceVideo.currentTime,
      );
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
      `${globalThis.PipCompanion.util.formatTime(state.sourceVideo.currentTime)} / ${globalThis.PipCompanion.util.formatTime(duration)}`,
    );
    if (
      state.pipUi.progress.ownerDocument.activeElement !== state.pipUi.progress
    ) {
      state.pipUi.progress.value =
        duration > 0
          ? String(
              Math.round((state.sourceVideo.currentTime / duration) * 1000),
            )
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
    globalThis.PipCompanion.ContentFeedback.showPlaybackFeedback(!willPlay);
  }

  function adjustPlaybackRate(direction: number) {
    const video = state.sourceVideo;
    if (!video) return;
    let nextRate;
    if (direction > 0)
      nextRate = PLAYBACK_RATES.find(
        (rate) => rate > video.playbackRate + 0.001,
      );
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
    globalThis.PipCompanion.PipAudio.toggleMute(
      state.sourceVideo,
      getYouTubePlayer(),
    );
    updatePlaybackUi();
    globalThis.PipCompanion.ContentFeedback.showVolumeFeedback();
  }

  function toggleCaptions() {
    state.captionsOn = !state.captionsOn;
    globalThis.PipCompanion.ContentCaptions.renderSubtitle();
    globalThis.PipCompanion.ContentFeedback.showFeedback(
      state.captionsOn ? "字幕: 開" : "字幕: 關",
    );
  }

  function toggleDanmakuWithFeedback() {
    globalThis.PipCompanion.ContentFeedback.showFeedback(
      toggleDanmaku() ? "彈幕: 開" : "彈幕: 關",
    );
  }

  function resizePipWindow(innerWidth: number, width: number, height: number) {
    return chrome.runtime.sendMessage({
      type: "RESIZE_PIP_WINDOW",
      innerWidth,
      width,
      height,
    });
  }

  return {
    VOLUME_ICON_PATH,
    getSourceVolumePercent,
    setSourceVolumePercent,
    playNextVideo,
    updatePlaybackUi,
    togglePlayback,
    adjustPlaybackRate,
    togglePlaybackRate,
    toggleMute,
    toggleCaptions,
    toggleDanmakuWithFeedback,
    resizePipWindow,
  };
})();
