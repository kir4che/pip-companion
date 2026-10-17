"use strict";

type ExtraBilibiliSource = {
  enabled: boolean;
  url: string;
  offsetSeconds: number;
};

type ExtraBilibiliIdentity =
  | { kind: "bilibili"; bvid: string; avid: string; page: number; key: string }
  | { kind: "bahamut"; videoSn: string; key: string }
  | { kind: "twitch"; channel: string; key: string }
  | { kind: "youtube"; videoId: string; key: string };

type ExtraBilibiliMessage = DanmakuData & { replayTime: number };

function isValidDanmakuData(
  value: unknown,
  requireReplayTime = false,
): value is DanmakuData {
  if (!globalThis.PipCompanion.util.isRecord(value)) return false;
  if (
    value.text !== undefined &&
    (typeof value.text !== "string" || value.text.length > 2000)
  )
    return false;
  if (
    value.type !== undefined &&
    value.type !== "right" &&
    value.type !== "top" &&
    value.type !== "bottom"
  )
    return false;
  for (const key of ["color", "bgColor"] as const)
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || !/^#[\da-f]{6}$/i.test(value[key]))
    )
      return false;
  if (value.isSuperChat !== undefined && typeof value.isSuperChat !== "boolean")
    return false;
  for (const key of ["author", "messageId", "id", "amount"] as const)
    if (
      value[key] !== undefined &&
      (typeof value[key] !== "string" || value[key].length > 2000)
    )
      return false;
  const hasReplayTime =
    value.replayTime !== undefined && value.replayTime !== null;
  if (
    (requireReplayTime || hasReplayTime) &&
    (typeof value.replayTime !== "number" ||
      !Number.isFinite(value.replayTime) ||
      value.replayTime < 0)
  )
    return false;
  if (value.parts !== undefined) {
    if (!Array.isArray(value.parts) || value.parts.length > 200) return false;
    for (const part of value.parts) {
      if (!globalThis.PipCompanion.util.isRecord(part)) return false;
      if (part.type === "text") {
        if (typeof part.text !== "string" || part.text.length > 2000)
          return false;
      } else if (part.type === "image") {
        if (
          typeof part.src !== "string" ||
          part.src.length > 2048 ||
          !/^https:\/\//i.test(part.src) ||
          typeof part.alt !== "string" ||
          part.alt.length > 2000
        )
          return false;
      } else return false;
    }
  }
  if (value.advanced !== undefined) {
    if (!globalThis.PipCompanion.util.isRecord(value.advanced)) return false;
    if (
      typeof value.advanced.text !== "string" ||
      value.advanced.text.length > 2000
    )
      return false;
    for (const key of [
      "fromX",
      "fromY",
      "toX",
      "toY",
      "sourceWidth",
      "sourceHeight",
      "fontSize",
      "durationMs",
      "alphaStart",
      "alphaEnd",
      "rotateZ",
      "rotateY",
    ] as const)
      if (
        typeof value.advanced[key] !== "number" ||
        !Number.isFinite(value.advanced[key])
      )
        return false;
    const durationMs = value.advanced.durationMs as number;
    if (durationMs <= 0 || durationMs > 600_000) return false;
  }
  return (
    (typeof value.text === "string" && value.text.trim().length > 0) ||
    (Array.isArray(value.parts) && value.parts.length > 0) ||
    value.advanced !== undefined
  );
}

function isExtraBilibiliMessage(value: unknown): value is ExtraBilibiliMessage {
  return isValidDanmakuData(value, true);
}

(() => {
  const SEGMENT_SECONDS =
    globalThis.PipCompanion.bilibiliDanmakuConfig.segmentSeconds;
  const LATE_TOLERANCE_SECONDS = 0.5;
  const DANMAKU_IS_YOUTUBE = globalThis.PipCompanion.site.isYouTubeHost(
    location.hostname,
  );
  const DANMAKU_IS_BILIBILI = globalThis.PipCompanion.site.isBilibiliHost(
    location.hostname,
  );

  function normalizeSource(value: unknown): ExtraBilibiliSource {
    if (!globalThis.PipCompanion.util.isRecord(value))
      return { enabled: false, url: "", offsetSeconds: 0 };
    const url = typeof value.url === "string" ? value.url.trim() : "";
    const offset = Number(value.offsetSeconds);
    return {
      enabled: value.enabled === true,
      url: url.length <= 2048 ? url : "",
      offsetSeconds: Number.isFinite(offset)
        ? Math.max(-3600, Math.min(3600, offset))
        : 0,
    };
  }

  function parseIdentity(value: string): ExtraBilibiliIdentity | null {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:") return null;
      if (globalThis.PipCompanion.site.isBilibiliHost(url.hostname)) {
        const parsedVideo = globalThis.PipCompanion.site.parseBilibiliVideoPath(
          url.pathname,
        );
        const page = Number(url.searchParams.get("p") || 1);
        if (!parsedVideo || !Number.isInteger(page) || page < 1 || page > 1000)
          return null;
        return {
          kind: "bilibili",
          bvid: parsedVideo.bvid,
          avid: parsedVideo.avid,
          page,
          key: `bilibili:${parsedVideo.videoId}:${page}`,
        };
      }
      if (
        globalThis.PipCompanion.site.isBahamutHost(url.hostname) &&
        url.pathname === "/animeVideo.php"
      ) {
        const videoSn = url.searchParams.get("sn") || "";
        if (!/^\d{1,12}$/.test(videoSn) || Number(videoSn) <= 0) return null;
        return { kind: "bahamut", videoSn, key: `bahamut:${videoSn}` };
      }
      if (
        globalThis.PipCompanion.site.isTwitchHost(url.hostname) &&
        /^\/[a-z0-9_]{1,25}$/i.test(url.pathname)
      ) {
        const channel = url.pathname.slice(1).toLowerCase();
        return { kind: "twitch", channel, key: `twitch:${channel}` };
      }
      if (globalThis.PipCompanion.site.isYouTubeHost(url.hostname)) {
        const videoId = globalThis.PipCompanion.site.parseYouTubeVideoId(
          url.href,
        );
        if (
          videoId &&
          /^[\w-]{11}$/.test(videoId) &&
          (url.pathname === "/watch" ||
            /^\/live\/[\w-]{11}\/?$/.test(url.pathname))
        )
          return { kind: "youtube", videoId, key: `youtube:${videoId}` };
      }
      return null;
    } catch {
      return null;
    }
  }

  function create(dependencies: ContentExtraBilibiliDanmakuDependencies) {
    let source: ExtraBilibiliSource = normalizeSource(null);
    let available = dependencies.isSourceAvailable(null);
    let sourceError: string | null = null;
    let sourceLoading = false;
    let sourceErrorRevision = 0;
    let identity: ExtraBilibiliIdentity | null = null;
    let mainPageKey = getMainPageKey();
    let video: HTMLVideoElement | null = null;
    let videoSourceKey = "";
    let videoController: AbortController | null = null;
    let generation = 0;
    let messages: ExtraBilibiliMessage[] = [];
    let messageIndex = 0;
    let emittedMessages = new WeakSet<ExtraBilibiliMessage>();
    const recentlyBroadcast = new Map<string, number>();
    const loadedSegments = new Set<number>();
    const loadingSegments = new Set<number>();
    let legacyFallbackLoaded = false;
    const liveMessageTimers = new Set<ReturnType<typeof setTimeout>>();
    const MAX_LIVE_MESSAGE_TIMERS = 2000;
    const TOGGLE_DEDUPLICATION_WINDOW_MS = 15000;
    // 高於背景端 findSourceTab + 5 秒重用等待 + 20 秒自動開啟的最差情況。
    const YOUTUBE_START_TIMEOUT_MS = 45000;
    let twitchConnectionId = "";
    let youtubeConnectionId = "";
    let youtubeMode: "live" | "replay" | null = null;
    let youtubeSeekRevision = 0;
    let youtubeClockTimer: ReturnType<typeof setInterval> | null = null;
    let youtubeStartTimer: ReturnType<typeof setTimeout> | null = null;

    function clearYouTubeStartTimer(): void {
      if (youtubeStartTimer) clearTimeout(youtubeStartTimer);
      youtubeStartTimer = null;
    }

    function stopYouTube(): void {
      if (youtubeClockTimer) clearInterval(youtubeClockTimer);
      youtubeClockTimer = null;
      clearYouTubeStartTimer();
      if (youtubeConnectionId)
        void chrome.runtime
          .sendMessage({
            type: "STOP_EXTRA_YOUTUBE_CHAT",
            connectionId: youtubeConnectionId,
          } satisfies ExtensionMessage)
          .catch(() => {});
      youtubeConnectionId = "";
      youtubeMode = null;
      setSourceLoading(false);
    }

    function sendYouTubeClock(): void {
      if (
        !video ||
        !youtubeConnectionId ||
        !youtubeMode ||
        identity?.kind !== "youtube" ||
        !Number.isFinite(video.currentTime)
      )
        return;
      const requestGeneration = generation;
      void chrome.runtime
        .sendMessage({
          type: "EXTRA_YOUTUBE_CHAT_CLOCK",
          connectionId: youtubeConnectionId,
          time: Math.max(0, video.currentTime - source.offsetSeconds),
          paused: video.paused || video.seeking || !dependencies.isVisible(),
          ended: video.ended,
          seekRevision: youtubeSeekRevision,
        } satisfies ExtensionMessage)
        .then((response: unknown) => {
          if (
            requestGeneration === generation &&
            globalThis.PipCompanion.util.isRecord(response) &&
            response.ok === false
          )
            handleLoadError(
              new Error("YouTube 聊天連線已失效，請重新套用來源。"),
              requestGeneration,
            );
        })
        .catch((error: unknown) => handleLoadError(error, requestGeneration));
    }

    function startYouTube(
      target: Extract<ExtraBilibiliIdentity, { kind: "youtube" }>,
    ): void {
      const requestGeneration = generation;
      youtubeConnectionId = crypto.randomUUID();
      youtubeSeekRevision = 0;
      setSourceLoading(true);
      clearYouTubeStartTimer();
      const startTimer = setTimeout(() => {
        if (youtubeStartTimer === startTimer) youtubeStartTimer = null;
        if (generation !== requestGeneration) return;
        handleLoadError(
          new Error("YouTube 來源連線逾時，請確認來源分頁已載入後再試。"),
          requestGeneration,
        );
      }, YOUTUBE_START_TIMEOUT_MS);
      youtubeStartTimer = startTimer;
      void chrome.runtime
        .sendMessage({
          type: "START_EXTRA_YOUTUBE_CHAT",
          videoId: target.videoId,
          connectionId: youtubeConnectionId,
        } satisfies ExtensionMessage)
        .then((response: unknown) => {
          if (generation !== requestGeneration || identity?.key !== target.key)
            return;
          if (
            !globalThis.PipCompanion.util.isRecord(response) ||
            response.ok !== true ||
            (response.mode !== "live" && response.mode !== "replay")
          )
            throw new Error(
              globalThis.PipCompanion.util.isRecord(response) &&
                typeof response.error === "string"
                ? response.error
                : "YouTube 聊天連線失敗。",
            );
          youtubeMode = response.mode;
          setSourceError(null);
          setSourceLoading(false);
          sendYouTubeClock();
          youtubeClockTimer = setInterval(() => {
            sendYouTubeClock();
            if (video) process(video);
          }, 250);
        })
        .catch((error: unknown) => handleLoadError(error, requestGeneration))
        .finally(() => {
          if (youtubeStartTimer === startTimer) {
            clearTimeout(startTimer);
            youtubeStartTimer = null;
          }
        });
    }

    function resetMessages(): void {
      generation++;
      pruneRecentlyBroadcast();
      messages = [];
      messageIndex = 0;
      emittedMessages = new WeakSet();
      loadedSegments.clear();
      loadingSegments.clear();
      legacyFallbackLoaded = false;
      for (const timer of liveMessageTimers) clearTimeout(timer);
      liveMessageTimers.clear();
    }

    function messageKey(data: DanmakuData): string | null {
      const id = data.messageId || data.id;
      const sourceKey = identity?.key ?? "";
      if (id) return `${sourceKey}:id:${id}`;
      if (typeof data.replayTime !== "number") return null;
      return `${sourceKey}:content:${data.replayTime}:${data.text ?? ""}:${data.author ?? ""}`;
    }

    function pruneRecentlyBroadcast(): void {
      const cutoff = Date.now() - TOGGLE_DEDUPLICATION_WINDOW_MS;
      for (const [key, timestamp] of recentlyBroadcast) {
        if (timestamp < cutoff) recentlyBroadcast.delete(key);
      }
    }

    function broadcastIfNew(
      data: DanmakuData,
      options?: { elapsed?: number; restore?: boolean },
    ): void {
      pruneRecentlyBroadcast();
      const key = messageKey(data);
      if (key !== null) {
        if (recentlyBroadcast.has(key)) return;
        recentlyBroadcast.set(key, Date.now());
      }
      dependencies.broadcast(data, options);
    }

    function findMessageIndex(time: number): number {
      let low = 0;
      let high = messages.length;
      while (low < high) {
        const middle = (low + high) >>> 1;
        const message = messages[middle];
        if (message && message.replayTime + source.offsetSeconds < time)
          low = middle + 1;
        else high = middle;
      }
      return low;
    }

    function process(videoElement: HTMLVideoElement): void {
      if (!dependencies.isVisible() || !identity || videoElement.seeking)
        return;
      if (
        identity.kind === "youtube" &&
        (youtubeMode !== "replay" || videoElement.paused)
      )
        return;
      const currentTime = videoElement.currentTime;
      if (!Number.isFinite(currentTime)) return;
      while (messageIndex < messages.length) {
        const message = messages[messageIndex];
        if (!message) break;
        const displayTime = message.replayTime + source.offsetSeconds;
        if (displayTime > currentTime + 0.15) break;
        messageIndex++;
        if (emittedMessages.has(message)) continue;
        emittedMessages.add(message);
        const elapsed = Math.max(0, currentTime - displayTime);
        if (elapsed <= LATE_TOLERANCE_SECONDS)
          broadcastIfNew(message, { elapsed });
      }
      if (
        messageIndex > 200 &&
        identity.kind === "bilibili" &&
        !legacyFallbackLoaded
      ) {
        messages = messages.slice(messageIndex);
        messageIndex = 0;
        emittedMessages = new WeakSet();
      }
    }

    function restoreRecent(videoElement: HTMLVideoElement): void {
      const currentTime = videoElement.currentTime;
      if (!Number.isFinite(currentTime) || videoElement.seeking) return;
      const end = findMessageIndex(currentTime);
      const start = findMessageIndex(Math.max(0, currentTime - 10));
      for (const message of messages.slice(start, end).slice(-100)) {
        if (emittedMessages.has(message)) continue;
        const elapsed = currentTime - message.replayTime - source.offsetSeconds;
        const lifetime = message.advanced
          ? Math.min(10, message.advanced.durationMs / 1000)
          : message.type === "top" || message.type === "bottom"
            ? 2
            : 3;
        if (elapsed < 0 || elapsed >= lifetime) continue;
        emittedMessages.add(message);
        broadcastIfNew(message, { elapsed, restore: true });
      }
    }

    function mergeMessages(incoming: ExtraBilibiliMessage[]): void {
      const ids = new Set(
        messages.map((message) => message.messageId || message.id),
      );
      for (const message of incoming) {
        const id = message.messageId || message.id;
        if (id && ids.has(id)) continue;
        if (id) ids.add(id);
        messages.push(message);
      }
      messages.sort((a, b) => a.replayTime - b.replayTime);
      if (
        messages.length > 50000 &&
        identity?.kind === "bilibili" &&
        !legacyFallbackLoaded
      ) {
        const anchor = video?.currentTime ?? messages[0]?.replayTime ?? 0;
        const center = findMessageIndex(anchor);
        const start = Math.max(0, center - 10000);
        messages = messages.slice(start, start + 30000);
        loadedSegments.clear();
        loadingSegments.clear();
        messageIndex = 0;
        emittedMessages = new WeakSet();
      }
      if (video && Number.isFinite(video.currentTime)) {
        messageIndex = findMessageIndex(
          video.currentTime - LATE_TOLERANCE_SECONDS,
        );
        if (identity?.kind !== "youtube") restoreRecent(video);
      }
    }

    function handleLoadError(error: unknown, requestGeneration: number): void {
      if (requestGeneration !== generation) return;
      setSource({ ...source, enabled: false }, true);
      const detail =
        error instanceof Error ? error.message.trim().slice(0, 160) : "";
      setSourceError(
        detail ? `額外彈幕載入失敗：${detail}` : "額外彈幕載入失敗。",
      );
    }

    function requestBahamutDanmaku(
      targetIdentity: Extract<ExtraBilibiliIdentity, { kind: "bahamut" }>,
    ): void {
      if (loadedSegments.has(1) || loadingSegments.has(1)) return;
      loadingSegments.add(1);
      const requestGeneration = generation;
      void chrome.runtime
        .sendMessage({
          type: "GET_BAHAMUT_DANMAKU",
          videoSn: targetIdentity.videoSn,
        } satisfies ExtensionMessage)
        .then((response: unknown) => {
          if (
            requestGeneration !== generation ||
            identity?.key !== targetIdentity.key
          )
            return;
          if (
            globalThis.PipCompanion.util.isRecord(response) &&
            response.ok === false
          )
            throw new Error(
              typeof response.error === "string"
                ? response.error
                : "Bahamut danmaku request was rejected",
            );
          if (
            !globalThis.PipCompanion.util.isRecord(response) ||
            response.ok !== true ||
            !Array.isArray(response.messages)
          )
            throw new Error("Invalid Bahamut danmaku response");
          setSourceError(null);
          const validMessages = response.messages.filter(
            isExtraBilibiliMessage,
          );
          mergeMessages(validMessages);
          loadedSegments.add(1);
          if (video) process(video);
        })
        .catch((error: unknown) => handleLoadError(error, requestGeneration))
        .finally(() => {
          if (requestGeneration === generation) loadingSegments.delete(1);
        });
    }

    function requestSegments(
      targetIdentity: Extract<ExtraBilibiliIdentity, { kind: "bilibili" }>,
      startSegment: number,
      endSegment: number,
    ): void {
      const start = Math.max(1, startSegment);
      const end = Math.min(start + 2, Math.max(start, endSegment));
      const segments: number[] = [];
      for (let segment = start; segment <= end; segment++) {
        if (!loadedSegments.has(segment) && !loadingSegments.has(segment))
          segments.push(segment);
      }
      if (!segments.length) return;

      const requestStart = segments[0];
      if (requestStart === undefined) return;
      let requestEnd = requestStart;
      for (const segment of segments.slice(1)) {
        if (segment !== requestEnd + 1) break;
        requestEnd = segment;
      }
      for (let segment = requestStart; segment <= requestEnd; segment++)
        loadingSegments.add(segment);

      const requestGeneration = generation;
      const payload: ExtensionMessage = {
        type: "GET_BILIBILI_DANMAKU",
        ...(targetIdentity.bvid
          ? { bvid: targetIdentity.bvid }
          : { avid: targetIdentity.avid }),
        page: targetIdentity.page,
        startSegment: requestStart,
        endSegment: requestEnd,
      };
      void chrome.runtime
        .sendMessage(payload)
        .then((response: unknown) => {
          if (
            requestGeneration !== generation ||
            identity?.key !== targetIdentity.key
          )
            return;
          if (
            globalThis.PipCompanion.util.isRecord(response) &&
            response.ok === false
          )
            throw new Error(
              typeof response.error === "string"
                ? response.error
                : "Bilibili danmaku request was rejected",
            );
          if (
            !globalThis.PipCompanion.util.isRecord(response) ||
            response.ok !== true ||
            !Array.isArray(response.messages)
          )
            throw new Error("Invalid Bilibili danmaku response");
          setSourceError(null);
          const validMessages = response.messages.filter(
            isExtraBilibiliMessage,
          );
          if (response.legacyFallback === true) legacyFallbackLoaded = true;
          mergeMessages(validMessages);
          if (response.legacyFallback !== true) {
            for (let segment = requestStart; segment <= requestEnd; segment++)
              loadedSegments.add(segment);
          }
          if (video) process(video);
        })
        .catch((error: unknown) => handleLoadError(error, requestGeneration))
        .finally(() => {
          if (requestGeneration !== generation) return;
          for (let segment = requestStart; segment <= requestEnd; segment++)
            loadingSegments.delete(segment);
        });
    }

    function ensureSegments(videoElement: HTMLVideoElement): void {
      if (
        !source.enabled ||
        !identity ||
        !dependencies.isVisible() ||
        !Number.isFinite(videoElement.currentTime)
      )
        return;
      if (identity.kind === "twitch" || identity.kind === "youtube") return;
      if (identity.kind === "bahamut") {
        requestBahamutDanmaku(identity);
        return;
      }
      if (legacyFallbackLoaded) return;
      const sourceTime = Math.max(
        0,
        videoElement.currentTime - source.offsetSeconds,
      );
      const currentSegment = Math.floor(sourceTime / SEGMENT_SECONDS) + 1;
      requestSegments(identity, currentSegment, currentSegment + 2);
    }

    function publishSourceState(): void {
      void chrome.runtime
        .sendMessage({
          type: "EXTRA_DANMAKU_SOURCE_CHANGED",
          source,
          available,
        } satisfies ExtensionMessage)
        .catch(() => {});
    }

    function updateAvailability(videoElement: HTMLVideoElement | null): void {
      const nextAvailable = dependencies.isSourceAvailable(videoElement);
      if (available === nextAvailable) return;
      available = nextAvailable;
      if (!available && source.enabled) {
        setSource({ ...source, enabled: false });
        return;
      }
      publishSourceState();
    }

    function setSource(value: unknown, preserveError = false): void {
      const nextAvailable = dependencies.isSourceAvailable(video);
      const availabilityChanged = available !== nextAvailable;
      available = nextAvailable;
      const next = normalizeSource(value);
      if (!available) next.enabled = false;
      const parsedIdentity = next.enabled ? parseIdentity(next.url) : null;
      if (next.enabled && !parsedIdentity) next.enabled = false;
      if (
        DANMAKU_IS_YOUTUBE &&
        location.pathname.startsWith("/live/") &&
        parsedIdentity?.kind !== "twitch"
      )
        next.enabled = false;
      const nextIdentity = next.enabled ? parsedIdentity : null;
      if (
        next.url === source.url &&
        next.enabled === source.enabled &&
        next.offsetSeconds === source.offsetSeconds &&
        nextIdentity?.key === identity?.key
      ) {
        if (availabilityChanged) publishSourceState();
        return;
      }
      if (identity?.kind === "youtube") dependencies.clear?.();
      stopYouTube();
      resetMessages();
      if (!preserveError) setSourceError(null);
      source = next;
      identity = nextIdentity;
      publishSourceState();
      twitchConnectionId = "";
      if (nextIdentity?.kind === "youtube") startYouTube(nextIdentity);
      if (nextIdentity?.kind === "twitch") {
        void chrome.runtime
          .sendMessage({
            type: "START_EXTRA_TWITCH_CHAT",
            channel: nextIdentity.channel,
          } satisfies ExtensionMessage)
          .catch((error: unknown) => handleLoadError(error, generation));
      } else {
        void chrome.runtime
          .sendMessage({
            type: "STOP_EXTRA_TWITCH_CHAT",
          } satisfies ExtensionMessage)
          .catch(() => {});
      }
      if (video) ensureSegments(video);
    }

    function getMainPageKey(): string {
      const currentSite = globalThis.PipCompanion.site;
      if (currentSite.isYouTubeHost(location.hostname))
        return `youtube:${currentSite.parseYouTubeVideoId(location.href) || ""}`;
      const currentVideo = currentSite.parseBilibiliVideoPath(
        location.pathname,
      );
      return currentVideo
        ? `bilibili:${currentVideo.videoId}:${new URL(location.href).searchParams.get("p") || "1"}`
        : `page:${location.href}`;
    }

    function publishSourceStatus(): void {
      sourceErrorRevision++;
      void chrome.runtime
        .sendMessage({
          type: "EXTRA_DANMAKU_SOURCE_STATUS",
          error: sourceError,
          loading: sourceLoading,
          revision: sourceErrorRevision,
        } satisfies ExtensionMessage)
        .catch(() => {});
    }

    function setSourceError(error: string | null): void {
      if (sourceError === error) return;
      sourceError = error;
      publishSourceStatus();
    }

    function setSourceLoading(loading: boolean): void {
      if (sourceLoading === loading) return;
      sourceLoading = loading;
      publishSourceStatus();
    }

    function getSource(): ExtraBilibiliSource & {
      available: boolean;
      error: string | null;
      loading: boolean;
      errorRevision: number;
    } {
      updateAvailability(video);
      return {
        ...source,
        available,
        error: sourceError,
        loading: sourceLoading,
        errorRevision: sourceErrorRevision,
      };
    }

    function checkAndBind(nextVideo: HTMLVideoElement | null): void {
      const nextPageKey = getMainPageKey();
      const nextVideoSourceKey = nextVideo?.currentSrc || nextVideo?.src || "";
      const genericVideoChanged =
        !DANMAKU_IS_YOUTUBE &&
        !DANMAKU_IS_BILIBILI &&
        Boolean(
          videoSourceKey &&
          nextVideoSourceKey &&
          videoSourceKey !== nextVideoSourceKey,
        );
      if (mainPageKey !== nextPageKey || genericVideoChanged) {
        mainPageKey = nextPageKey;
        setSource({ ...source, enabled: false });
      }
      if (nextVideo !== video) {
        videoController?.abort();
        videoController = null;
        video = nextVideo;
        if (video) {
          const controller = new AbortController();
          videoController = controller;
          video.addEventListener(
            "timeupdate",
            () => {
              if (!video) return;
              process(video);
              ensureSegments(video);
              sendYouTubeClock();
            },
            { signal: controller.signal },
          );
          for (const event of ["play", "pause", "ratechange", "ended"])
            video.addEventListener(event, sendYouTubeClock, {
              signal: controller.signal,
            });
          video.addEventListener(
            "seeking",
            () => {
              if (identity?.kind !== "youtube") return;
              youtubeSeekRevision++;
              messages = [];
              messageIndex = 0;
              emittedMessages = new WeakSet();
              recentlyBroadcast.clear();
              dependencies.clear?.();
              sendYouTubeClock();
            },
            { signal: controller.signal },
          );
          video.addEventListener(
            "seeked",
            () => {
              if (!video) return;
              if (identity?.kind === "bilibili") loadedSegments.clear();
              emittedMessages = new WeakSet();
              messageIndex = findMessageIndex(
                video.currentTime - LATE_TOLERANCE_SECONDS,
              );
              if (identity?.kind !== "youtube") restoreRecent(video);
              ensureSegments(video);
              sendYouTubeClock();
            },
            { signal: controller.signal },
          );
        }
      }
      if (nextVideoSourceKey) videoSourceKey = nextVideoSourceKey;
      updateAvailability(video);
      if (video) ensureSegments(video);
    }

    function scheduleLiveMessage(
      data: DanmakuData,
      kind: "twitch" | "youtube",
    ): void {
      if (typeof data.text !== "string" || !data.text.trim()) return;
      const delay = Math.max(0, source.offsetSeconds) * 1000;
      const timer = setTimeout(() => {
        liveMessageTimers.delete(timer);
        if (identity?.kind === kind && source.enabled) broadcastIfNew(data);
      }, delay);
      liveMessageTimers.add(timer);
      while (liveMessageTimers.size > MAX_LIVE_MESSAGE_TIMERS) {
        const oldestTimer = liveMessageTimers.values().next().value;
        if (oldestTimer === undefined) break;
        clearTimeout(oldestTimer);
        liveMessageTimers.delete(oldestTimer);
      }
    }

    globalThis.PipCompanion.runtimeMessages.addListener(
      [
        "EXTRA_TWITCH_CHAT_STATUS",
        "EXTRA_TWITCH_CHAT_MESSAGE",
        "EXTRA_YOUTUBE_CHAT_STATUS",
        "EXTRA_YOUTUBE_CHAT_MESSAGE",
        "GET_EXTRA_DANMAKU_SOURCE",
        "SET_EXTRA_DANMAKU_SOURCE",
      ],
      (message, _sender, sendResponse) => {
        if (!globalThis.PipCompanion.util.isRecord(message)) return;
        if (
          message.type === "EXTRA_YOUTUBE_CHAT_STATUS" ||
          message.type === "EXTRA_YOUTUBE_CHAT_MESSAGE"
        ) {
          if (
            _sender.id !== chrome.runtime.id ||
            _sender.tab ||
            identity?.kind !== "youtube" ||
            message.videoId !== identity.videoId ||
            message.connectionId !== youtubeConnectionId
          )
            return;
          if (message.type === "EXTRA_YOUTUBE_CHAT_STATUS") {
            handleLoadError(
              new Error(
                typeof message.error === "string"
                  ? message.error
                  : "YouTube 聊天來源已中斷。",
              ),
              generation,
            );
          } else if (
            message.seekRevision === youtubeSeekRevision &&
            isValidDanmakuData(message.data, youtubeMode === "replay")
          ) {
            if (youtubeMode === "live")
              scheduleLiveMessage(message.data, "youtube");
            else if (
              youtubeMode === "replay" &&
              video &&
              isExtraBilibiliMessage(message.data)
            ) {
              const time = video.currentTime - source.offsetSeconds;
              if (
                message.data.replayTime < time - 10 ||
                message.data.replayTime > time + 30
              )
                return;
              messages = messages
                .filter(
                  (m) => m.replayTime >= time - 10 && m.replayTime <= time + 30,
                )
                .slice(-1999);
              mergeMessages([message.data]);
              process(video);
            }
          }
          return;
        }
        if (
          message.type === "EXTRA_TWITCH_CHAT_STATUS" &&
          identity?.kind === "twitch" &&
          message.channel === identity.channel &&
          typeof message.connectionId === "string"
        ) {
          if (message.status === "connected")
            twitchConnectionId = message.connectionId;
          if (
            message.status !== "connected" &&
            message.connectionId !== twitchConnectionId
          )
            return;
          setSourceError(
            message.status === "error"
              ? typeof message.error === "string"
                ? message.error
                : "Twitch 聊天連線失敗。"
              : null,
          );
          return;
        }
        if (
          message.type === "EXTRA_TWITCH_CHAT_MESSAGE" &&
          identity?.kind === "twitch" &&
          message.channel === identity.channel &&
          message.connectionId === twitchConnectionId &&
          globalThis.PipCompanion.util.isRecord(message.data)
        ) {
          if (isValidDanmakuData(message.data))
            scheduleLiveMessage(message.data, "twitch");
          return;
        }
        if (message.type === "GET_EXTRA_DANMAKU_SOURCE") {
          sendResponse(getSource());
          return;
        }
        if (message.type === "SET_EXTRA_DANMAKU_SOURCE") {
          setSource(message.source);
          sendResponse(getSource());
          return;
        }
      },
    );

    return { checkAndBind, getSource, setSource };
  }

  globalThis.PipCompanion =
    globalThis.PipCompanion || ({} as PipCompanionGlobal);
  globalThis.PipCompanion.ContentExtraBilibiliDanmaku = { create };
})();
