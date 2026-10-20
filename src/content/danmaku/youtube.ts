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
            const elapsed = currentTime - entry.replayTime;
            entry.emitted = elapsed >= 0;
            if (elapsed < 0) pendingReplayMessages.add(entry);
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
          currentVideoEndpoint?: {
            watchEndpoint?: { videoId?: unknown };
          };
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
        if (data?.currentVideoEndpoint?.watchEndpoint?.videoId !== videoId)
          continue;
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
        if (!continuation) {
          removeBackgroundChatFrame();
          return null;
        }
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
        removeBackgroundChatFrame();
        return null;
      }

      const nativeChatFrame = getNativeChatIframe();
      if (
        (!dependencies.relay || isYouTubeLiveVideo()) &&
        nativeChatFrame &&
        hasChatItems(nativeChatFrame)
      ) {
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
        removeBackgroundChatFrame();
        replayMessages.clear();
        pendingReplayMessages.clear();
      },
      getMessages: () => [...replayMessages.values()].map((e) => e.data),
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
