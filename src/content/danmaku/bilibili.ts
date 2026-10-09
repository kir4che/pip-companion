"use strict";

interface BilibiliVideoIdentity {
  bvid: string;
  avid: string;
  page: number;
  key: string;
}

interface BilibiliDanmakuMessage extends DanmakuData {
  id?: string;
  replayTime: number;
  type: DanmakuType;
  color?: string;
  text?: string;
}

interface BilibiliDanmakuResponseSuccess {
  ok: true;
  messages: BilibiliDanmakuMessage[];
  duration: number;
  segmentCount: number;
  segmentStart: number;
  segmentEnd: number;
  recoveredSegments?: { segment: number; status: number; comments: number }[];
  unavailableSegments?: { segment: number; status: number }[];
  fallbackError?: string;
  legacyFallback?: boolean;
}

interface BilibiliDanmakuResponseError {
  ok: false;
  error: string;
}

type BilibiliDanmakuResponse =
  BilibiliDanmakuResponseSuccess | BilibiliDanmakuResponseError;

function isBilibiliDanmakuMessage(
  value: unknown,
): value is BilibiliDanmakuMessage {
  const util = globalThis.PipCompanion.util;
  if (!util.isRecord(value)) return false;
  if (
    typeof value.replayTime !== "number" ||
    !Number.isFinite(value.replayTime) ||
    (value.type !== "right" && value.type !== "top" && value.type !== "bottom")
  )
    return false;

  for (const key of ["id", "color", "bgColor", "amount", "author", "messageId"])
    if (value[key] !== undefined && typeof value[key] !== "string")
      return false;
  if (value.isSuperChat !== undefined && typeof value.isSuperChat !== "boolean")
    return false;
  if (value.text !== undefined && typeof value.text !== "string") return false;
  if (
    value.parts !== undefined &&
    (!Array.isArray(value.parts) ||
      !value.parts.every(
        (part) =>
          util.isRecord(part) &&
          (part.type === "text"
            ? typeof part.text === "string"
            : part.type === "image" &&
              typeof part.src === "string" &&
              typeof part.alt === "string"),
      ))
  )
    return false;

  if (value.advanced !== undefined) {
    const advanced = value.advanced;
    if (!util.isRecord(advanced) || typeof advanced.text !== "string")
      return false;
    const advancedNumbers = [
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
    ];
    if (
      advancedNumbers.some(
        (key) =>
          typeof advanced[key] !== "number" || !Number.isFinite(advanced[key]),
      )
    )
      return false;
  }
  return true;
}

function isBilibiliDanmakuResponse(
  value: unknown,
): value is BilibiliDanmakuResponse {
  const util = globalThis.PipCompanion.util;
  if (!util.isRecord(value) || typeof value.ok !== "boolean") return false;
  if (!value.ok) return typeof value.error === "string";
  if (
    !Array.isArray(value.messages) ||
    !value.messages.every(isBilibiliDanmakuMessage) ||
    typeof value.duration !== "number" ||
    !Number.isFinite(value.duration) ||
    value.duration <= 0 ||
    typeof value.segmentCount !== "number" ||
    !Number.isSafeInteger(value.segmentCount) ||
    value.segmentCount < 1 ||
    typeof value.segmentStart !== "number" ||
    !Number.isSafeInteger(value.segmentStart) ||
    value.segmentStart < 1 ||
    typeof value.segmentEnd !== "number" ||
    !Number.isSafeInteger(value.segmentEnd) ||
    value.segmentEnd < value.segmentStart ||
    value.segmentEnd > value.segmentCount
  )
    return false;
  if (
    value.unavailableSegments !== undefined &&
    (!Array.isArray(value.unavailableSegments) ||
      !value.unavailableSegments.every(
        (entry) =>
          util.isRecord(entry) &&
          typeof entry.segment === "number" &&
          typeof entry.status === "number",
      ))
  )
    return false;
  if (
    value.recoveredSegments !== undefined &&
    (!Array.isArray(value.recoveredSegments) ||
      !value.recoveredSegments.every(
        (entry) =>
          util.isRecord(entry) &&
          typeof entry.segment === "number" &&
          typeof entry.status === "number" &&
          typeof entry.comments === "number",
      ))
  )
    return false;
  if (
    value.fallbackError !== undefined &&
    typeof value.fallbackError !== "string"
  )
    return false;
  if (
    value.legacyFallback !== undefined &&
    typeof value.legacyFallback !== "boolean"
  )
    return false;
  return true;
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentBilibiliDanmaku = (() => {
  const BILIBILI_SEGMENT_SECONDS =
    globalThis.PipCompanion.bilibiliDanmakuConfig.segmentSeconds;
  const MAX_SEEK_RESTORE_MESSAGES = 100;
  const isBilibili = globalThis.PipCompanion.site.isBilibiliHost(
    location.hostname,
  );

  function create(
    dependencies: ContentBilibiliDanmakuDependencies,
  ): ContentBilibiliDanmakuController {
    let bilibiliPipVideo: HTMLVideoElement | null = null;
    let bilibiliPipSourceVideo: HTMLVideoElement | null = null;
    let bilibiliVideoController: AbortController | null = null;
    let bilibiliPageKey = "";
    let bilibiliMessages: BilibiliDanmakuMessage[] = [];
    let bilibiliMessageIndex = 0;
    let bilibiliMessagesLoaded = false;
    let bilibiliSeekedBeforeLoad = false;
    let bilibiliRequestGeneration = 0;
    const bilibiliLoadedSegments = new Set<number>();
    const bilibiliLoadingSegments = new Set<number>();
    const bilibiliUnavailableSegments = new Set<number>();
    const bilibiliSegmentRetryAt = new Map<number, number>();
    let bilibiliSegmentCount = 0;
    let bilibiliPendingRestore = false;
    let bilibiliLegacyFallback = false;
    let bilibiliEmittedMessages = new WeakSet<BilibiliDanmakuMessage>();

    function resetBilibiliState(): void {
      bilibiliMessages = [];
      bilibiliMessageIndex = 0;
      bilibiliMessagesLoaded = false;
      bilibiliSeekedBeforeLoad = false;
      bilibiliRequestGeneration++;
      bilibiliLoadedSegments.clear();
      bilibiliLoadingSegments.clear();
      bilibiliUnavailableSegments.clear();
      bilibiliSegmentRetryAt.clear();
      bilibiliSegmentCount = 0;
      bilibiliPendingRestore = false;
      bilibiliLegacyFallback = false;
      bilibiliEmittedMessages = new WeakSet();
    }

    function getBangumiVideoIdentity(): BilibiliVideoIdentity | null {
      for (const script of document.scripts) {
        const match = script.textContent?.match(
          /"episode_info"\s*:\s*(\{[^{}]*\})/,
        );
        if (!match) continue;

        const episodeJson = match[1];
        if (episodeJson === undefined) continue;

        try {
          const episode: unknown = JSON.parse(episodeJson);
          if (!globalThis.PipCompanion.util.isRecord(episode)) continue;
          const avid = String(episode.aid ?? "");
          const cid = String(episode.cid ?? "");
          if (!/^\d+$/.test(avid) || !/^\d+$/.test(cid)) continue;
          const episodeId = String(episode.ep_id || cid);
          return { bvid: "", avid, page: 1, key: `ep:${episodeId}` };
        } catch {
          continue;
        }
      }
      return null;
    }

    function getBilibiliVideoIdentity(): BilibiliVideoIdentity | null {
      if (/^\/bangumi\/play\/(?:ss|ep)\d+/i.test(location.pathname))
        return getBangumiVideoIdentity();

      const video = globalThis.PipCompanion.site.parseBilibiliVideoPath(
        location.pathname,
      );
      const page = Number(new URL(location.href).searchParams.get("p") || 1);
      if (!video || !Number.isInteger(page) || page < 1 || page > 1000)
        return null;
      return {
        bvid: video.bvid,
        avid: video.avid,
        page,
        key: `${video.videoId}:${page}`,
      };
    }

    function findBilibiliMessageIndex(time: number): number {
      let low = 0;
      let high = bilibiliMessages.length;
      while (low < high) {
        const mid = (low + high) >>> 1;
        const message = bilibiliMessages[mid];
        if (message && message.replayTime < time) low = mid + 1;
        else high = mid;
      }
      return low;
    }

    function resetBilibiliPlaybackCursor(time: number): number {
      bilibiliMessageIndex = findBilibiliMessageIndex(time);
      bilibiliEmittedMessages = new WeakSet();
      for (const message of bilibiliMessages.slice(0, bilibiliMessageIndex)) {
        bilibiliEmittedMessages.add(message);
      }
      return bilibiliMessageIndex;
    }

    function restoreRecentBilibiliDanmaku(video: HTMLVideoElement): void {
      const renderer = dependencies.getRenderer();
      if (!renderer || !bilibiliMessagesLoaded) return;
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime)) return;
      renderer.clear();
      const restoreWindow = Math.max(
        dependencies.restoreWindowSeconds,
        renderer.duration,
        dependencies.maxAdvancedRestoreSeconds,
      );
      const start = findBilibiliMessageIndex(
        Math.max(0, currentTime - restoreWindow),
      );
      const end = resetBilibiliPlaybackCursor(currentTime);
      const recentMessages = bilibiliMessages
        .slice(start, end)
        .filter((message) => {
          const elapsed = currentTime - message.replayTime;
          const lifetime = message.advanced
            ? message.advanced.durationMs /
              1000 /
              (dependencies.getSpeedScale() / 100)
            : message.type === "top" || message.type === "bottom"
              ? dependencies.maxFixedRestoreSeconds
              : Math.min(
                  renderer.duration,
                  dependencies.maxScrollRestoreSeconds,
                );
          return elapsed < lifetime;
        })
        .slice(-MAX_SEEK_RESTORE_MESSAGES);
      renderer.beginSeekRestore();
      try {
        for (const message of recentMessages) {
          renderer.emit(message, {
            elapsed: currentTime - message.replayTime,
            restore: true,
          });
        }
      } finally {
        renderer.endSeekRestore();
      }
      processBilibiliDanmaku(video);
    }

    function startBilibiliDanmakuAtCurrentTime(video: HTMLVideoElement): void {
      const renderer = dependencies.getRenderer();
      if (!renderer || !bilibiliMessagesLoaded) return;
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime)) return;
      renderer.clear();
      resetBilibiliPlaybackCursor(currentTime);
      processBilibiliDanmaku(video);
    }

    function processBilibiliDanmaku(video: HTMLVideoElement): void {
      const renderer = dependencies.getRenderer();
      if (
        !dependencies.isVisible() ||
        !bilibiliMessagesLoaded ||
        !renderer ||
        video.seeking
      )
        return;
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime)) return;
      while (bilibiliMessageIndex < bilibiliMessages.length) {
        const message = bilibiliMessages[bilibiliMessageIndex];
        if (!message || message.replayTime > currentTime + 0.15) break;
        bilibiliMessageIndex++;
        if (bilibiliEmittedMessages.has(message)) continue;
        bilibiliEmittedMessages.add(message);
        const elapsed = Math.max(0, currentTime - message.replayTime);
        if (elapsed > dependencies.lateToleranceSeconds) continue;
        renderer.emit(message, { elapsed });
      }
    }

    function waitForBilibiliRetry(milliseconds: number): Promise<void> {
      return new Promise((resolve) => setTimeout(resolve, milliseconds));
    }

    async function sendBilibiliMessage(
      payload: Extract<ExtensionMessage, { type: "GET_BILIBILI_DANMAKU" }>,
    ): Promise<BilibiliDanmakuResponse> {
      let lastError: unknown;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response: unknown = await chrome.runtime.sendMessage(payload);
          if (isBilibiliDanmakuResponse(response)) return response;
          throw new Error("Invalid Bilibili danmaku response");
        } catch (error) {
          lastError = error;
          if (attempt < 2) await waitForBilibiliRetry(attempt ? 900 : 300);
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("Bilibili background connection failed");
    }

    function mergeBilibiliMessages(messages: BilibiliDanmakuMessage[]): void {
      const knownIds = new Set(
        bilibiliMessages
          .map((message) => message.id)
          .filter((id): id is string => Boolean(id && id !== "0")),
      );
      let addedMessages = false;
      for (const message of messages) {
        if (message.id && message.id !== "0") {
          if (knownIds.has(message.id)) continue;
          knownIds.add(message.id);
        }
        bilibiliMessages.push(message);
        addedMessages = true;
      }
      if (!addedMessages) return;
      bilibiliMessages.sort((a, b) => a.replayTime - b.replayTime);
      const currentTime = bilibiliPipVideo?.currentTime;
      if (typeof currentTime === "number" && Number.isFinite(currentTime)) {
        const lateMessageStart = findBilibiliMessageIndex(
          Math.max(0, currentTime - dependencies.lateToleranceSeconds),
        );
        bilibiliMessageIndex = Math.min(bilibiliMessageIndex, lateMessageStart);
      }
    }

    function updateBilibiliSegmentAvailability(
      response: BilibiliDanmakuResponseSuccess,
    ): void {
      if (response.legacyFallback) {
        bilibiliLegacyFallback = true;
        bilibiliLoadedSegments.clear();
        bilibiliUnavailableSegments.clear();
        return;
      }
      const unavailable = new Map(
        (Array.isArray(response.unavailableSegments)
          ? response.unavailableSegments
          : []
        ).map(({ segment, status }) => [segment, status]),
      );
      const retryAt = Date.now() + 5000;
      for (
        let segment = response.segmentStart;
        segment <= response.segmentEnd;
        segment++
      ) {
        const status = unavailable.get(segment);
        if (status === 404 && !response.fallbackError) {
          bilibiliLoadedSegments.delete(segment);
          bilibiliUnavailableSegments.add(segment);
          bilibiliSegmentRetryAt.delete(segment);
        } else if (status) {
          bilibiliLoadedSegments.delete(segment);
          bilibiliUnavailableSegments.delete(segment);
          bilibiliSegmentRetryAt.set(segment, retryAt);
        } else {
          bilibiliLoadedSegments.add(segment);
          bilibiliUnavailableSegments.delete(segment);
          bilibiliSegmentRetryAt.delete(segment);
        }
      }
    }

    function isBilibiliSegmentCoolingDown(
      segment: number,
      now = Date.now(),
    ): boolean {
      return (bilibiliSegmentRetryAt.get(segment) || 0) > now;
    }

    function logBilibiliResponse(
      response: BilibiliDanmakuResponseSuccess,
    ): void {
      if (response.legacyFallback)
        console.warn(
          "[Caption PiP] This long Bilibili video uses the legacy XML danmaku fallback; coverage may be incomplete.",
        );
      if (Array.isArray(response.unavailableSegments)) {
        const otherUnavailable = response.unavailableSegments.filter(
          ({ status }) => status !== 404 || Boolean(response.fallbackError),
        );
        if (otherUnavailable.length) {
          const unavailable = otherUnavailable
            .map(({ segment, status }) => `#${segment} HTTP ${status}`)
            .join(", ");
          console.warn(
            `[Caption PiP] Bilibili danmaku segments still unavailable: ${unavailable}.`,
          );
        }
      }
      if (response.fallbackError)
        console.warn(
          "[Caption PiP] Legacy Bilibili danmaku fallback failed:",
          response.fallbackError,
        );
    }

    function requestBilibiliSegments(
      identity: BilibiliVideoIdentity,
      startSegment: number,
      endSegment: number,
      { initial = false }: { initial?: boolean } = {},
    ): void {
      if (bilibiliLegacyFallback) return;

      const start = Math.max(1, Math.floor(startSegment));
      const end = Math.min(
        bilibiliSegmentCount || endSegment,
        Math.max(start, Math.floor(endSegment)),
      );
      const segments: number[] = [];
      const now = Date.now();
      for (let segment = start; segment <= end; segment++) {
        if (
          !bilibiliLoadedSegments.has(segment) &&
          !bilibiliLoadingSegments.has(segment) &&
          !bilibiliUnavailableSegments.has(segment) &&
          !isBilibiliSegmentCoolingDown(segment, now)
        )
          segments.push(segment);
      }

      if (!segments.length) return;

      const requestStart = segments[0];
      if (requestStart === undefined) return;
      let requestEnd = requestStart;
      for (let index = 1; index < segments.length; index++) {
        const segment = segments[index];
        if (segment === undefined || segment !== requestEnd + 1) break;
        requestEnd = segment;
      }

      for (let segment = requestStart; segment <= requestEnd; segment++) {
        bilibiliLoadingSegments.add(segment);
      }

      const requestGeneration = initial
        ? ++bilibiliRequestGeneration
        : bilibiliRequestGeneration;

      sendBilibiliMessage({
        type: "GET_BILIBILI_DANMAKU",
        ...(identity.bvid ? { bvid: identity.bvid } : { avid: identity.avid }),
        page: identity.page,
        startSegment: requestStart,
        endSegment: requestEnd,
      })
        .then((response) => {
          if (
            requestGeneration !== bilibiliRequestGeneration ||
            identity.key !== bilibiliPageKey ||
            !dependencies.getRenderer() ||
            !bilibiliPipVideo ||
            !dependencies.isVisible()
          )
            return;

          if (!response.ok)
            throw new Error(
              response.error || "Bilibili danmaku request failed",
            );

          bilibiliSegmentCount = response.segmentCount || bilibiliSegmentCount;
          updateBilibiliSegmentAvailability(response);
          if (initial) logBilibiliResponse(response);
          mergeBilibiliMessages(response.messages);
          bilibiliMessagesLoaded = true;

          const playbackVideo = bilibiliPipVideo;
          if (initial) {
            for (let segment = requestStart; segment <= requestEnd; segment++) {
              bilibiliLoadingSegments.delete(segment);
            }
            if (bilibiliSeekedBeforeLoad) {
              bilibiliSeekedBeforeLoad = false;
              restoreRecentBilibiliDanmaku(playbackVideo);
              if (
                bilibiliLegacyFallback ||
                areBilibiliRestoreSegmentsLoaded(playbackVideo)
              )
                bilibiliPendingRestore = false;
            } else startBilibiliDanmakuAtCurrentTime(playbackVideo);
          } else {
            if (bilibiliPendingRestore) {
              restoreRecentBilibiliDanmaku(playbackVideo);
              if (
                bilibiliLegacyFallback ||
                areBilibiliRestoreSegmentsLoaded(playbackVideo)
              )
                bilibiliPendingRestore = false;
            } else processBilibiliDanmaku(playbackVideo);
          }
        })
        .catch((error) => {
          if (
            requestGeneration !== bilibiliRequestGeneration ||
            identity.key !== bilibiliPageKey
          )
            return;

          const retryAt = Date.now() + 5000;
          for (let segment = requestStart; segment <= requestEnd; segment++) {
            bilibiliSegmentRetryAt.set(segment, retryAt);
          }
          console.warn(
            "[Caption PiP] Could not load Bilibili danmaku segment:",
            error,
          );
        })
        .finally(() => {
          if (requestGeneration !== bilibiliRequestGeneration) return;
          for (let segment = requestStart; segment <= requestEnd; segment++) {
            bilibiliLoadingSegments.delete(segment);
          }
        });
    }

    function ensureBilibiliSegments(video: HTMLVideoElement): void {
      const identity = getBilibiliVideoIdentity();
      if (
        bilibiliLegacyFallback ||
        !identity ||
        !Number.isFinite(video?.currentTime)
      )
        return;
      const currentSegment =
        Math.floor(video.currentTime / BILIBILI_SEGMENT_SECONDS) + 1;
      const restoreStartSegment = getBilibiliRestoreStartSegment(video);
      const endSegment = Math.min(
        bilibiliSegmentCount || currentSegment + 2,
        currentSegment + 2,
        restoreStartSegment + 5,
      );
      requestBilibiliSegments(identity, restoreStartSegment, endSegment);
    }

    function getBilibiliRestoreStartSegment(video: HTMLVideoElement): number {
      return (
        Math.floor(
          Math.max(
            0,
            video.currentTime - dependencies.maxAdvancedRestoreSeconds,
          ) / BILIBILI_SEGMENT_SECONDS,
        ) + 1
      );
    }

    function areBilibiliRestoreSegmentsLoaded(
      video: HTMLVideoElement,
    ): boolean {
      const currentSegment =
        Math.floor(video.currentTime / BILIBILI_SEGMENT_SECONDS) + 1;
      return (
        bilibiliLoadedSegments.has(currentSegment) &&
        bilibiliLoadedSegments.has(getBilibiliRestoreStartSegment(video))
      );
    }

    function checkAndBindBilibiliDanmaku(video: HTMLVideoElement | null): void {
      const renderer = dependencies.getRenderer();
      if (!isBilibili || !dependencies.isSettingsLoaded() || !renderer) return;
      if (video) bilibiliPipSourceVideo = video;

      const targetVideo = bilibiliPipSourceVideo;
      const identity = getBilibiliVideoIdentity();
      if (!dependencies.isVisible() || !identity || !targetVideo) {
        bilibiliVideoController?.abort();
        bilibiliVideoController = null;
        bilibiliPipVideo = null;
        bilibiliPageKey = "";
        resetBilibiliState();
        renderer.clear();
        return;
      }

      if (identity.key !== bilibiliPageKey) {
        bilibiliVideoController?.abort();
        bilibiliVideoController = null;
        bilibiliPipVideo = null;
        bilibiliPageKey = identity.key;
        resetBilibiliState();
        renderer.clear();
      }

      if (targetVideo !== bilibiliPipVideo) {
        bilibiliVideoController?.abort();
        const controller = new AbortController();
        bilibiliVideoController = controller;
        bilibiliPipVideo = targetVideo;
        let seeking = false;
        targetVideo.addEventListener(
          "timeupdate",
          () => {
            processBilibiliDanmaku(targetVideo);
            ensureBilibiliSegments(targetVideo);
          },
          {
            signal: controller.signal,
          },
        );

        targetVideo.addEventListener(
          "seeking",
          () => {
            seeking = true;
            dependencies.getRenderer()?.clear();
          },
          { signal: controller.signal },
        );
        targetVideo.addEventListener(
          "seeked",
          () => {
            seeking = false;
            bilibiliSeekedBeforeLoad = true;
            ensureBilibiliSegments(targetVideo);
            if (
              bilibiliLegacyFallback ||
              areBilibiliRestoreSegmentsLoaded(targetVideo)
            ) {
              bilibiliPendingRestore = false;
              restoreRecentBilibiliDanmaku(targetVideo);
            } else {
              bilibiliPendingRestore = true;
              resetBilibiliPlaybackCursor(targetVideo.currentTime);
            }
          },
          { signal: controller.signal },
        );
        targetVideo.addEventListener(
          "play",
          () => {
            if (!seeking) {
              processBilibiliDanmaku(targetVideo);
              ensureBilibiliSegments(targetVideo);
            }
          },
          { signal: controller.signal },
        );

        renderer.setPlaybackRate(targetVideo.playbackRate);
        if (bilibiliMessagesLoaded)
          startBilibiliDanmakuAtCurrentTime(targetVideo);
      }

      if (bilibiliMessagesLoaded || bilibiliLoadingSegments.size > 0) return;

      const initialSegment =
        Math.floor(
          Math.max(0, targetVideo.currentTime) / BILIBILI_SEGMENT_SECONDS,
        ) + 1;
      const initialStartSegment = getBilibiliRestoreStartSegment(targetVideo);
      const initialEndSegment = Math.min(
        initialSegment + 2,
        initialStartSegment + 5,
      );
      requestBilibiliSegments(
        identity,
        initialStartSegment,
        initialEndSegment,
        {
          initial: true,
        },
      );
    }

    function setSourceVideo(video: HTMLVideoElement | null): void {
      bilibiliPipSourceVideo = video;
    }

    function destroy(): void {
      bilibiliVideoController?.abort();
      bilibiliVideoController = null;
      bilibiliPipVideo = null;
      bilibiliPipSourceVideo = null;
      bilibiliPageKey = "";
      resetBilibiliState();
    }

    return {
      setSourceVideo,
      checkAndBind: checkAndBindBilibiliDanmaku,
      destroy,
    };
  }

  return { create };
})();
