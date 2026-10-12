"use strict";

globalThis.PipCompanion.ContentPipLifecycle = (() => {
  const t = globalThis.PipCompanion.util.getMessage;
  let boundsTimer = 0;
  let boundsDebounceTimer = 0;
  let boundsSavePromise: Promise<void> | null = null;
  let pendingBounds: {
    win: Window;
    innerWidth: number;
    left: number;
    top: number;
    width: number;
    height: number;
    signature: string;
  } | null = null;
  let lastSavedBounds = "";
  const PIP_BOUNDS_POLL_MS = 1000;
  const PIP_BOUNDS_SAVE_DEBOUNCE_MS = 1200;
  let cachedPipSize: { width: number; height: number } | null = null;

  function loadCachedPipSize() {
    void chrome.runtime
      .sendMessage({ type: "GET_PIP_BOUNDS" } satisfies ExtensionMessage)
      .then((result) => {
        if (
          result?.ok === true &&
          typeof result.width === "number" &&
          typeof result.height === "number"
        )
          cachedPipSize = { width: result.width, height: result.height };
      })
      .catch(() => {});
  }

  function notifyPipState(pipOpen: boolean, playing = true) {
    try {
      if (!chrome.runtime?.id) return;
      void chrome.runtime
        .sendMessage({
          type: "PIP_STATE_CHANGED",
          pipOpen,
          playing,
        } satisfies ExtensionMessage)
        .catch(() => {});
    } catch {
      // 擴充插件在重新載入或關閉期間可能失效
    }
  }

  function notifySourcePlayback(playing: boolean) {
    if (!state.pipWindow || !chrome.runtime?.id) return;
    void chrome.runtime
      .sendMessage({
        type: "PIP_SOURCE_PLAYBACK_CHANGED",
        playing,
      } satisfies ExtensionMessage)
      .catch(() => {});
  }

  function observePipBounds(win: Window) {
    if (win.closed) return;
    const bounds = {
      win,
      innerWidth: win.innerWidth,
      left: win.screenX,
      top: win.screenY,
      width: win.outerWidth,
      height: win.outerHeight,
    };
    const signature = [
      bounds.left,
      bounds.top,
      bounds.width,
      bounds.height,
    ].join(":");

    if (signature === lastSavedBounds) {
      pendingBounds = null;
      window.clearTimeout(boundsDebounceTimer);
      boundsDebounceTimer = 0;
      return;
    }

    pendingBounds = { ...bounds, signature };
    window.clearTimeout(boundsDebounceTimer);
    boundsDebounceTimer = window.setTimeout(() => {
      boundsDebounceTimer = 0;
      void flushPipBounds();
    }, PIP_BOUNDS_SAVE_DEBOUNCE_MS);
  }

  async function flushPipBounds(force = false, win?: Window) {
    window.clearTimeout(boundsDebounceTimer);
    boundsDebounceTimer = 0;
    if (force && win && !win.closed) {
      const bounds = {
        win,
        innerWidth: win.innerWidth,
        left: win.screenX,
        top: win.screenY,
        width: win.outerWidth,
        height: win.outerHeight,
      };
      pendingBounds = {
        ...bounds,
        signature: [bounds.left, bounds.top, bounds.width, bounds.height].join(
          ":",
        ),
      };
    }

    while (boundsSavePromise) await boundsSavePromise;
    if (!force && boundsDebounceTimer) return;
    const latest = pendingBounds;
    if (!latest || latest.win.closed) return;
    if (!force && latest.signature === lastSavedBounds) {
      pendingBounds = null;
      return;
    }
    pendingBounds = null;

    const savePromise = (async () => {
      try {
        const result = await chrome.runtime.sendMessage({
          type: "SAVE_PIP_BOUNDS",
          innerWidth: latest.innerWidth,
          left: latest.left,
          top: latest.top,
          width: latest.width,
          height: latest.height,
        } satisfies ExtensionMessage);
        if (result?.ok) {
          lastSavedBounds = latest.signature;
          cachedPipSize = { width: latest.width, height: latest.height };
        }
      } catch {
        // PiP 視窗關閉或擴充功能重新載入時，忽略暫存失敗。
      }
    })();
    boundsSavePromise = savePromise;
    try {
      await savePromise;
    } finally {
      if (boundsSavePromise === savePromise) boundsSavePromise = null;
    }
  }

  function startPipBoundsTracking(win: Window) {
    window.clearInterval(boundsTimer);
    window.clearTimeout(boundsDebounceTimer);
    boundsTimer = window.setInterval(
      () => observePipBounds(win),
      PIP_BOUNDS_POLL_MS,
    );
    observePipBounds(win);
  }

  async function restorePipBounds(win = state.pipWindow) {
    if (!win || win.closed) return { ok: false };
    let result: { ok?: boolean; missing?: boolean } = { ok: false };
    for (let attempt = 0; attempt < 6; attempt++) {
      try {
        result = await chrome.runtime.sendMessage({
          type: "RESTORE_PIP_BOUNDS",
          innerWidth: win.innerWidth,
        } satisfies ExtensionMessage);
      } catch {
        result = { ok: false };
      }
      if (result.ok || result.missing) break;
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
    if (result.ok || result.missing) startPipBoundsTracking(win);
    return result;
  }

  function createPipUi(win: Window, video: HTMLVideoElement) {
    const ui = globalThis.PipCompanion.PipUI.create(
      win,
      {
        volumeIconPath:
          globalThis.PipCompanion.ContentPlayback.VOLUME_ICON_PATH,
        getVideo: () => state.sourceVideo,
        getSeekSeconds: () => state.seekSeconds,
        updatePlaybackUi:
          globalThis.PipCompanion.ContentPlayback.updatePlaybackUi,
        togglePlayback: globalThis.PipCompanion.ContentPlayback.togglePlayback,
        adjustPlaybackRate:
          globalThis.PipCompanion.ContentPlayback.adjustPlaybackRate,
        togglePlaybackRate:
          globalThis.PipCompanion.ContentPlayback.togglePlaybackRate,
        cancelNextPlaybackRestore:
          globalThis.PipCompanion.ContentPlayback.cancelNextPlaybackRestore,
        toggleMute: globalThis.PipCompanion.ContentPlayback.toggleMute,
        playNext: globalThis.PipCompanion.ContentPlayback.playNextVideo,
        getPlaylist: globalThis.PipCompanion.ContentPlayback.getPlaylist,
        selectPlaylistItem:
          globalThis.PipCompanion.ContentPlayback.selectPlaylistItem,
        setVolume:
          globalThis.PipCompanion.ContentPlayback.setSourceVolumePercent,
        getMaxVolume: () =>
          globalThis.PipCompanion.PipAudio.maxVolume(state.sourceVideo),
        showFeedback: globalThis.PipCompanion.ContentFeedback.showFeedback,
        showVolumeFeedback:
          globalThis.PipCompanion.ContentFeedback.showVolumeFeedback,
        showFrameStepIcon:
          globalThis.PipCompanion.ContentFeedback.showFrameStepIcon,
        getVolumePercent:
          globalThis.PipCompanion.ContentPlayback.getSourceVolumePercent,
        toggleCaptions: globalThis.PipCompanion.ContentPlayback.toggleCaptions,
        toggleComments: toggleFloatingComments,
        toggleDanmaku:
          globalThis.PipCompanion.ContentPlayback.toggleDanmakuFromShortcut,
        canSendDanmaku:
          globalThis.PipCompanion.ContentPlatform.getCapabilities().danmakuSend,
        getDanmakuCharacterLimit:
          globalThis.PipCompanion.ContentDanmakuSender.getCharacterLimit,
        sendDanmaku: globalThis.PipCompanion.ContentDanmakuSender.send,
        matchesCommentsShortcut: (e) =>
          state.commentsEnabled &&
          matchesShortcut(e, state.shortcuts.commentsShortcut),
        matchesDanmakuShortcut: (e) =>
          state.danmakuEnabled &&
          isDanmakuEnabled() &&
          (IS_YOUTUBE ||
            IS_BILIBILI ||
            globalThis.PipCompanion.site.isTwitchHost(location.hostname) ||
            globalThis.PipCompanion.site.isBahamutHost(location.hostname)) &&
          matchesShortcut(e, state.shortcuts.danmakuShortcut),
        matchesScreenshotShortcut: (e) =>
          state.screenshotEnabled &&
          matchesShortcut(e, state.shortcuts.screenshotShortcut),
        matchesLaunchShortcut: (e) =>
          matchesShortcut(e, state.shortcuts.launchShortcut),
        matchesShortcut: (e, key) =>
          globalThis.PipCompanion.util.matchesShortcut(e, state.shortcuts[key]),
        matchesWheelShortcut: (e) =>
          globalThis.PipCompanion.util.matchesWheelShortcut(
            e,
            state.shortcuts.pipResizeShortcut,
          ),
        getShortcut: (key) => state.shortcuts[key],
        closePip: () => closePiP(true),
        screenshot: globalThis.PipCompanion.ContentScreenshot.savePipScreenshot,
        formatTime: globalThis.PipCompanion.util.formatTime,
        getStoryboardFrame: (seconds) =>
          globalThis.PipCompanion.ContentStoryboard.getFrame(
            seconds,
            state.sourceVideo,
          ),
        resize: globalThis.PipCompanion.ContentPlayback.resizePipWindow,
      },
      video,
    );
    ui.setDanmakuEnabled(state.danmakuEnabled);
    return ui;
  }

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
      placeholder.style.display =
        display === "inline" ? "inline-block" : display;
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
    const video = state.sourceVideo;
    if (!stash) return true;
    if (!video) return false;
    stash.placeholder?.remove();
    video.controls = stash.controls;
    video.style.cssText = stash.inlineStyle;
    // 網站已移除的來源不要放回播放器，避免復活失效元素。
    if (stash.parent?.isConnected && video.isConnected) {
      const next = stash.next?.parentNode === stash.parent ? stash.next : null;
      try {
        stash.parent.insertBefore(video, next);
      } catch (error) {
        const fallback = document.body ?? document.documentElement;
        if (!fallback) {
          console.warn("[Caption PiP] Could not restore source video:", error);
          return false;
        }
        try {
          fallback.append(video);
        } catch (fallbackError) {
          console.warn(
            "[Caption PiP] Could not restore source video:",
            fallbackError,
          );
          return false;
        }
      }
    } else video.remove();
    state.videoStash = null;
    return true;
  }

  function remountSourceVideo() {
    if (!state.pipUi || !state.sourceVideo) return;
    const wasPlaying = !state.sourceVideo.paused;
    globalThis.PipCompanion.ContentCaptions.prepareNativeCaptions();
    stashSourceVideo();
    state.pipUi.screen.append(state.sourceVideo);
    state.sourceVideo.style.cssText = "";
    globalThis.PipCompanion.ContentCaptions.prepareNativeCaptions();
    globalThis.PipCompanion.PipAudio.start(state.sourceVideo, state.pipWindow);
    if (wasPlaying) void state.sourceVideo.play().catch(() => {});
  }

  function showPipWaiting(win: Window) {
    const doc = win.document;
    doc.title = t("pipSearchingTitle");
    const style = doc.createElement("style");
    style.textContent =
      "html,body{width:100%;height:100%;margin:0;background:#111;color:#fff;font:16px system-ui,sans-serif}body{display:grid;place-items:center}";
    doc.head.replaceChildren(style);
    const root = doc.body ?? doc.documentElement;
    const message = doc.createElement("div");
    message.setAttribute("role", "status");
    message.textContent = t("pipSearching");
    root.append(message);
  }

  function mountPipVideo(win: Window, video: HTMLVideoElement) {
    const session = state.pipSession;
    if (
      session.phase !== "waiting" ||
      session.window !== win ||
      state.sourceVideo !== video
    )
      return;
    if (session.waitTimer !== null) window.clearTimeout(session.waitTimer);
    state.pipSession = {
      phase: "active",
      window: win,
      ui: createPipUi(win, video),
    };
    globalThis.PipCompanion.ContentCaptions.initializeCaptionsOn();
    remountSourceVideo();
    initDanmakuInPip(win, video);
    globalThis.PipCompanion.ContentCaptions.refreshSubtitle(true);
    globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
    if (!video.paused) resumePlayback();
  }

  function releasePipVideo() {
    try {
      globalThis.PipCompanion.PipAudio.stop();
    } catch (error) {
      console.warn("[Caption PiP] Could not stop PiP audio:", error);
    }
    let videoRestored = false;
    try {
      videoRestored = restoreSourceVideo();
    } catch (error) {
      console.warn("[Caption PiP] Could not restore source video:", error);
    }
    try {
      globalThis.PipCompanion.ContentCaptions.restoreNativeCaptionModes();
    } catch (error) {
      console.warn("[Caption PiP] Could not restore native captions:", error);
    }
    return videoRestored;
  }

  function resumePlayback() {
    if (!state.pipUi) return;
    void state.pipUi.video.play().catch(() => {});
  }

  function bindSourceVideo(video: HTMLVideoElement) {
    if (state.sourceVideo !== video)
      globalThis.PipCompanion.ContentStoryboard.reset();
    if (state.pipWindow && state.videoStash) restoreSourceVideo();
    state.sourceAbort?.abort();
    state.sourceAbort = new AbortController();
    state.sourceVideo = video;
    const signal = state.sourceAbort.signal;
    setDanmakuPlaybackRate(video.playbackRate);
    setDanmakuPaused(video.paused);

    const sync = () => {
      globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
      globalThis.PipCompanion.ContentCaptions.refreshSubtitle();
    };
    const resetPipAudioToNative = () => {
      if (!globalThis.PipCompanion.PipAudio.isActiveFor(video)) return;
      globalThis.PipCompanion.PipAudio.resetToNative(video);
      globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
    };
    const syncVolume = () => {
      globalThis.PipCompanion.PipAudio.syncNativeVolume(video);
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
        const target = e.target;
        const activeElement = document.activeElement;
        if (
          !["ArrowUp", "ArrowDown", "m"].includes(e.key.toLowerCase()) ||
          (!(target instanceof Element && target.closest("#movie_player")) &&
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
        notifySourcePlayback(true);
      },
      { signal },
    );

    video.addEventListener(
      "pause",
      () => {
        sync();
        setDanmakuPaused(true);
        notifySourcePlayback(false);
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
    const syncCaptions = () =>
      globalThis.PipCompanion.ContentCaptions.syncNativeCaptions();
    trackList.addEventListener("change", syncCaptions, { signal });
    trackList.addEventListener("removetrack", syncCaptions, { signal });
    trackList.addEventListener(
      "addtrack",
      (e) => {
        e.track?.addEventListener("cuechange", syncCaptions, { signal });
        if (state.pipUi && state.captionsOn)
          globalThis.PipCompanion.ContentCaptions.prepareNativeCaptions();
        syncCaptions();
      },
      { signal },
    );
    for (const track of trackList) {
      track.addEventListener("cuechange", syncCaptions, { signal });
    }

    globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
    globalThis.PipCompanion.ContentCaptions.refreshSubtitle(true);
    globalThis.PipCompanion.ContentStoryboard.preload(video);
    if (state.pipWindow) {
      if (state.pipUi) remountSourceVideo();
      else mountPipVideo(state.pipWindow, video);
      globalThis.PipCompanion.ContentPlayback.applyPendingNextPlaybackState(
        video,
      );
    }
    state.nextVideoRequested = false;
  }

  function closePiP(closeWindow: boolean) {
    globalThis.PipCompanion.ContentPlayback.cancelNextVideoRequest();
    const session = state.pipSession;
    const oldWindow =
      session.phase === "waiting" || session.phase === "active"
        ? session.window
        : null;
    if (session.phase === "waiting" && session.waitTimer !== null)
      window.clearTimeout(session.waitTimer);
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = 0;
    window.clearTimeout(state.nextClickTimer);
    state.nextClickTimer = 0;
    state.nextClickPending = false;
    try {
      destroyDanmakuInPip();
    } catch (error) {
      console.warn("[Caption PiP] Could not destroy PiP danmaku:", error);
    }
    window.clearInterval(boundsTimer);
    boundsTimer = 0;
    window.clearTimeout(boundsDebounceTimer);
    boundsDebounceTimer = 0;
    const boundsSave =
      oldWindow && !oldWindow.closed
        ? flushPipBounds(true, oldWindow)
        : Promise.resolve();
    const videoRestored = releasePipVideo();
    if (!videoRestored && closeWindow && oldWindow && !oldWindow.closed) return;

    state.pipSession = { phase: "closed" };
    state.captionObserver?.disconnect();
    state.captionObserver = null;
    state.captionNode = null;
    state.captionExtract = null;
    state.captionLines = [];
    try {
      globalThis.PipCompanion.ContentStoryboard.reset();
    } catch (error) {
      console.warn("[Caption PiP] Could not reset storyboard:", error);
    }
    if (oldWindow && !oldWindow.closed) {
      void boundsSave.finally(() => {
        notifyPipState(false);
        if (!closeWindow) return;
        try {
          if (!oldWindow.closed) oldWindow.close();
        } catch (error) {
          console.warn("[Caption PiP] Could not close PiP window:", error);
        }
      });
    } else if (oldWindow) notifyPipState(false);
  }

  async function openPiP(): Promise<PipOperationResult> {
    if (state.pipSession.phase === "opening")
      return { ok: false, message: t("pipOpening") };
    if (state.pipWindow && !state.pipWindow.closed) {
      try {
        state.pipWindow.focus();
        return { ok: true };
      } catch {
        return {
          ok: false,
          message: t("pipCannotFocus"),
        };
      }
    }
    state.pipSession = { phase: "opening" };
    const openingVideo = state.sourceVideo;

    try {
      const documentPip = globalThis.PipCompanion.ContentVideo.getDocumentPip();
      if (!documentPip) throw new Error("Document PiP unavailable");
      globalThis.PipCompanion.PipAudio.prepare();
      const windowPromise = documentPip.requestWindow({
        width: cachedPipSize?.width ?? 640,
        height: cachedPipSize?.height ?? 360,
      });
      const nextWindow = await windowPromise;
      if (openingVideo && state.sourceVideo !== openingVideo) {
        nextWindow.close();
        throw new Error("source changed");
      }
      state.pipSession = {
        phase: "waiting",
        window: nextWindow,
        waitTimer: null,
      };
      nextWindow.addEventListener(
        "pagehide",
        () => {
          if (state.pipWindow === nextWindow) closePiP(false);
        },
        { once: true },
      );

      await restorePipBounds(nextWindow);
      if (state.sourceVideo) mountPipVideo(nextWindow, state.sourceVideo);
      else {
        showPipWaiting(nextWindow);
        const waitTimer = window.setTimeout(() => {
          const session = state.pipSession;
          if (
            session.phase !== "waiting" ||
            session.window !== nextWindow ||
            session.waitTimer !== waitTimer
          )
            return;
          closePiP(true);
          globalThis.PipCompanion.ContentFeedback.showPageToast(
            t("pipVideoNotFound"),
          );
        }, 10000);
        state.pipSession = {
          phase: "waiting",
          window: nextWindow,
          waitTimer,
        };
      }
      notifyPipState(true, !state.sourceVideo?.paused);
      notifySourcePlayback(!state.sourceVideo?.paused);
      return { ok: true };
    } catch (error) {
      if (state.pipWindow) closePiP(true);
      else state.pipSession = { phase: "closed" };
      const gestureRequired =
        error instanceof DOMException && error.name === "NotAllowedError";
      const sourceChanged =
        error instanceof Error && error.message === "source changed";
      if (!gestureRequired && !sourceChanged)
        console.warn("[Caption PiP] Could not open PiP:", error);
      return {
        ok: false,
        message: gestureRequired ? t("pipGestureRequired") : t("pipCannotOpen"),
        ...(gestureRequired ? { code: "GESTURE_REQUIRED" as const } : {}),
      };
    } finally {
      if (state.pipSession.phase === "opening")
        state.pipSession = { phase: "closed" };
    }
  }

  loadCachedPipSize();

  return {
    bindSourceVideo,
    closePiP,
    openPiP,
    restorePipBounds,
  };
})();
