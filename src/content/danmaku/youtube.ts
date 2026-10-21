"use strict";

(() => {
  const YOUTUBE_IS_PAGE = globalThis.PipCompanion.site.isYouTubeHost(
    location.hostname,
  );
  const YOUTUBE_MAX_REPLAY_MESSAGES = 2000;

  function createYouTubeDanmaku(
    dependencies: ContentYouTubeDanmakuDependencies,
  ): ContentYouTubeDanmakuController {
    let relayClock: YouTubeChatClock | null = null;
    const relayedIds = new Set<string>();
    let destroyed = false;
    let backgroundChatFrame: HTMLIFrameElement | null = null;
    let nativeReplayChatFallback: {
      videoId: string;
      chatFrame: HTMLIFrameElement;
      chatHost: Element;
      originalFrameStyle: string | null;
      originalHostStyle: string | null;
      wasCollapsed: boolean;
      wasHidden: boolean;
    } | null = null;
    let nativeChatStyleObserver: MutationObserver | null = null;
    let youtubeLiveStatusCache: { videoId: string; isLive: boolean } | null =
      null;
    let youtubeReplayContinuationCache: {
      videoId: string;
      token: string;
    } | null = null;
    let youtubeReplayChatFrame: HTMLIFrameElement | null = null;
    let youtubeReplayChatPlayerState: number | null = null;
    let chatObserver: MutationObserver | null = null;
    let chatDocumentObserver: MutationObserver | null = null;
    let observedChatDocument: Document | null = null;
    let observedChatFrame: HTMLIFrameElement | null = null;
    let observedItemsNode: Element | null = null;
    let observerAttachedAt = 0;
    let observedChatVideoId = "";
    let replayChatWarmupTimer: ReturnType<typeof setTimeout> | null = null;
    let bufferingReplayChat = false;
    let replayVideo: HTMLVideoElement | null = null;
    let replayVideoController: AbortController | null = null;
    let replaySeeking = false;
    let replayVideoId = "";
    const replayMessages = new Map<string | symbol, ReplayMessageEntry>();
    const pendingReplayMessages = new Set<ReplayMessageEntry>();

    function processReplayMessages(): void {
      const currentTime = replayVideo?.currentTime;
      if (
        replaySeeking ||
        bufferingReplayChat ||
        typeof currentTime !== "number" ||
        !Number.isFinite(currentTime)
      )
        return;

      const dueMessages = [...pendingReplayMessages]
        .filter((entry) => entry.replayTime <= currentTime + 0.1)
        .sort((a, b) => a.replayTime - b.replayTime);

      for (const entry of dueMessages) {
        pendingReplayMessages.delete(entry);
        const elapsed = Math.max(0, currentTime - entry.replayTime);
        dependencies.broadcast(entry.data, { elapsed, restore: elapsed > 0 });
      }
    }

    function receiveDanmaku(
      data: DanmakuData | null | undefined,
      { initial = false }: { initial?: boolean } = {},
    ): void {
      if (!data) return;
      if (dependencies.relay) {
        const key =
          data.messageId || `${data.replayTime}:${data.author}:${data.text}`;
        if (relayedIds.has(key)) return;
        relayedIds.add(key);
        if (relayedIds.size > YOUTUBE_MAX_REPLAY_MESSAGES) {
          const first = relayedIds.values().next().value;
          if (first !== undefined) relayedIds.delete(first);
        }
        if (!isYouTubeLiveVideo() || !initial) dependencies.broadcast(data);
        return;
      }
      if (YOUTUBE_IS_PAGE && isYouTubeLiveVideo()) {
        if (!initial) dependencies.broadcast(data);
        return;
      }

      if (
        typeof data.replayTime !== "number" ||
        !Number.isFinite(data.replayTime)
      ) {
        const videoCurrent = replayVideo?.currentTime;
        if (
          typeof videoCurrent === "number" &&
          Number.isFinite(videoCurrent) &&
          videoCurrent >= 0
        ) {
          data.replayTime = Math.floor(videoCurrent);
        } else {
          if (!initial) dependencies.broadcast(data);
          return;
        }
      }

      const messageKey = data.messageId || Symbol();
      let entry = replayMessages.get(messageKey);
      if (!entry) {
        entry = {
          data,
          replayTime: data.replayTime,
        };
        replayMessages.set(messageKey, entry);
        pendingReplayMessages.add(entry);
        if (replayMessages.size > YOUTUBE_MAX_REPLAY_MESSAGES) {
          const firstKey = replayMessages.keys().next().value;
          if (firstKey !== undefined) {
            const firstEntry = replayMessages.get(firstKey);
            if (firstEntry) pendingReplayMessages.delete(firstEntry);
            replayMessages.delete(firstKey);
          }
        }
      } else entry.data = data;

      if (!initial) processReplayMessages();
    }

    function unbindReplayVideo(): void {
      replayVideoController?.abort();
      replayVideoController = null;
      replayVideo = null;
      replaySeeking = false;
    }

    function syncYouTubeReplayChat(): void {
      const frame = backgroundChatFrame || observedChatFrame;
      const video = relayClock || replayVideo;
      if (!frame || !video || isYouTubeLiveVideo()) return;

      let chatDoc: Document | null;
      try {
        chatDoc = frame.contentDocument;
      } catch {
        return;
      }
      const actionTarget = chatDoc?.querySelector("yt-live-chat-renderer");
      const view = chatDoc?.defaultView;
      if (!actionTarget || !view) return;

      if (youtubeReplayChatFrame !== frame) {
        youtubeReplayChatFrame = frame;
        youtubeReplayChatPlayerState = null;
      }

      const dispatchAction = (actionName: string, args: number[]) => {
        actionTarget.dispatchEvent(
          new view.CustomEvent("yt-action", {
            bubbles: true,
            composed: true,
            detail: { actionName, optionalAction: true, args, returnValue: [] },
          }),
        );
      };
      const playerState = video.ended ? 0 : video.paused ? 2 : 1;
      if (playerState !== youtubeReplayChatPlayerState) {
        dispatchAction("yt-live-player-state-change", [playerState]);
        youtubeReplayChatPlayerState = playerState;
      }
      dispatchAction("yt-live-player-video-progress", [
        relayClock ? relayClock.time + 5 : replayVideo?.currentTime || 0,
      ]);
    }

    function getYouTubeVideoId(): string {
      return (
        globalThis.PipCompanion.site.parseYouTubeVideoId(location.href) || ""
      );
    }

    function resetReplayMessagesForVideo(videoId: string): void {
      if (videoId === replayVideoId) return;
      replayMessages.clear();
      pendingReplayMessages.clear();
      dependencies.clear();
      replayVideoId = videoId;
    }

    function bindReplayVideo(): void {
      if (
        !YOUTUBE_IS_PAGE ||
        !dependencies.isSettingsLoaded() ||
        !dependencies.isVisible()
      ) {
        unbindReplayVideo();
        return;
      }

      const videoId = getYouTubeVideoId();
      resetReplayMessagesForVideo(videoId);

      const video =
        document.querySelector<HTMLVideoElement>("video.html5-main-video") ||
        dependencies.getSourceVideo();
      if (video === replayVideo) return;
      unbindReplayVideo();
      replayVideo = video;
      if (!video) return;

      const controller = new AbortController();
      replayVideoController = controller;

      video.addEventListener(
        "timeupdate",
        () => {
          processReplayMessages();
          syncYouTubeReplayChat();
        },
        { signal: controller.signal },
      );
      video.addEventListener(
        "seeking",
        () => {
          replaySeeking = true;
          dependencies.clear();
        },
        { signal: controller.signal },
      );
      video.addEventListener(
        "seeked",
        () => {
          const currentTime = video.currentTime;
          replaySeeking = false;
          dependencies.clear();
          const entries = [...replayMessages.values()].sort(
            (a, b) => a.replayTime - b.replayTime,
          );
          dependencies.ensureMainRenderer();
          pendingReplayMessages.clear();
          for (const entry of entries) {
            if (entry.replayTime > currentTime)
              pendingReplayMessages.add(entry);
          }
          processReplayMessages();
          syncYouTubeReplayChat();
        },
        { signal: controller.signal },
      );
      const syncPlayback = () => {
        processReplayMessages();
        syncYouTubeReplayChat();
      };
      video.addEventListener("play", syncPlayback, {
        signal: controller.signal,
      });
      video.addEventListener("pause", syncPlayback, {
        signal: controller.signal,
      });
      video.addEventListener("ended", syncPlayback, {
        signal: controller.signal,
      });
      processReplayMessages();
    }

    function parseYouTubeAssignedData(
      source: string,
      assignmentPattern: RegExp,
    ): unknown | null {
      const assignment = source.match(assignmentPattern);
      if (!assignment || assignment.index === undefined) return null;

      const start = source.indexOf(
        "{",
        assignment.index + assignment[0].length,
      );
      if (start < 0) return null;

      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < source.length; index++) {
        const char = source[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
          continue;
        }
        if (char === '"') inString = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            const parsed: unknown = JSON.parse(source.slice(start, index + 1));
            return parsed;
          } catch {
            return null;
          }
        }
      }
      return null;
    }

    function isYouTubeLiveVideo(): boolean {
      const videoId = getYouTubeVideoId();
      if (youtubeLiveStatusCache?.videoId === videoId)
        return youtubeLiveStatusCache.isLive;

      const bridgedVideoId = document.documentElement?.dataset?.pipYtVideoId;
      const bridgedIsLive = document.documentElement?.dataset?.pipYtIsLive;
      if (
        bridgedVideoId === videoId &&
        (bridgedIsLive === "true" || bridgedIsLive === "false")
      ) {
        const isLive = bridgedIsLive === "true";
        youtubeLiveStatusCache = { videoId, isLive };
        return isLive;
      }

      const player = document.querySelector("#movie_player") as {
        getVideoData?: () => { isLive?: boolean; video_id?: string };
        classList?: { contains(name: string): boolean };
        querySelector?: (selector: string) => Element | null;
      } | null;
      try {
        const videoData = player?.getVideoData?.();
        if (
          videoData &&
          (!videoData.video_id || videoData.video_id === videoId) &&
          typeof videoData.isLive === "boolean"
        ) {
          const isLive = videoData.isLive;
          youtubeLiveStatusCache = { videoId, isLive };
          return isLive;
        }
      } catch {}

      for (const script of document.scripts) {
        const data = parseYouTubeAssignedData(
          script.textContent || "",
          /ytInitialPlayerResponse\s*=\s*/,
        ) as {
          videoDetails?: { videoId?: unknown; isLiveContent?: unknown };
          microformat?: {
            playerMicroformatRenderer?: {
              liveBroadcastDetails?: {
                isLiveNow?: unknown;
                endTimestamp?: unknown;
              };
            };
          };
        } | null;
        if (!data || data.videoDetails?.videoId !== videoId) continue;

        const liveBroadcastDetails =
          data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
        const isLiveNow = liveBroadcastDetails?.isLiveNow;
        const isLiveContent = data.videoDetails?.isLiveContent;

        if (typeof isLiveNow === "boolean") {
          youtubeLiveStatusCache = { videoId, isLive: isLiveNow };
          return isLiveNow;
        }

        const hasEnded = typeof liveBroadcastDetails?.endTimestamp === "string";
        if (hasEnded) {
          youtubeLiveStatusCache = { videoId, isLive: false };
          return false;
        }

        if (typeof isLiveContent === "boolean") {
          const hasLiveBadge = Boolean(
            document.querySelector("ytd-watch-flexy[is-live-video]") ||
            player?.classList?.contains("ytp-live") ||
            player?.querySelector?.(".ytp-live-badge"),
          );
          if (player && !hasLiveBadge) {
            youtubeLiveStatusCache = { videoId, isLive: false };
            return false;
          }
          const isLive = isLiveContent;
          youtubeLiveStatusCache = { videoId, isLive };
          return isLive;
        }
      }

      const hasLiveDom = Boolean(
        document.querySelector("ytd-watch-flexy[is-live-video]") ||
        player?.classList?.contains("ytp-live") ||
        player?.querySelector?.(".ytp-live-badge"),
      );
      return hasLiveDom;
    }

    function findContinuationInTree(obj: unknown, depth = 0): string | null {
      if (!obj || depth > 8 || typeof obj !== "object") return null;
      if (Array.isArray(obj)) {
        for (const item of obj) {
          const res = findContinuationInTree(item, depth + 1);
          if (res) return res;
        }
        return null;
      }
      const rec = obj as Record<string, unknown>;
      const reload = rec.reloadContinuationData as
        Record<string, unknown> | undefined;
      if (typeof reload?.continuation === "string" && reload.continuation) {
        return reload.continuation;
      }
      for (const val of Object.values(rec)) {
        if (val && typeof val === "object") {
          const res = findContinuationInTree(val, depth + 1);
          if (res) return res;
        }
      }
      return null;
    }

    function getYouTubeReplayContinuation(videoId: string): string | null {
      if (youtubeReplayContinuationCache?.videoId === videoId)
        return youtubeReplayContinuationCache.token;

      const nativeFrame = getNativeChatIframe();
      if (nativeFrame?.src) {
        try {
          const url = new URL(nativeFrame.src, location.href);
          const token = url.searchParams.get("continuation");
          if (token && url.searchParams.get("v") === videoId) {
            youtubeReplayContinuationCache = { videoId, token };
            return token;
          }
        } catch {}
      }

      for (const script of document.scripts) {
        const data = parseYouTubeAssignedData(
          script.textContent || "",
          /ytInitialData["']?\]?\s*=\s*/,
        ) as {
          currentVideoEndpoint?: {
            watchEndpoint?: { videoId?: unknown };
          };
        } | null;
        if (!data) continue;
        if (
          data.currentVideoEndpoint?.watchEndpoint?.videoId &&
          data.currentVideoEndpoint.watchEndpoint.videoId !== videoId
        )
          continue;

        const token = findContinuationInTree(data);
        if (token) {
          youtubeReplayContinuationCache = { videoId, token };
          return token;
        }
      }
      return null;
    }

    function restoreNativeReplayChat(): void {
      const fallback = nativeReplayChatFallback;
      if (!fallback) return;
      nativeReplayChatFallback = null;
      nativeChatStyleObserver?.disconnect();
      nativeChatStyleObserver = null;
      if (!fallback.chatHost.isConnected) return;
      if (fallback.wasCollapsed)
        fallback.chatHost.setAttribute("collapsed", "");
      else fallback.chatHost.removeAttribute("collapsed");
      if (fallback.wasHidden)
        fallback.chatHost.setAttribute("hide-chat-frame", "");
      else fallback.chatHost.removeAttribute("hide-chat-frame");
      if (fallback.originalHostStyle === null)
        fallback.chatHost.removeAttribute("style");
      else fallback.chatHost.setAttribute("style", fallback.originalHostStyle);
      if (fallback.originalFrameStyle === null)
        fallback.chatFrame.removeAttribute("style");
      else
        fallback.chatFrame.setAttribute("style", fallback.originalFrameStyle);
    }

    function startNativeReplayChatOffscreen(
      chatFrame: HTMLIFrameElement,
    ): void {
      if (nativeReplayChatFallback?.chatFrame !== chatFrame)
        restoreNativeReplayChat();
      if (nativeReplayChatFallback?.chatFrame === chatFrame) return;
      const chatHost = chatFrame.closest("ytd-live-chat-frame");
      const showButton = chatHost?.querySelector<HTMLButtonElement>(
        "#show-hide-button button",
      );
      if (
        !chatHost ||
        !showButton ||
        !chatHost.isConnected ||
        (!chatHost.hasAttribute("collapsed") &&
          !chatHost.hasAttribute("hide-chat-frame"))
      )
        return;

      nativeReplayChatFallback = {
        videoId: getYouTubeVideoId(),
        chatFrame,
        chatHost,
        originalFrameStyle: chatFrame.getAttribute("style"),
        originalHostStyle: chatHost.getAttribute("style"),
        wasCollapsed: chatHost.hasAttribute("collapsed"),
        wasHidden: chatHost.hasAttribute("hide-chat-frame"),
      };
      const offscreenStyle =
        "position:fixed!important;left:-10000px!important;top:0!important;width:320px!important;height:480px!important;visibility:hidden!important;pointer-events:none!important;border:0!important;";
      const concealChat = () => {
        for (const element of [chatHost, chatFrame]) {
          const style = element.getAttribute("style") || "";
          if (!/left:\s*-10000px/.test(style))
            element.setAttribute("style", `${style}${offscreenStyle}`);
        }
      };
      concealChat();
      showButton.click();
      concealChat();
      nativeChatStyleObserver = new MutationObserver(concealChat);
      nativeChatStyleObserver.observe(chatHost, {
        attributes: true,
        attributeFilter: ["style"],
      });
    }

    function getNativeChatIframe(): HTMLIFrameElement | null {
      return (
        document.querySelector<HTMLIFrameElement>("iframe#chatframe") ||
        document.querySelector<HTMLIFrameElement>("ytd-live-chat-frame iframe")
      );
    }

    function isNativeChatFrameForVideo(
      chatFrame: HTMLIFrameElement,
      videoId: string,
    ): boolean {
      try {
        const frameVideoId = new URL(
          chatFrame.src,
          location.href,
        ).searchParams.get("v");
        return !frameVideoId || frameVideoId === videoId;
      } catch {
        return false;
      }
    }

    function removeBackgroundChatFrame(): void {
      if (!backgroundChatFrame) return;
      if (observedChatFrame === backgroundChatFrame) resetChatObservers();
      backgroundChatFrame.remove();
      backgroundChatFrame = null;
    }

    function createBackgroundChatFrame(): HTMLIFrameElement | null {
      const videoId = getYouTubeVideoId();
      if (!videoId) {
        removeBackgroundChatFrame();
        return null;
      }

      const isLive = isYouTubeLiveVideo();
      const chatUrl = new URL(
        isLive ? "/live_chat" : "/live_chat_replay",
        location.origin,
      );
      chatUrl.searchParams.set("v", videoId);
      chatUrl.searchParams.set("is_popout", "1");
      if (!isLive) {
        const continuation = getYouTubeReplayContinuation(videoId);
        if (continuation)
          chatUrl.searchParams.set("continuation", continuation);
      }
      if (backgroundChatFrame?.src === chatUrl.href) return backgroundChatFrame;
      removeBackgroundChatFrame();

      const frame = document.createElement("iframe");
      frame.title = globalThis.PipCompanion.util.getMessage(
        "youtubeChatFrameTitle",
      );
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.src = chatUrl.href;
      frame.style.cssText =
        "position:fixed!important;left:-10000px!important;top:0!important;width:320px!important;height:480px!important;visibility:hidden!important;pointer-events:none!important;border:0!important;";
      frame.addEventListener("load", () => {
        window.setTimeout(checkAndBindDanmakuChat, 400);
      });
      backgroundChatFrame = frame;
      (document.body || document.documentElement).appendChild(frame);
      return frame;
    }

    function hasChatItems(chatFrame: HTMLIFrameElement): boolean {
      try {
        const chatDoc =
          chatFrame.contentDocument || chatFrame.contentWindow?.document;
        return Boolean(chatDoc && findChatItemsContainer(chatDoc));
      } catch {
        return false;
      }
    }

    function getChatIframe(): HTMLIFrameElement | null {
      if (
        !YOUTUBE_IS_PAGE ||
        !dependencies.isSettingsLoaded() ||
        !dependencies.isVisible()
      ) {
        restoreNativeReplayChat();
        removeBackgroundChatFrame();
        return null;
      }

      const nativeChatFrame = getNativeChatIframe();
      const nativeChatIsCurrent =
        !nativeChatFrame ||
        isNativeChatFrameForVideo(nativeChatFrame, getYouTubeVideoId());
      if (
        nativeChatFrame &&
        nativeChatIsCurrent &&
        hasChatItems(nativeChatFrame)
      ) {
        removeBackgroundChatFrame();
        return nativeChatFrame;
      }

      if (!isYouTubeLiveVideo()) {
        if (
          nativeReplayChatFallback?.chatFrame === nativeChatFrame &&
          nativeChatIsCurrent
        ) {
          removeBackgroundChatFrame();
          return nativeChatFrame;
        }
        const videoId = getYouTubeVideoId();
        const continuation = getYouTubeReplayContinuation(videoId);
        if (!continuation) {
          if (nativeChatFrame) {
            startNativeReplayChatOffscreen(nativeChatFrame);
            removeBackgroundChatFrame();
            if (nativeChatIsCurrent) return nativeChatFrame;
            if (!nativeChatFrame.dataset.ytDanmakuLoadBound) {
              nativeChatFrame.dataset.ytDanmakuLoadBound = "true";
              nativeChatFrame.addEventListener("load", () => {
                window.setTimeout(checkAndBindDanmakuChat, 400);
              });
            }
          }
          removeBackgroundChatFrame();
          return null;
        }
      }

      if (nativeChatFrame && !nativeChatIsCurrent && !isYouTubeLiveVideo()) {
        startNativeReplayChatOffscreen(nativeChatFrame);
        if (!nativeChatFrame.dataset.ytDanmakuLoadBound) {
          nativeChatFrame.dataset.ytDanmakuLoadBound = "true";
          nativeChatFrame.addEventListener("load", () => {
            window.setTimeout(checkAndBindDanmakuChat, 400);
          });
        }
      }
      return (
        createBackgroundChatFrame() ||
        (nativeChatIsCurrent ? nativeChatFrame : null)
      );
    }

    function resetChatObservers(): void {
      if (replayChatWarmupTimer) clearTimeout(replayChatWarmupTimer);
      replayChatWarmupTimer = null;
      bufferingReplayChat = false;
      chatObserver?.disconnect();
      chatObserver = null;
      chatDocumentObserver?.disconnect();
      chatDocumentObserver = null;
      observedChatDocument = null;
      observedChatFrame = null;
      observedItemsNode = null;
      observerAttachedAt = 0;
    }

    function findChatItemsContainer(chatDoc: Document): Element | null {
      return (
        chatDoc.querySelector("yt-live-chat-item-list-renderer #items") ||
        chatDoc.querySelector("#item-list #items") ||
        chatDoc.querySelector("#items.yt-live-chat-item-list-renderer")
      );
    }

    function waitForChatItems(
      chatFrame: HTMLIFrameElement,
      chatDoc: Document,
    ): void {
      if (observedChatDocument === chatDoc && chatDocumentObserver) return;
      const videoId = observedChatVideoId;
      chatDocumentObserver?.disconnect();
      observedChatDocument = chatDoc;
      const observer = new MutationObserver(() => {
        if (videoId !== getYouTubeVideoId()) {
          checkAndBindDanmakuChat();
          return;
        }
        if (!findChatItemsContainer(chatDoc)) return;
        observer.disconnect();
        if (chatDocumentObserver === observer) {
          chatDocumentObserver = null;
          observedChatDocument = null;
        }
        if (chatFrame === observedChatFrame) checkAndBindDanmakuChat();
      });
      if (!chatDoc.documentElement) {
        observedChatDocument = null;
        return;
      }
      chatDocumentObserver = observer;
      observer.observe(chatDoc.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    function checkAndBindDanmakuChat(): void {
      if (!YOUTUBE_IS_PAGE || destroyed) return;
      const videoId = getYouTubeVideoId();
      if (videoId !== observedChatVideoId) {
        const changedVideo = Boolean(observedChatVideoId);
        if (
          nativeReplayChatFallback &&
          (nativeReplayChatFallback.videoId !== videoId ||
            nativeReplayChatFallback.chatFrame !== getNativeChatIframe())
        )
          restoreNativeReplayChat();
        resetChatObservers();
        observedChatVideoId = videoId;
        resetReplayMessagesForVideo(videoId);
        if (changedVideo && !isYouTubeLiveVideo()) {
          const nativeChatFrame = getNativeChatIframe();
          if (nativeChatFrame) startNativeReplayChatOffscreen(nativeChatFrame);
        }
      }
      const chatFrame = getChatIframe();
      if (!chatFrame) {
        unbindReplayVideo();
        if (nativeReplayChatFallback?.videoId !== videoId)
          restoreNativeReplayChat();
        resetChatObservers();
        return;
      }

      if (!dependencies.relay) bindReplayVideo();
      if (chatFrame !== observedChatFrame) {
        resetChatObservers();
        observedChatFrame = chatFrame;
      }

      let chatDoc: Document | null = null;
      try {
        chatDoc =
          chatFrame.contentDocument ||
          chatFrame.contentWindow?.document ||
          null;
      } catch {
        return;
      }
      if (!chatDoc) return;

      const itemsContainer = findChatItemsContainer(chatDoc);
      if (!itemsContainer) {
        waitForChatItems(chatFrame, chatDoc);
        if (!chatFrame.dataset.ytDanmakuLoadBound) {
          chatFrame.dataset.ytDanmakuLoadBound = "true";
          chatFrame.addEventListener("load", () => {
            window.setTimeout(checkAndBindDanmakuChat, 400);
          });
        }
        return;
      }

      chatDocumentObserver?.disconnect();
      chatDocumentObserver = null;
      observedChatDocument = null;
      if (itemsContainer === observedItemsNode) {
        syncYouTubeReplayChat();
        return;
      }

      chatObserver?.disconnect();
      observedItemsNode = itemsContainer;
      observerAttachedAt = Date.now();
      if (!dependencies.relay && !isYouTubeLiveVideo()) {
        bufferingReplayChat = true;
        replayChatWarmupTimer = window.setTimeout(() => {
          replayChatWarmupTimer = null;
          bufferingReplayChat = false;
          processReplayMessages();
        }, 300);
      }

      const existing = itemsContainer.querySelectorAll(
        "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
      );
      existing.forEach((node) => {
        const data =
          globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
            node,
            !dependencies.relay,
          );
        if (data) receiveDanmaku(data, { initial: true });
      });
      processReplayMessages();

      chatObserver = new MutationObserver((mutations) => {
        if (videoId !== getYouTubeVideoId()) {
          checkAndBindDanmakuChat();
          return;
        }
        for (const mutation of mutations) {
          for (const addedNode of mutation.addedNodes) {
            if (addedNode.nodeType !== 1) continue;
            const element = addedNode as Element;
            const data =
              globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                element,
                !dependencies.relay,
              );
            if (data) receiveDanmaku(data);
            else {
              const children = element.querySelectorAll(
                "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
              );
              children.forEach((child) => {
                const childData =
                  globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                    child,
                    !dependencies.relay,
                  );
                if (childData) receiveDanmaku(childData);
              });
            }
          }
        }
      });

      chatObserver.observe(itemsContainer, { childList: true, subtree: true });
      syncYouTubeReplayChat();
    }

    return {
      checkAndBind: checkAndBindDanmakuChat,
      isReady: () =>
        Boolean(
          observedItemsNode &&
          (!dependencies.relay ||
            !isYouTubeLiveVideo() ||
            Date.now() - observerAttachedAt >= 2000),
        ),
      isLive: isYouTubeLiveVideo,
      setRelayClock(clock) {
        const changed =
          !relayClock || clock.seekRevision !== relayClock.seekRevision;
        relayClock = clock;
        if (changed) {
          relayedIds.clear();
          observedItemsNode
            ?.querySelectorAll(
              "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
            )
            .forEach((node) => {
              const data =
                globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                  node,
                  false,
                );
              receiveDanmaku(data, { initial: true });
            });
        }
        syncYouTubeReplayChat();
      },
      destroy() {
        destroyed = true;
        resetChatObservers();
        relayedIds.clear();
        unbindReplayVideo();
        restoreNativeReplayChat();
        removeBackgroundChatFrame();
        replayMessages.clear();
        pendingReplayMessages.clear();
      },
      getMessages: () => {
        const chatFrame = getChatIframe();
        if (chatFrame) {
          try {
            const chatDoc =
              chatFrame.contentDocument || chatFrame.contentWindow?.document;
            const container = chatDoc ? findChatItemsContainer(chatDoc) : null;
            if (container) {
              container
                .querySelectorAll(
                  "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
                )
                .forEach((node) => {
                  const data =
                    globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                      node,
                      false,
                    );
                  if (data) receiveDanmaku(data, { initial: true });
                });
            }
          } catch {}
        }
        return [...replayMessages.values()].map((e) => e.data);
      },
    };
  }

  // 獨立的控制器讓 relay 時鐘與解析器去重功能，與本來源分頁自己的播放器及本地彈幕渲染器保持獨立。
  let relay: ContentYouTubeDanmakuController | null = null;
  let relayId = "";
  let relayVideoId = "";
  let relayRevision = 0;
  let relayTimer: ReturnType<typeof setInterval> | null = null;
  let finishStart: ((res: unknown) => void) | null = null;

  function stopRelay(): void {
    if (relayTimer) clearInterval(relayTimer);
    relayTimer = null;
    relay?.destroy();
    relay = null;
    relayId = "";
    finishStart?.({ ok: false });
    finishStart = null;
  }

  if (YOUTUBE_IS_PAGE)
    globalThis.PipCompanion.runtimeMessages.addListener(
      [
        "YOUTUBE_CHAT_PROBE",
        "YOUTUBE_CHAT_START",
        "YOUTUBE_CHAT_STOP",
        "YOUTUBE_CHAT_CLOCK",
      ],
      (msg, sender, respond) => {
        if (
          sender.id !== chrome.runtime.id ||
          sender.tab ||
          !globalThis.PipCompanion.util.isExtensionMessage(msg)
        )
          return;
        const videoId = globalThis.PipCompanion.site.parseYouTubeVideoId(
          location.href,
        );
        if (msg.type === "YOUTUBE_CHAT_PROBE") {
          respond(videoId ? { videoId, url: location.href } : null);
          return;
        }
        if (msg.type === "YOUTUBE_CHAT_STOP") {
          if (msg.connectionId === relayId) stopRelay();
          respond({ ok: true });
          return;
        }
        if (msg.type === "YOUTUBE_CHAT_CLOCK") {
          if (
            msg.connectionId === relayId &&
            msg.seekRevision >= relayRevision &&
            relay
          ) {
            relayRevision = msg.seekRevision;
            relay.setRelayClock(msg);
          }
          respond({ ok: true });
          return;
        }
        if (msg.type !== "YOUTUBE_CHAT_START" || msg.videoId !== videoId) {
          respond({ ok: false });
          return;
        }
        stopRelay();
        relayId = msg.connectionId;
        relayVideoId = videoId;
        relayRevision = 0;
        finishStart = respond;
        relay = createYouTubeDanmaku({
          relay: true,
          lateToleranceSeconds: 0.5,
          restoreWindowSeconds: 0,
          isSettingsLoaded: () => true,
          isVisible: () => true,
          getSourceVideo: () => null,
          getMainRenderer: () => null,
          getPipRenderer: () => null,
          ensureMainRenderer: () => null,
          clear: () => {},
          broadcast(data) {
            if (finishStart) return;
            // 接收渲染器接受受限制的 HTTPS 圖片與十六進制顏色。
            const payload = { ...data };
            if (payload.bgColor && !/^#[\da-f]{6}$/i.test(payload.bgColor))
              delete payload.bgColor;
            void chrome.runtime
              .sendMessage({
                type: "YOUTUBE_CHAT_MESSAGE",
                connectionId: relayId,
                seekRevision: relayRevision,
                data: payload,
              } satisfies ExtensionMessage)
              .catch(() => {});
          },
        });
        const started = Date.now();
        const check = () => {
          if (
            globalThis.PipCompanion.site.parseYouTubeVideoId(location.href) !==
              relayVideoId ||
            (Date.now() - started > 20000 && finishStart)
          ) {
            void chrome.runtime
              .sendMessage({
                type: "YOUTUBE_CHAT_ENDED",
                connectionId: relayId,
              } satisfies ExtensionMessage)
              .catch(() => {});
            stopRelay();
            return;
          }
          relay?.checkAndBind();
          if (relay?.isReady() && finishStart) {
            const finish = finishStart;
            finishStart = null;
            finish({ ok: true, mode: relay.isLive() ? "live" : "replay" });
          }
        };
        relayTimer = setInterval(check, 500);
        check();
        return true;
      },
    );

  globalThis.PipCompanion.ContentYouTubeDanmaku = {
    create: createYouTubeDanmaku,
  };
})();
