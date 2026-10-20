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
  let hahowPipStream: MediaStream | null = null;
  let nativePipVideo: HTMLVideoElement | null = null;
  let nativePipRequest: Promise<unknown> | null = null;
  let nativePipPlaybackHandler: (() => void) | null = null;
  let nativePipLeaveHandler: (() => void) | null = null;
  let nativePipHandoff: Promise<void> | null = null;
  let suppressNativePipCloseNotification = false;
  let pipOperationGeneration = 0;
  let pipFrameVideo: HTMLVideoElement | null = null;
  let pipFrameCallbackId: number | null = null;
  let pipLastFrameAt = 0;
  let pipLastRecoveryAt = 0;
  const PIP_FRAME_STALL_MS = 2500;
  const PIP_FRAME_RECOVERY_COOLDOWN_MS = 4000;

  function stopPipFrameTracking() {
    if (pipFrameVideo && pipFrameCallbackId !== null) {
      try {
        pipFrameVideo.cancelVideoFrameCallback(pipFrameCallbackId);
      } catch {
        // 影片元素可能已被網站替換
      }
    }
    pipFrameVideo = null;
    pipFrameCallbackId = null;
    pipLastFrameAt = 0;
    pipLastRecoveryAt = 0;
  }

  function startPipFrameTracking(video: HTMLVideoElement) {
    stopPipFrameTracking();
    if (typeof video.requestVideoFrameCallback !== "function") return;
    pipFrameVideo = video;
    pipLastFrameAt = performance.now();
    const onFrame = () => {
      if (pipFrameVideo !== video) return;
      pipLastFrameAt = performance.now();
      try {
        pipFrameCallbackId = video.requestVideoFrameCallback(onFrame);
      } catch {
        pipFrameCallbackId = null;
      }
    };
    try {
      pipFrameCallbackId = video.requestVideoFrameCallback(onFrame);
    } catch {
      stopPipFrameTracking();
    }
  }

  function isPipVideoStalled() {
    const video = pipFrameVideo;
    return Boolean(
      video &&
      !video.paused &&
      !video.ended &&
      video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
      performance.now() - pipLastFrameAt >= PIP_FRAME_STALL_MS,
    );
  }

  function recoverStalledPipVideo() {
    if (!isPipVideoStalled()) return false;
    const video = pipFrameVideo;
    const now = Date.now();
    if (!video || now - pipLastRecoveryAt < PIP_FRAME_RECOVERY_COOLDOWN_MS)
      return false;
    pipLastRecoveryAt = now;
    const currentTime = video.currentTime;
    video.pause();
    // 暫停後立即還原播放位置，避免延遲完成的播放請求覆蓋使用者跳轉，或在 PiP 關閉、影片放回原頁面後改動播放位置。
    if (
      Number.isFinite(currentTime) &&
      Math.abs(video.currentTime - currentTime) > 0.5
    )
      video.currentTime = currentTime;
    void video.play().catch(() => {});
    return true;
  }

  function isHahowPage() {
    return globalThis.PipCompanion.site.isHahowHost(location.hostname);
  }

  function captureVideoStream(video: HTMLVideoElement): MediaStream | null {
    const captureStream = (
      video as HTMLVideoElement & {
        captureStream?: () => MediaStream;
      }
    ).captureStream;
    return typeof captureStream === "function"
      ? captureStream.call(video)
      : null;
  }

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

  function notifyPipState(pipOpen: boolean, playing?: boolean) {
    try {
      if (!chrome.runtime?.id) return;
      const activeVideo =
        nativePipVideo ?? state.pipUi?.video ?? state.sourceVideo;
      void chrome.runtime
        .sendMessage({
          type: "PIP_STATE_CHANGED",
          pipOpen,
          playing:
            playing ?? Boolean(pipOpen && activeVideo && !activeVideo.paused),
          subtitlesEnabled: state.subtitlessOn,
        } satisfies ExtensionMessage)
        .catch(() => {});
    } catch {
      // 擴充插件在重新載入或關閉期間可能失效
    }
  }

  function notifySourcePlayback(playing: boolean) {
    if ((!state.pipWindow && !isNativePipOpen()) || !chrome.runtime?.id) return;
    void chrome.runtime
      .sendMessage({
        type: "PIP_SOURCE_PLAYBACK_CHANGED",
        playing,
      } satisfies ExtensionMessage)
      .catch(() => {});
  }

  function isNativePipOpen() {
    return Boolean(
      nativePipVideo &&
      nativePipVideo.ownerDocument.pictureInPictureElement === nativePipVideo,
    );
  }

  function clearNativePip(video: HTMLVideoElement, notify = true) {
    if (nativePipVideo !== video) return;
    if (nativePipPlaybackHandler) {
      video.removeEventListener("play", nativePipPlaybackHandler);
      video.removeEventListener("pause", nativePipPlaybackHandler);
    }
    if (nativePipLeaveHandler)
      video.removeEventListener("leavepictureinpicture", nativePipLeaveHandler);
    nativePipVideo = null;
    nativePipPlaybackHandler = null;
    nativePipLeaveHandler = null;
    if (
      state.pipSession.phase === "active" &&
      "mode" in state.pipSession &&
      state.pipSession.mode === "native" &&
      state.pipSession.video === video
    )
      state.pipSession = { phase: "closed" };
    if (notify) notifyPipState(false);
  }

  function detachNativePip(video: HTMLVideoElement) {
    if (nativePipVideo !== video) return;
    if (nativePipPlaybackHandler) {
      video.removeEventListener("play", nativePipPlaybackHandler);
      video.removeEventListener("pause", nativePipPlaybackHandler);
    }
    if (nativePipLeaveHandler)
      video.removeEventListener("leavepictureinpicture", nativePipLeaveHandler);
    nativePipVideo = null;
    nativePipPlaybackHandler = null;
    nativePipLeaveHandler = null;
  }

  async function openNativePip(video: HTMLVideoElement) {
    if (nativePipVideo === video && isNativePipOpen()) return;
    if (nativePipVideo) clearNativePip(nativePipVideo);
    if (typeof video.requestPictureInPicture !== "function")
      throw new Error("Native PiP unavailable for embedded video");

    nativePipVideo = video;
    nativePipPlaybackHandler = () => {
      if (nativePipVideo !== video) return;
      notifyPipState(true, !video.paused);
      notifySourcePlayback(!video.paused);
    };
    nativePipLeaveHandler = () => {
      if (nativePipVideo !== video) return;
      clearNativePip(video, !suppressNativePipCloseNotification);
      if (state.pauseOnPipClose) video.pause();
    };
    video.addEventListener("play", nativePipPlaybackHandler);
    video.addEventListener("pause", nativePipPlaybackHandler);
    video.addEventListener("leavepictureinpicture", nativePipLeaveHandler);

    let request: Promise<unknown> | null = null;
    try {
      request = video.requestPictureInPicture();
      nativePipRequest = request;
      await request;
      if (nativePipVideo === video) {
        state.pipSession = {
          phase: "active",
          mode: "native",
          video,
          ownerDocument: video.ownerDocument,
          parent: video.parentNode,
        };
        notifyPipState(true, !video.paused);
      }
    } catch (err) {
      clearNativePip(video, false);
      throw err;
    } finally {
      if (nativePipRequest === request) nativePipRequest = null;
    }
  }

  async function handoffNativePip(video: HTMLVideoElement) {
    const oldVideo = nativePipVideo;
    if (!oldVideo || oldVideo === video || !isNativePipOpen()) return;
    if (oldVideo.ownerDocument !== video.ownerDocument) return;

    const generation = ++pipOperationGeneration;
    state.pipSession = { phase: "opening" };
    detachNativePip(oldVideo);
    try {
      if (oldVideo.ownerDocument.pictureInPictureElement === oldVideo)
        await oldVideo.ownerDocument.exitPictureInPicture();
      if (generation !== pipOperationGeneration) return;
      await openNativePip(video);
    } catch (err) {
      if (generation !== pipOperationGeneration) return;
      state.pipSession = { phase: "closed" };
      notifyPipState(false);
      console.warn("[Subtitle PiP] Could not hand off native PiP:", err);
    }
  }

  function handoffNativePipVideo(video: HTMLVideoElement) {
    const queued = (nativePipHandoff ?? Promise.resolve())
      .then(() => handoffNativePip(video))
      .finally(() => {
        if (nativePipHandoff === queued) nativePipHandoff = null;
      });
    nativePipHandoff = queued;
    return nativePipHandoff;
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

    // 關閉時立即送出最後快照，背景會依序儲存，避免等候期間視窗已消失。
    if (!force) while (boundsSavePromise) await boundsSavePromise;
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

  function getCenteredPipBounds(win: Window) {
    const width = win.outerWidth;
    const height = win.outerHeight;
    const screen = win.screen as Screen & {
      availLeft?: unknown;
      availTop?: unknown;
    };
    const availLeft =
      typeof screen.availLeft === "number" ? screen.availLeft : 0;
    const availTop = typeof screen.availTop === "number" ? screen.availTop : 0;
    return {
      innerWidth: win.innerWidth,
      left: Math.max(
        availLeft,
        Math.round(availLeft + (win.screen.availWidth - width) / 2),
      ),
      top: Math.max(
        availTop,
        Math.round(availTop + (win.screen.availHeight - height) / 2),
      ),
      width,
      height,
    };
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
    if (result.missing && !win.closed) {
      try {
        const centered = await chrome.runtime.sendMessage({
          type: "CENTER_PIP_BOUNDS",
          ...getCenteredPipBounds(win),
        } satisfies ExtensionMessage);
        if (centered?.ok === true) result = centered;
      } catch {
        // 置中失敗就留在瀏覽器預設位置，照舊開始追蹤。
      }
    }
    if ((result.ok || result.missing) && !win.closed && state.pipWindow === win)
      startPipBoundsTracking(win);
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
        toggleSubtitles:
          globalThis.PipCompanion.ContentPlayback.toggleSubtitles,
        getSubtitlesEnabled: () => state.subtitlessOn,
        isSubtitleTranslationSuspended:
          globalThis.PipCompanion.ContentSubtitles
            .isSubtitleTranslationSuspended,
        resumeSubtitleTranslation:
          globalThis.PipCompanion.ContentSubtitles.resumeSubtitleTranslation,
        hasSubtitleSource:
          globalThis.PipCompanion.ContentSubtitles.hasSubtitleSource,
        getSubtitleTracks:
          globalThis.PipCompanion.ContentSubtitles.getNativeSubtitleTracks,
        selectSubtitleTrack:
          globalThis.PipCompanion.ContentSubtitles.selectNativeSubtitleTrack,
        getSecondarySubtitleTracks:
          globalThis.PipCompanion.ContentSubtitles.getSecondarySubtitleTracks,
        getSelectedSecondarySubtitleTrack:
          globalThis.PipCompanion.ContentSubtitles
            .getSelectedSecondarySubtitleTrack,
        selectSecondarySubtitleTrack:
          globalThis.PipCompanion.ContentSubtitles.selectSecondarySubtitleTrack,
        getSubtitleTranslationPreferences: () =>
          state.subtitleTranslationPreferences,
        getSubtitleTranslationLanguages: async () => {
          try {
            const response: unknown = await chrome.runtime.sendMessage({
              type: "GET_SUBTITLE_TRANSLATION_LANGUAGES",
            } satisfies ExtensionMessage);
            if (
              !globalThis.PipCompanion.util.isRecord(response) ||
              response.ok !== true ||
              !Array.isArray(response.languages)
            )
              return [];
            return response.languages.flatMap((language) =>
              globalThis.PipCompanion.util.isRecord(language) &&
              typeof language.code === "string" &&
              language.code.length <= 35 &&
              typeof language.label === "string" &&
              language.label.length <= 100
                ? [{ code: language.code, label: language.label }]
                : [],
            );
          } catch {
            return [];
          }
        },
        getSubtitleTranslationServices: async () => {
          try {
            const response: unknown = await chrome.runtime.sendMessage({
              type: "GET_SUBTITLE_TRANSLATION_SERVICES",
            } satisfies ExtensionMessage);
            if (
              !globalThis.PipCompanion.util.isRecord(response) ||
              response.ok !== true ||
              (response.provider !== "microsoft" &&
                response.provider !== "google" &&
                response.provider !== "deepl") ||
              !Array.isArray(response.services)
            )
              return null;
            const services: SubtitleTranslationServiceOption[] =
              response.services.flatMap((service) =>
                globalThis.PipCompanion.util.isRecord(service) &&
                (service.provider === "microsoft" ||
                  service.provider === "google" ||
                  service.provider === "deepl") &&
                typeof service.configured === "boolean"
                  ? [
                      {
                        provider: service.provider,
                        configured: service.configured,
                      },
                    ]
                  : [],
              );
            return { provider: response.provider, services };
          } catch {
            return null;
          }
        },
        setSubtitleTranslationProvider: async (provider) => {
          try {
            const response: unknown = await chrome.runtime.sendMessage({
              type: "SET_SUBTITLE_TRANSLATION_PROVIDER",
              provider,
            } satisfies ExtensionMessage);
            return (
              globalThis.PipCompanion.util.isRecord(response) &&
              response.ok === true
            );
          } catch {
            return false;
          }
        },
        setSubtitleTranslationPreferences: (preferences) => {
          const normalized =
            globalThis.PipCompanion.subtitleTranslationSettings.normalizePreferences(
              preferences,
            );
          const previous = state.subtitleTranslationPreferences;
          state.subtitleTranslationPreferences = normalized;
          globalThis.PipCompanion.ContentSubtitles.onTranslationPreferencesChanged(
            previous,
            normalized,
          );
          state.pipUi?.refreshSubtitleTranslationPreferences();
          globalThis.PipCompanion.ContentSubtitles.renderSubtitle();
          void chrome.storage.local
            .set({
              [globalThis.PipCompanion.subtitleTranslationSettings
                .PREFERENCES_KEY]: normalized,
            })
            .catch(() => {});
        },
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
          state.thumbnailPreviewEnabled
            ? globalThis.PipCompanion.ContentStoryboard.getFrame(
                seconds,
                state.sourceVideo,
              )
            : null,
        resize: globalThis.PipCompanion.ContentPlayback.resizePipWindow,
      },
      video,
    );
    ui.setThumbnailPreviewEnabled(state.thumbnailPreviewEnabled);
    ui.setDanmakuEnabled(state.danmakuEnabled);
    return ui;
  }

  function stashSourceVideo(keepInPlayer = false) {
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

    if (!keepInPlayer && rect.width > 0 && rect.height > 0 && parent) {
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
    if (keepInPlayer) {
      video.style.opacity = "0";
      video.style.pointerEvents = "none";
    }
  }

  function restoreSourceVideo() {
    const stash = state.videoStash;
    const video = state.sourceVideo;
    if (!stash) return true;
    if (!video) return false;
    const wasPlaying = !video.paused && !video.ended;
    stash.placeholder?.remove();
    video.controls = stash.controls;
    video.style.cssText = stash.inlineStyle;
    // 網站已移除的來源不要放回播放器，避免復活失效元素。
    if (stash.parent?.isConnected && video.isConnected) {
      const next = stash.next?.parentNode === stash.parent ? stash.next : null;
      try {
        stash.parent.insertBefore(video, next);
      } catch (err) {
        const fallback = document.body ?? document.documentElement;
        if (!fallback) {
          console.warn("[Subtitle PiP] Could not restore source video:", err);
          return false;
        }
        try {
          fallback.append(video);
        } catch (fallbackError) {
          console.warn(
            "[Subtitle PiP] Could not restore source video:",
            fallbackError,
          );
          return false;
        }
      }
    } else video.remove();
    state.videoStash = null;
    if (wasPlaying && video.paused) void video.play().catch(() => {});
    return true;
  }

  function remountSourceVideo() {
    if (!state.pipUi || !state.sourceVideo) return;
    const wasPlaying = !state.sourceVideo.paused;
    globalThis.PipCompanion.ContentSubtitles.prepareNativeSubtitles();
    const hahowStream =
      isHahowPage() && state.pipUi.video !== state.sourceVideo
        ? (hahowPipStream ?? captureVideoStream(state.sourceVideo))
        : null;
    if (hahowStream) {
      if (hahowStream !== hahowPipStream) {
        hahowPipStream?.getTracks().forEach((track) => track.stop());
        hahowPipStream = hahowStream;
      }
      if (state.pipUi.video.srcObject !== hahowPipStream)
        state.pipUi.video.srcObject = hahowPipStream;
      stashSourceVideo(true);
      state.pipUi.screen.append(state.pipUi.video);
      globalThis.PipCompanion.PipAudio.start(
        state.sourceVideo,
        state.pipWindow,
      );
      startPipFrameTracking(state.pipUi.video);
      if (wasPlaying) void state.pipUi.video.play().catch(() => {});
      return;
    }
    state.pipUi.setVideo(state.sourceVideo);
    stashSourceVideo();
    state.pipUi.screen.append(state.sourceVideo);
    state.sourceVideo.style.cssText = "";
    globalThis.PipCompanion.ContentSubtitles.prepareNativeSubtitles();
    globalThis.PipCompanion.PipAudio.start(state.sourceVideo, state.pipWindow);
    startPipFrameTracking(state.sourceVideo);
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
    if (video.ownerDocument !== document) {
      void closePiP(true).finally(() =>
        globalThis.PipCompanion.ContentFeedback.showPageToast(
          t("pipEmbeddedVideoRetry"),
        ),
      );
      return;
    }
    const session = state.pipSession;
    if (
      session.phase !== "waiting" ||
      session.window !== win ||
      state.sourceVideo !== video
    )
      return;
    if (session.waitTimer !== null) window.clearTimeout(session.waitTimer);
    let pipVideo = video;
    if (isHahowPage()) {
      const stream = captureVideoStream(video);
      if (stream) {
        pipVideo = win.document.createElement("video");
        pipVideo.muted = true;
        pipVideo.defaultMuted = true;
        pipVideo.playsInline = true;
        pipVideo.autoplay = true;
        hahowPipStream = stream;
        pipVideo.srcObject = hahowPipStream;
      }
    }
    state.pipSession = {
      phase: "active",
      window: win,
      ui: createPipUi(win, pipVideo),
    };
    globalThis.PipCompanion.ContentSubtitles.initializeSubtitlesOn();
    state.pipUi?.refreshSubtitleTracks();
    globalThis.PipCompanion.ContentSubtitles.refreshSubtitle(true);
    remountSourceVideo();
    initDanmakuInPip(win, video);
    globalThis.PipCompanion.ContentSubtitles.refreshSubtitle(true);
    globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
    if (!video.paused) resumePlayback();
  }

  function releasePipVideo() {
    try {
      globalThis.PipCompanion.PipAudio.stop();
    } catch (err) {
      console.warn("[Subtitle PiP] Could not stop PiP audio:", err);
    }
    let videoRestored = false;
    try {
      videoRestored = restoreSourceVideo();
    } catch (err) {
      console.warn("[Subtitle PiP] Could not restore source video:", err);
    }
    try {
      globalThis.PipCompanion.ContentSubtitles.restoreNativeSubtitleModes();
    } catch (err) {
      console.warn("[Subtitle PiP] Could not restore native subtitles:", err);
    }
    const pipVideo = state.pipUi?.video;
    if (pipVideo && pipVideo !== state.sourceVideo) pipVideo.srcObject = null;
    hahowPipStream?.getTracks().forEach((track) => track.stop());
    hahowPipStream = null;
    return videoRestored;
  }

  function resumePlayback() {
    if (!state.pipUi) return;
    void state.pipUi.video.play().catch(() => {});
  }

  function bindSourceVideo(video: HTMLVideoElement) {
    const previousNativeVideo =
      state.pipSession.phase === "active" &&
      "mode" in state.pipSession &&
      state.pipSession.mode === "native"
        ? state.pipSession.video
        : null;
    if (state.sourceVideo !== video)
      globalThis.PipCompanion.ContentStoryboard.reset();
    if (state.pipWindow && state.videoStash) restoreSourceVideo();
    state.sourceAbort?.abort();
    state.sourceAbort = new AbortController();
    state.sourceVideo = video;
    globalThis.PipCompanion.ContentSubtitles.setNativeSubtitleVideo(video);
    const signal = state.sourceAbort.signal;
    setDanmakuPlaybackRate(video.playbackRate);
    setDanmakuPaused(video.paused);

    const sync = () => {
      const pipVideo = state.pipUi?.video;
      if (pipVideo && pipVideo !== video) {
        pipVideo.playbackRate = video.playbackRate;
        if (video.paused) pipVideo.pause();
        else void pipVideo.play().catch(() => {});
      }
      globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
      globalThis.PipCompanion.ContentSubtitles.refreshSubtitle();
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
    const syncSubtitles = () =>
      globalThis.PipCompanion.ContentSubtitles.syncNativeSubtitles();
    const syncSubtitleTracks = () => {
      syncSubtitles();
      state.pipUi?.refreshSubtitleTracks();
    };
    trackList.addEventListener("change", syncSubtitleTracks, { signal });
    trackList.addEventListener(
      "removetrack",
      () => {
        syncSubtitleTracks();
        globalThis.PipCompanion.ContentSubtitles.refreshSubtitle(true);
      },
      { signal },
    );
    trackList.addEventListener(
      "addtrack",
      (e) => {
        e.track?.addEventListener("cuechange", syncSubtitles, { signal });
        if (state.pipUi && state.subtitlessOn)
          globalThis.PipCompanion.ContentSubtitles.prepareNativeSubtitles();
        syncSubtitleTracks();
      },
      { signal },
    );
    for (const track of trackList) {
      track.addEventListener("cuechange", syncSubtitles, { signal });
    }

    globalThis.PipCompanion.ContentPlayback.updatePlaybackUi();
    globalThis.PipCompanion.ContentSubtitles.refreshSubtitle(true);
    if (state.thumbnailPreviewEnabled)
      globalThis.PipCompanion.ContentStoryboard.preload(video);
    if (state.pipWindow) {
      if (state.pipUi) remountSourceVideo();
      else mountPipVideo(state.pipWindow, video);
      globalThis.PipCompanion.ContentPlayback.applyPendingNextPlaybackState(
        video,
      );
    }
    if (previousNativeVideo && previousNativeVideo !== video) {
      void handoffNativePipVideo(video);
    }
    state.nextVideoRequested = false;
  }

  async function closePiP(
    closeWindow: boolean,
    onlyIfPaused = false,
    pausePlayback = state.pauseOnPipClose,
  ): Promise<void> {
    if (onlyIfPaused && isPipPlaying()) return;
    const onlyIfPausedOperation = onlyIfPaused ? pipOperationGeneration : -1;
    if (onlyIfPaused && nativePipRequest) {
      await nativePipRequest.catch(() => {});
      if (isPipPlaying() || onlyIfPausedOperation !== pipOperationGeneration)
        return;
    }
    if (!onlyIfPaused) {
      pipOperationGeneration++;
      stopPipFrameTracking();
      globalThis.PipCompanion.ContentPlayback.cancelNextVideoRequest();
    }
    if (nativePipVideo) {
      const video = nativePipVideo;
      const request = nativePipRequest;
      if (request) await request.catch(() => {});
      if (
        onlyIfPaused &&
        (isPipPlaying() || onlyIfPausedOperation !== pipOperationGeneration)
      )
        return;
      if (onlyIfPaused) {
        pipOperationGeneration++;
        stopPipFrameTracking();
        globalThis.PipCompanion.ContentPlayback.cancelNextVideoRequest();
      }
      suppressNativePipCloseNotification = onlyIfPaused;
      try {
        if (video.ownerDocument.pictureInPictureElement === video)
          await video.ownerDocument.exitPictureInPicture();
        if (onlyIfPaused && isPipPlaying()) return;
        clearNativePip(video, !onlyIfPaused);
      } finally {
        suppressNativePipCloseNotification = false;
      }
      if (pausePlayback) video.pause();
      return;
    }
    const session = state.pipSession;
    if (session.phase === "opening") {
      state.pipSession = { phase: "closed" };
      return;
    }
    const oldWindow =
      session.phase === "waiting" ||
      (session.phase === "active" && "window" in session)
        ? session.window
        : null;
    const boundsSave =
      oldWindow && !oldWindow.closed
        ? flushPipBounds(true, oldWindow)
        : Promise.resolve();
    if (onlyIfPaused) {
      await boundsSave;
      if (isPipPlaying() || onlyIfPausedOperation !== pipOperationGeneration)
        return;
      pipOperationGeneration++;
      stopPipFrameTracking();
      globalThis.PipCompanion.ContentPlayback.cancelNextVideoRequest();
    }
    if (session.phase === "waiting" && session.waitTimer !== null)
      window.clearTimeout(session.waitTimer);
    window.clearTimeout(state.feedbackTimer);
    state.feedbackTimer = 0;
    window.clearTimeout(state.nextClickTimer);
    state.nextClickTimer = 0;
    state.nextClickPending = false;
    try {
      destroyDanmakuInPip();
    } catch (err) {
      console.warn("[Subtitle PiP] Could not destroy PiP danmaku:", err);
    }
    window.clearInterval(boundsTimer);
    boundsTimer = 0;
    window.clearTimeout(boundsDebounceTimer);
    boundsDebounceTimer = 0;
    // 關閉時先暫停，避免放回原頁面後被還原流程接續播放。
    if (oldWindow && pausePlayback) state.sourceVideo?.pause();
    const videoRestored = releasePipVideo();
    if (!videoRestored && closeWindow && oldWindow && !oldWindow.closed) {
      await boundsSave;
      return;
    }

    state.pipUi?.dispose();
    state.pipSession = { phase: "closed" };
    if (oldWindow && !onlyIfPaused) notifyPipState(false);
    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    state.subtitleLines = [];
    try {
      globalThis.PipCompanion.ContentStoryboard.reset();
    } catch (err) {
      console.warn("[Subtitle PiP] Could not reset storyboard:", err);
    }
    if (oldWindow && !oldWindow.closed) {
      if (closeWindow) {
        try {
          oldWindow.close();
        } catch (err) {
          console.warn("[Subtitle PiP] Could not close PiP window:", err);
        }
      }
    }
    await boundsSave;
  }

  async function closePiPIfPaused(preservePlayback = false) {
    if (isPipPlaying()) return false;
    await closePiP(true, true, !preservePlayback && state.pauseOnPipClose);
    return state.pipSession.phase === "closed" && !isPipOpen();
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
    if (nativePipVideo === state.sourceVideo && isNativePipOpen())
      return { ok: true };
    if (nativePipVideo) await closePiP(true);
    const operationGeneration = ++pipOperationGeneration;
    state.pipSession = { phase: "opening" };
    const openingVideo = state.sourceVideo;

    try {
      if (openingVideo && openingVideo.ownerDocument !== document) {
        await openNativePip(openingVideo);
        return { ok: true };
      }
      const documentPip = globalThis.PipCompanion.ContentVideo.getDocumentPip();
      if (!documentPip) throw new Error("Document PiP unavailable");
      globalThis.PipCompanion.PipAudio.prepare();
      const windowPromise = documentPip.requestWindow({
        width: cachedPipSize?.width ?? 640,
        height: cachedPipSize?.height ?? 360,
      });
      const nextWindow = await windowPromise;
      if (
        operationGeneration !== pipOperationGeneration ||
        state.pipSession.phase !== "opening"
      ) {
        try {
          if (!nextWindow.closed) nextWindow.close();
        } catch {}
        return { ok: false, message: t("pipOpening") };
      }
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
      void restorePipBounds(nextWindow).catch(() => {});
      return { ok: true };
    } catch (err) {
      if (operationGeneration === pipOperationGeneration) {
        if (state.pipWindow) void closePiP(true);
        else state.pipSession = { phase: "closed" };
      }
      const gestureRequired =
        err instanceof DOMException && err.name === "NotAllowedError";
      const extensionContextInvalidated = /extension context invalidated/i.test(
        String(err),
      );
      const sourceChanged =
        err instanceof Error && err.message === "source changed";
      if (!gestureRequired && !sourceChanged)
        console.warn("[Subtitle PiP] Could not open PiP:", err);
      return {
        ok: false,
        message: gestureRequired
          ? t("pipGestureRequired")
          : extensionContextInvalidated
            ? t("pipExtensionContextInvalidated")
            : t("pipCannotOpen"),
        ...(gestureRequired ? { code: "GESTURE_REQUIRED" as const } : {}),
      };
    } finally {
      if (
        operationGeneration === pipOperationGeneration &&
        state.pipSession.phase === "opening"
      )
        state.pipSession = { phase: "closed" };
    }
  }

  loadCachedPipSize();

  function isPipOpen() {
    return Boolean(
      (state.pipWindow && !state.pipWindow.closed) || isNativePipOpen(),
    );
  }

  function isPipPlaying() {
    const video = nativePipVideo ?? state.pipUi?.video ?? state.sourceVideo;
    return Boolean(isPipOpen() && video && !video.paused);
  }

  function getActivePipSource() {
    const session = state.pipSession;
    if (
      session.phase !== "active" ||
      !("mode" in session && session.mode === "native")
    )
      return null;
    return {
      video: session.video,
      ownerDocument: session.ownerDocument,
      parent: session.parent,
    };
  }

  return {
    bindSourceVideo,
    closePiP,
    closePiPIfPaused,
    getActivePipSource,
    handoffNativePipVideo,
    isPipOpen,
    isPipPlaying,
    isPipVideoStalled,
    recoverStalledPipVideo,
    openPiP,
    restorePipBounds,
  };
})();
