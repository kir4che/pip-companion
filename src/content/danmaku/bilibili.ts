"use strict";

interface BilibiliVideoIdentity {
  bvid: string;
  avid: string;
  page: number;
  key: string;
  epId?: string;
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
  const isBilibili = globalThis.PipCompanion.site.isBilibiliHost(
    location.hostname,
  );

  function create(
    dependencies: ContentBilibiliDanmakuDependencies,
  ): ContentBilibiliDanmakuController {
    let bilibiliPipVideo: HTMLVideoElement | null = null;
    let bilibiliPipSourceVideo: HTMLVideoElement | null = null;
    let bilibiliVideoSourceKey = "";
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
      bilibiliLegacyFallback = false;
      bilibiliEmittedMessages = new WeakSet();
    }

    function getBilibiliActivePageIndex(): number | null {
      const multiPageItems = document.querySelectorAll<HTMLElement>(
        "#multi_page .cur-list li, .multi-page .cur-list li, .cur-list li",
      );
      if (multiPageItems.length > 1) {
        const index = Array.from(multiPageItems).findIndex(
          (el) =>
            el.classList.contains("on") || el.classList.contains("active"),
        );
        if (index >= 0) return index + 1;
      }
      return null;
    }

    function getBangumiVideoIdentity(): BilibiliVideoIdentity | null {
      const epMatch = location.pathname.match(/\/bangumi\/play\/ep(\d+)/i);
      const urlEpId = epMatch?.[1] || "";
      const activeEp = document.querySelector<HTMLElement>(
        ".ep-item.on, .ep-item.active, .ep-sub-list-item.on, .ep-sub-list-item.active, .section-ep-item.on, .section-ep-item.active, .bpx-player-ctrl-eplist-item.active, .bpx-player-ctrl-eplist-item.on, [class*='ep-item'].on, [class*='ep-item'].active, [class*='ep_item'].on, [class*='ep_item'].active",
      );
      const domEpId =
        activeEp?.dataset.epId ||
        activeEp?.dataset.id ||
        activeEp?.dataset.key?.replace(/^ep/i, "") ||
        activeEp
          ?.getAttribute("href")
          ?.match(/\/bangumi\/play\/ep(\d+)/i)?.[1] ||
        activeEp
          ?.querySelector<HTMLAnchorElement>("a[href*='/bangumi/play/ep']")
          ?.getAttribute("href")
          ?.match(/\/bangumi\/play\/ep(\d+)/i)?.[1] ||
        "";
      const currentEpId = urlEpId || domEpId;
      if (currentEpId)
        return {
          bvid: "",
          avid: "",
          epId: currentEpId,
          page: 1,
          key: `ep:${currentEpId}`,
        };
      return null;
    }

    function getBilibiliVideoIdentity(): BilibiliVideoIdentity | null {
      if (/^\/bangumi\/play\/(?:ss|ep)\d+/i.test(location.pathname))
        return getBangumiVideoIdentity();

      let video = globalThis.PipCompanion.site.parseBilibiliVideoPath(
        location.pathname,
      );

      if (!video && location.pathname.startsWith("/list/")) {
        const listBvid = new URL(location.href).searchParams.get("bvid");
        if (listBvid && /^BV[\w]{10}$/i.test(listBvid))
          video = { videoId: listBvid, bvid: listBvid, avid: "" };
      }

      const activePodItem = document.querySelector<HTMLElement>(
        ".video-pod__item.active, .video-pod__item[aria-current='true'], .cur-list li.on, .cur-list li.active",
      );
      const podBvid =
        activePodItem?.dataset.key ||
        activePodItem
          ?.querySelector<HTMLAnchorElement>("a[href*='/video/BV']")
          ?.getAttribute("href")
          ?.match(/\/video\/(BV[\w]{10})/i)?.[1];
      if (podBvid && /^BV[\w]{10}$/i.test(podBvid))
        video = { videoId: podBvid, bvid: podBvid, avid: "" };

      if (!video) return null;

      const urlParams = new URL(location.href).searchParams;
      const hasExplicitUrlPage = urlParams.has("p");
      const urlPage = Number(urlParams.get("p") || 1);
      const domPage = getBilibiliActivePageIndex();

      let page = 1;
      if (
        hasExplicitUrlPage &&
        Number.isInteger(urlPage) &&
        urlPage >= 1 &&
        urlPage <= 1000
      ) {
        page = urlPage;
      } else if (domPage !== null && domPage >= 1 && domPage <= 1000) {
        page = domPage;
      } else if (Number.isInteger(urlPage) && urlPage >= 1 && urlPage <= 1000) {
        page = urlPage;
      }

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
        } catch (err) {
          lastError = err;
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
          .map((msg) => msg.id)
          .filter((id): id is string => Boolean(id && id !== "0")),
      );
      const knownKeys = new Set(
        bilibiliMessages.map(
          (msg) =>
            `${msg.replayTime.toFixed(3)}:${msg.type}:${msg.color || ""}:${msg.text || ""}`,
        ),
      );
      let addedMessages = false;
      for (const message of messages) {
        if (message.id && message.id !== "0") {
          if (knownIds.has(message.id)) continue;
          knownIds.add(message.id);
        } else {
          const key = `${message.replayTime.toFixed(3)}:${message.type}:${message.color || ""}:${message.text || ""}`;
          if (knownKeys.has(key)) continue;
          knownKeys.add(key);
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
      res: BilibiliDanmakuResponseSuccess,
    ): void {
      if (res.legacyFallback) {
        bilibiliLegacyFallback = true;
        bilibiliLoadedSegments.clear();
        bilibiliUnavailableSegments.clear();
        return;
      }
      const unavailable = new Map(
        (Array.isArray(res.unavailableSegments)
          ? res.unavailableSegments
          : []
        ).map(({ segment, status }) => [segment, status]),
      );
      const retryAt = Date.now() + 5000;
      for (
        let segment = res.segmentStart;
        segment <= res.segmentEnd;
        segment++
      ) {
        const status = unavailable.get(segment);
        if (status === 404 && !res.fallbackError) {
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
        ...(identity.epId
          ? { epId: identity.epId }
          : identity.bvid
            ? { bvid: identity.bvid }
            : { avid: identity.avid }),
        page: identity.page,
        startSegment: requestStart,
        endSegment: requestEnd,
      })
        .then((res) => {
          if (
            requestGeneration !== bilibiliRequestGeneration ||
            identity.key !== bilibiliPageKey ||
            !dependencies.getRenderer() ||
            !bilibiliPipVideo ||
            !dependencies.isVisible()
          )
            return;

          if (!res.ok)
            throw new Error(res.error || "Bilibili danmaku request failed");

          bilibiliSegmentCount = res.segmentCount || bilibiliSegmentCount;
          updateBilibiliSegmentAvailability(res);
          mergeBilibiliMessages(res.messages);
          bilibiliMessagesLoaded = true;

          const playbackVideo = bilibiliPipVideo;
          if (initial) {
            for (let segment = requestStart; segment <= requestEnd; segment++) {
              bilibiliLoadingSegments.delete(segment);
            }
            if (bilibiliSeekedBeforeLoad) {
              bilibiliSeekedBeforeLoad = false;
              if (playbackVideo) {
                dependencies.getRenderer()?.clear();
                resetBilibiliPlaybackCursor(playbackVideo.currentTime);
                processBilibiliDanmaku(playbackVideo);
              }
            } else startBilibiliDanmakuAtCurrentTime(playbackVideo);
          } else {
            processBilibiliDanmaku(playbackVideo);
          }
        })
        .catch(() => {
          if (
            requestGeneration !== bilibiliRequestGeneration ||
            identity.key !== bilibiliPageKey
          )
            return;

          const retryAt = Date.now() + 5000;
          for (let segment = requestStart; segment <= requestEnd; segment++) {
            bilibiliSegmentRetryAt.set(segment, retryAt);
          }
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

    function checkAndBindBilibiliDanmaku(video: HTMLVideoElement | null): void {
      const renderer = dependencies.getRenderer();
      if (!isBilibili || !dependencies.isSettingsLoaded()) return;
      if (!dependencies.isVisible() || !renderer) {
        if (bilibiliVideoController || bilibiliPipVideo) {
          bilibiliVideoController?.abort();
          bilibiliVideoController = null;
          bilibiliPipVideo = null;
          bilibiliPageKey = "";
          resetBilibiliState();
        }
        return;
      }
      if (video) bilibiliPipSourceVideo = video;

      const targetVideo =
        bilibiliPipSourceVideo ??
        (video instanceof HTMLVideoElement
          ? video
          : (document.querySelector<HTMLVideoElement>(
              "#bilibili-player video, .bpx-player-video-wrap video, video",
            ) ?? null));
      const identity = getBilibiliVideoIdentity();
      if (!identity || !targetVideo) {
        bilibiliVideoController?.abort();
        bilibiliVideoController = null;
        bilibiliPipVideo = null;
        bilibiliPageKey = "";
        resetBilibiliState();
        renderer.clear();
        return;
      }

      const targetSourceKey = targetVideo.currentSrc || targetVideo.src || "";
      const sourceChanged =
        bilibiliVideoSourceKey !== "" &&
        targetSourceKey !== "" &&
        bilibiliVideoSourceKey !== targetSourceKey;

      if (identity.key !== bilibiliPageKey || sourceChanged) {
        bilibiliVideoController?.abort();
        bilibiliVideoController = null;
        bilibiliPipVideo = null;
        bilibiliPageKey = identity.key;
        bilibiliVideoSourceKey = targetSourceKey;
        resetBilibiliState();
        renderer?.clear();
      } else if (bilibiliVideoSourceKey === "" && targetSourceKey !== "")
        bilibiliVideoSourceKey = targetSourceKey;

      if (renderer && targetVideo !== bilibiliPipVideo) {
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
            dependencies.getRenderer()?.clear();
            resetBilibiliPlaybackCursor(targetVideo.currentTime);
            ensureBilibiliSegments(targetVideo);
            processBilibiliDanmaku(targetVideo);
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
        // 換片時同一個元素可能沿用舊的播放游標，重新對齊目前時間才不會整段沒彈幕。
        const resyncPlaybackCursor = () => {
          if (!bilibiliMessagesLoaded) return;
          resetBilibiliPlaybackCursor(targetVideo.currentTime);
          processBilibiliDanmaku(targetVideo);
        };
        targetVideo.addEventListener(
          "loadedmetadata",
          () => {
            checkAndBindBilibiliDanmaku(targetVideo);
            resyncPlaybackCursor();
          },
          { signal: controller.signal },
        );
        targetVideo.addEventListener(
          "emptied",
          () => {
            dependencies.getRenderer()?.clear();
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

    function getMessages(): BilibiliDanmakuMessage[] {
      return bilibiliMessages;
    }

    async function loadAllMessages(): Promise<BilibiliDanmakuMessage[]> {
      const identity = getBilibiliVideoIdentity();
      if (!identity || bilibiliLegacyFallback) return bilibiliMessages;
      const count = bilibiliSegmentCount || 1;
      for (let s = 1; s <= count; s += 5) {
        const end = Math.min(count, s + 4);
        requestBilibiliSegments(identity, s, end);
      }
      return bilibiliMessages;
    }

    function destroy(): void {
      bilibiliVideoController?.abort();
      bilibiliVideoController = null;
      bilibiliPipVideo = null;
      bilibiliPipSourceVideo = null;
      bilibiliVideoSourceKey = "";
      bilibiliPageKey = "";
      resetBilibiliState();
    }

    return {
      setSourceVideo,
      checkAndBind: checkAndBindBilibiliDanmaku,
      destroy,
      getMessages,
      loadAllMessages,
    };
  }

  return { create };
})();
