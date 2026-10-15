"use strict";

type AdditionalBilibiliSource = {
  enabled: boolean;
  url: string;
  offsetSeconds: number;
};

type AdditionalBilibiliIdentity =
  | { kind: "bilibili"; bvid: string; avid: string; page: number; key: string }
  | { kind: "bahamut"; videoSn: string; key: string }
  | { kind: "twitch"; channel: string; key: string };

type AdditionalBilibiliMessage = DanmakuData & { replayTime: number };

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

function isAdditionalBilibiliMessage(
  value: unknown,
): value is AdditionalBilibiliMessage {
  return isValidDanmakuData(value, true);
}

(() => {
  const SEGMENT_SECONDS =
    globalThis.PipCompanion.bilibiliDanmakuConfig.segmentSeconds;
  const LATE_TOLERANCE_SECONDS = 0.5;

  function normalizeSource(value: unknown): AdditionalBilibiliSource {
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

  function parseIdentity(value: string): AdditionalBilibiliIdentity | null {
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
      return null;
    } catch {
      return null;
    }
  }

  function create(dependencies: ContentAdditionalBilibiliDanmakuDependencies) {
    let source: AdditionalBilibiliSource = normalizeSource(null);
    let available = dependencies.isSourceAvailable(null);
    let sourceError: string | null = null;
    let sourceErrorRevision = 0;
    let identity: AdditionalBilibiliIdentity | null = null;
    let mainPageKey = getMainPageKey();
    let video: HTMLVideoElement | null = null;
    let videoSourceKey = "";
    let videoController: AbortController | null = null;
    let generation = 0;
    let messages: AdditionalBilibiliMessage[] = [];
    let messageIndex = 0;
    let emittedMessages = new WeakSet<AdditionalBilibiliMessage>();
    const recentlyBroadcast = new Map<string, number>();
    const loadedSegments = new Set<number>();
    const loadingSegments = new Set<number>();
    let legacyFallbackLoaded = false;
    const liveMessageTimers = new Set<ReturnType<typeof setTimeout>>();
    const MAX_LIVE_MESSAGE_TIMERS = 2000;
    const TOGGLE_DEDUPLICATION_WINDOW_MS = 15000;
    let twitchConnectionId = "";

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

    function mergeMessages(incoming: AdditionalBilibiliMessage[]): void {
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
        restoreRecent(video);
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
      targetIdentity: Extract<AdditionalBilibiliIdentity, { kind: "bahamut" }>,
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
            isAdditionalBilibiliMessage,
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
      targetIdentity: Extract<AdditionalBilibiliIdentity, { kind: "bilibili" }>,
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
            isAdditionalBilibiliMessage,
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
      if (identity.kind === "twitch") return;
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
          type: "ADDITIONAL_DANMAKU_SOURCE_CHANGED",
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
      resetMessages();
      if (!preserveError) setSourceError(null);
      source = next;
      identity = nextIdentity;
      publishSourceState();
      twitchConnectionId = "";
      if (nextIdentity?.kind === "twitch") {
        void chrome.runtime
          .sendMessage({
            type: "START_ADDITIONAL_TWITCH_CHAT",
            channel: nextIdentity.channel,
          } satisfies ExtensionMessage)
          .catch((error: unknown) => handleLoadError(error, generation));
      } else {
        void chrome.runtime
          .sendMessage({
            type: "STOP_ADDITIONAL_TWITCH_CHAT",
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

    function setSourceError(error: string | null): void {
      if (sourceError === error) return;
      sourceError = error;
      sourceErrorRevision++;
      void chrome.runtime
        .sendMessage({
          type: "ADDITIONAL_DANMAKU_SOURCE_STATUS",
          error,
          revision: sourceErrorRevision,
        } satisfies ExtensionMessage)
        .catch(() => {});
    }

    function getSource(): AdditionalBilibiliSource & {
      available: boolean;
      error: string | null;
      errorRevision: number;
    } {
      updateAvailability(video);
      return {
        ...source,
        available,
        error: sourceError,
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
              restoreRecent(video);
              ensureSegments(video);
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

    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!globalThis.PipCompanion.util.isRecord(message)) return;
      if (
        message.type === "ADDITIONAL_TWITCH_CHAT_STATUS" &&
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
        message.type === "ADDITIONAL_TWITCH_CHAT_MESSAGE" &&
        identity?.kind === "twitch" &&
        message.channel === identity.channel &&
        message.connectionId === twitchConnectionId &&
        globalThis.PipCompanion.util.isRecord(message.data)
      ) {
        if (isValidDanmakuData(message.data))
          scheduleLiveMessage(message.data, "twitch");
        return;
      }
      if (message.type === "GET_ADDITIONAL_DANMAKU_SOURCE") {
        sendResponse(getSource());
        return;
      }
      if (message.type === "SET_ADDITIONAL_DANMAKU_SOURCE") {
        setSource(message.source);
        sendResponse(getSource());
        return;
      }
    });

    return { checkAndBind, getSource, setSource };
  }

  globalThis.PipCompanion =
    globalThis.PipCompanion || ({} as PipCompanionGlobal);
  globalThis.PipCompanion.ContentAdditionalBilibiliDanmaku = { create };
})();
