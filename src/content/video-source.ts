"use strict";

globalThis.PipCompanion.ContentVideo = (() => {
  const PREFERRED_SELECTORS = [
    "video.html5-main-video", // YouTube
    '[data-a-target="video-player"] video', // Twitch main player
    ".video-player video", // Twitch
    ".video-player__container video", // Twitch
    ".video-player__default-player video", // Twitch
    ".bpx-player-video-wrap video", // Bilibili
    ".bilibili-player-video video", // Bilibili
    "#ani_video_html5_api", // Bahamut
    ".anime_video_area video", // Bahamut
  ];

  function getDocumentPip() {
    return window.documentPictureInPicture ?? null;
  }

  function scoreVideo(video: HTMLVideoElement): number {
    if (!video || !video.isConnected) return -1;
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    const area = width * height;
    if (area === 0) return -1;

    let score = area;
    // 正在播放中（未暫停且未結束）優先權最高，避免抓到靜態或暫停的殘留節點。
    if (!video.paused && !video.ended) score += 1e9;
    // 已載入目前影格或具備足夠資料
    if (video.readyState >= 2) score += 1e6;
    // 時間戳大於 0（已開始播放）
    if (video.currentTime > 0) score += 1e4;
    // 扣除已結束的影片
    if (video.ended) score -= 5e8;

    return score;
  }

  function pickBestVideo(
    videos: Iterable<HTMLVideoElement>,
  ): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    let bestScore = -1;
    for (const video of videos) {
      const score = scoreVideo(video);
      if (score > bestScore) {
        bestScore = score;
        best = video;
      }
    }
    return best;
  }

  function collectVideosDeep(
    root: Document | ShadowRoot,
    out: HTMLVideoElement[],
  ): void {
    for (const video of root.querySelectorAll("video")) out.push(video);

    for (const element of root.querySelectorAll("*")) {
      if (element.shadowRoot) collectVideosDeep(element.shadowRoot, out);
    }

    for (const frame of root.querySelectorAll("iframe")) {
      let doc: Document | null = null;
      try {
        doc = frame.contentDocument;
      } catch {
        doc = null;
      }
      if (doc) collectVideosDeep(doc, out);
    }
  }

  const DEEP_SCAN_MS = 1000;

  function findVideo(): HTMLVideoElement | null {
    for (const selector of PREFERRED_SELECTORS) {
      const preferred = pickBestVideo(
        document.querySelectorAll(selector) as NodeListOf<HTMLVideoElement>,
      );
      if (preferred) return preferred;
    }

    const light = pickBestVideo(document.querySelectorAll("video"));
    if (light) return light;

    if (
      state.deepVideoCache?.isConnected &&
      scoreVideo(state.deepVideoCache) > 0
    )
      return state.deepVideoCache;
    if (Date.now() - state.lastDeepScan < DEEP_SCAN_MS)
      return state.deepVideoCache;
    state.lastDeepScan = Date.now();
    const collected: HTMLVideoElement[] = [];
    collectVideosDeep(document, collected);
    state.deepVideoCache = pickBestVideo(collected);
    return state.deepVideoCache;
  }

  return {
    getDocumentPip,
    findVideo,
  };
})();
