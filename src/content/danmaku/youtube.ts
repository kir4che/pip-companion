"use strict";

(() => {
  const YOUTUBE_IS_PAGE = globalThis.PipCompanion.site.isYouTubeHost(
    location.hostname,
  );
  const YOUTUBE_MAX_REPLAY_MESSAGES = 2000;

  function createYouTubeDanmaku(
    dependencies: ContentYouTubeDanmakuDependencies,
  ): ContentYouTubeDanmakuController {
    let backgroundChatFrame: HTMLIFrameElement | null = null;
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
    let observedChatVideoId = "";
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
        typeof currentTime !== "number" ||
        !Number.isFinite(currentTime)
      )
        return;

      const dueMessages = [...pendingReplayMessages]
        .filter((entry) => entry.replayTime <= currentTime + 0.1)
        .sort((a, b) => a.replayTime - b.replayTime);

      for (const entry of dueMessages) {
        pendingReplayMessages.delete(entry);
        entry.emitted = true;
        const elapsed = Math.max(0, currentTime - entry.replayTime);
        if (elapsed > dependencies.lateToleranceSeconds) continue;
        dependencies.broadcast(entry.data, { elapsed, restore: elapsed > 0 });
      }
    }

    function receiveDanmaku(
      data: DanmakuData | null | undefined,
      { initial = false }: { initial?: boolean } = {},
    ): void {
      if (!data) return;
      if (YOUTUBE_IS_PAGE && isYouTubeLiveVideo()) {
        if (!initial) dependencies.broadcast(data);
        return;
      }

      if (
        typeof data.replayTime !== "number" ||
        !Number.isFinite(data.replayTime)
      ) {
        if (!initial) dependencies.broadcast(data);
        return;
      }

      const currentTime = replayVideo?.currentTime;
      const messageKey = data.messageId || Symbol();
      let entry = replayMessages.get(messageKey);
      if (!entry) {
        entry = {
          data,
          replayTime: data.replayTime,
          emitted:
            typeof currentTime === "number" &&
            Number.isFinite(currentTime) &&
            data.replayTime < currentTime - dependencies.lateToleranceSeconds,
        };
        replayMessages.set(messageKey, entry);
        if (!entry.emitted) pendingReplayMessages.add(entry);
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
      const frame = backgroundChatFrame;
      const video = replayVideo;
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
      dispatchAction("yt-live-player-video-progress", [video.currentTime]);
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
          const restoreWindow = Math.max(
            dependencies.restoreWindowSeconds,
            dependencies.getMainRenderer()?.duration || 0,
            dependencies.getPipRenderer()?.duration || 0,
          );
          const entries = [...replayMessages.values()].sort(
            (a, b) => a.replayTime - b.replayTime,
          );
          dependencies.ensureMainRenderer();

          const restoringRenderers = [
            dependencies.getMainRenderer(),
            dependencies.getPipRenderer(),
          ].filter((r): r is DanmakuRendererHandle => r !== null);

          for (const renderer of restoringRenderers)
            renderer.beginSeekRestore();
          pendingReplayMessages.clear();
          try {
            for (const entry of entries) {
              const elapsed = currentTime - entry.replayTime;
              entry.emitted = elapsed >= 0;
              if (elapsed < 0) pendingReplayMessages.add(entry);
              if (elapsed < 0 || elapsed > restoreWindow) continue;
              dependencies.broadcast(entry.data, { elapsed, restore: true });
            }
          } finally {
            for (const renderer of restoringRenderers)
              renderer.endSeekRestore();
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

      for (const script of document.scripts) {
        const data = parseYouTubeAssignedData(
          script.textContent || "",
          /ytInitialPlayerResponse\s*=\s*/,
        ) as {
          videoDetails?: { isLiveContent?: unknown };
          microformat?: {
            playerMicroformatRenderer?: {
              liveBroadcastDetails?: {
                isLiveNow?: unknown;
                endTimestamp?: unknown;
              };
            };
          };
        } | null;
        if (!data) continue;

        const liveBroadcastDetails =
          data.microformat?.playerMicroformatRenderer?.liveBroadcastDetails;
        const isLiveNow = liveBroadcastDetails?.isLiveNow;
        const isLiveContent = data.videoDetails?.isLiveContent;
        if (
          typeof isLiveNow === "boolean" ||
          typeof isLiveContent === "boolean"
        ) {
          const hasEnded =
            typeof liveBroadcastDetails?.endTimestamp === "string";
          const isLive =
            isLiveNow === true || (isLiveContent === true && !hasEnded);
          youtubeLiveStatusCache = { videoId, isLive };
          return isLive;
        }
      }

      const player = document.querySelector("#movie_player");
      return Boolean(
        document.querySelector("ytd-watch-flexy[is-live-video]") ||
        player?.classList.contains("ytp-live") ||
        player?.querySelector(".ytp-live-badge"),
      );
    }

    function getYouTubeReplayContinuation(videoId: string): string | null {
      if (youtubeReplayContinuationCache?.videoId === videoId)
        return youtubeReplayContinuationCache.token;

      for (const script of document.scripts) {
        const data = parseYouTubeAssignedData(
          script.textContent || "",
          /ytInitialData["']?\]?\s*=\s*/,
        ) as {
          contents?: {
            twoColumnWatchNextResults?: {
              conversationBar?: {
                liveChatRenderer?: {
                  continuations?: Array<{
                    reloadContinuationData?: { continuation?: unknown };
                  }>;
                };
              };
            };
          };
        } | null;
        const continuations =
          data?.contents?.twoColumnWatchNextResults?.conversationBar
            ?.liveChatRenderer?.continuations || [];
        for (const item of continuations) {
          const token = item.reloadContinuationData?.continuation;
          if (typeof token === "string" && token) {
            youtubeReplayContinuationCache = { videoId, token };
            return token;
          }
        }
      }
      return null;
    }

    function getNativeChatIframe(): HTMLIFrameElement | null {
      return (
        document.querySelector<HTMLIFrameElement>(
          "ytd-live-chat-frame iframe#chatframe",
        ) ||
        document.querySelector<HTMLIFrameElement>("iframe#chatframe") ||
        document.querySelector<HTMLIFrameElement>("ytd-live-chat-frame iframe")
      );
    }

    function removeBackgroundChatFrame(): void {
      if (!backgroundChatFrame) return;
      if (observedChatFrame === backgroundChatFrame) resetChatObservers();
      backgroundChatFrame.remove();
      backgroundChatFrame = null;
    }

    function createBackgroundChatFrame(): HTMLIFrameElement | null {
      const videoId = new URL(location.href).searchParams.get("v");
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
        if (!continuation) {
          removeBackgroundChatFrame();
          return null;
        }
        chatUrl.searchParams.set("continuation", continuation);
      }
      if (backgroundChatFrame?.src === chatUrl.href) return backgroundChatFrame;
      removeBackgroundChatFrame();

      const frame = document.createElement("iframe");
      frame.title = "YouTube 聊天室訊息來源";
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
        removeBackgroundChatFrame();
        return null;
      }

      const nativeChatFrame = getNativeChatIframe();
      if (nativeChatFrame && hasChatItems(nativeChatFrame)) {
        removeBackgroundChatFrame();
        return nativeChatFrame;
      }

      return createBackgroundChatFrame() || nativeChatFrame;
    }

    function resetChatObservers(): void {
      chatObserver?.disconnect();
      chatObserver = null;
      chatDocumentObserver?.disconnect();
      chatDocumentObserver = null;
      observedChatDocument = null;
      observedChatFrame = null;
      observedItemsNode = null;
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
      if (!YOUTUBE_IS_PAGE) return;
      const videoId = getYouTubeVideoId();
      if (videoId !== observedChatVideoId) {
        resetChatObservers();
        observedChatVideoId = videoId;
        resetReplayMessagesForVideo(videoId);
      }
      const chatFrame = getChatIframe();
      if (!chatFrame) {
        unbindReplayVideo();
        resetChatObservers();
        return;
      }

      bindReplayVideo();
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

      const existing = itemsContainer.querySelectorAll(
        "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
      );
      existing.forEach((node) => {
        const data =
          globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
            node,
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
            if (!(addedNode instanceof Element)) continue;
            const data =
              globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                addedNode,
              );
            if (data) receiveDanmaku(data);
            else {
              const children = addedNode.querySelectorAll(
                "yt-live-chat-text-message-renderer, yt-live-chat-paid-message-renderer",
              );
              children.forEach((child) => {
                const childData =
                  globalThis.PipCompanion.ContentDanmakuSources.parseYouTubeMessage(
                    child,
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
      destroy() {
        unbindReplayVideo();
        removeBackgroundChatFrame();
        replayMessages.clear();
        pendingReplayMessages.clear();
      },
    };
  }

  globalThis.PipCompanion.ContentYouTubeDanmaku = {
    create: createYouTubeDanmaku,
  };
})();
