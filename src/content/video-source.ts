"use strict";

globalThis.PipCompanion.ContentVideo = (() => {
  const VIDEO_SELECTOR = "video.html5-main-video";

  function getDocumentPip() {
    return window.documentPictureInPicture ?? null;
  }

  function pickLargestVideo(
    videos: Iterable<HTMLVideoElement>,
  ): HTMLVideoElement | null {
    let best: HTMLVideoElement | null = null;
    for (const video of videos) {
      if (
        !best ||
        video.videoWidth * video.videoHeight >
          best.videoWidth * best.videoHeight
      )
        best = video;
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
    const preferred = document.querySelector(
      VIDEO_SELECTOR,
    ) as HTMLVideoElement | null;
    if (preferred) return preferred;

    const light = pickLargestVideo(document.querySelectorAll("video"));
    if (light) return light;

    if (state.deepVideoCache?.isConnected) return state.deepVideoCache;
    if (Date.now() - state.lastDeepScan < DEEP_SCAN_MS)
      return state.deepVideoCache;
    state.lastDeepScan = Date.now();
    const collected: HTMLVideoElement[] = [];
    collectVideosDeep(document, collected);
    state.deepVideoCache = pickLargestVideo(collected);
    return state.deepVideoCache;
  }

  return {
    getDocumentPip,
    findVideo,
  };
})();
