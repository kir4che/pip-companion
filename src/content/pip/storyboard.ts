"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.ContentStoryboard = (() => {
  interface ParsedLevel {
    levelIndex: number;
    width: number;
    height: number;
    count: number;
    cols: number;
    rows: number;
    interval: number;
    imgName: string;
    signature: string;
  }

  interface ParsedYouTubeStoryboard {
    baseUrl: string;
    levels: ParsedLevel[];
    bestLevel: ParsedLevel;
  }

  interface BilibiliVideoshotData {
    image: string[];
    index?: number[];
    img_x_len: number;
    img_y_len: number;
    img_x_size: number;
    img_y_size: number;
  }

  let cachedYtVideoId = "";
  let cachedYtStoryboard: ParsedYouTubeStoryboard | null = null;
  let ytFetchPending = false;

  let cachedBvid = "";
  let cachedBilibiliData: BilibiliVideoshotData | null = null;
  let bilibiliFetchPending = false;

  let cachedBahaData: BahaStoryboardData | null = null;

  function decodeJsonString(str: string): string {
    try {
      return JSON.parse(`"${str}"`);
    } catch {
      return str
        .replace(/\\u0026/g, "&")
        .replace(/\\u003d/g, "=")
        .replace(/\\\//g, "/")
        .replace(/\\"/g, '"');
    }
  }

  function getYouTubeVideoId(): string | null {
    try {
      const url = new URL(location.href);
      if (url.searchParams.has("v")) return url.searchParams.get("v");
      const shortsMatch = url.pathname.match(/\/shorts\/([^/?]+)/);
      if (shortsMatch) return shortsMatch[1];
      const embedMatch = url.pathname.match(/\/embed\/([^/?]+)/);
      if (embedMatch) return embedMatch[1];
      const liveMatch = url.pathname.match(/\/live\/([^/?]+)/);
      if (liveMatch) return liveMatch[1];
    } catch {}
    return document.documentElement?.dataset.pipYtVideoId || null;
  }

  function parseYouTubeSpec(spec: string): ParsedYouTubeStoryboard | null {
    if (!spec || !spec.includes("|")) return null;
    const parts = spec.trim().split("|");
    if (parts.length < 2) return null;
    let baseUrl = parts[0].replace(/\\/g, "");
    if (baseUrl.startsWith("//")) baseUrl = "https:" + baseUrl;

    const levels: ParsedLevel[] = [];

    for (let idx = 0; idx < parts.length - 1; idx++) {
      const raw = parts[idx + 1];
      const tokens = raw.split("#");
      if (tokens.length < 7) continue;

      const width = parseInt(tokens[0], 10);
      const height = parseInt(tokens[1], 10);
      const count = parseInt(tokens[2], 10);
      const cols = parseInt(tokens[3], 10);
      const rows = parseInt(tokens[4], 10);
      const interval = parseInt(tokens[5], 10);
      const imgName = tokens[6] || "";
      const signature = tokens[7] || "";

      if (
        !Number.isFinite(width) ||
        !Number.isFinite(height) ||
        width <= 0 ||
        height <= 0 ||
        cols <= 0 ||
        rows <= 0
      )
        continue;

      levels.push({
        levelIndex: idx,
        width,
        height,
        count: Number.isFinite(count) ? count : 0,
        cols,
        rows,
        interval: Number.isFinite(interval) ? interval : 0,
        imgName,
        signature,
      });
    }

    if (levels.length === 0) return null;

    let bestLevel = levels[0];
    for (const lvl of levels) {
      if (
        lvl.width <= 160 &&
        (bestLevel.width > 160 || lvl.width > bestLevel.width)
      )
        bestLevel = lvl;
      else if (bestLevel.width > 160 && lvl.width < bestLevel.width)
        bestLevel = lvl;
    }

    return { baseUrl, levels, bestLevel };
  }

  function extractStoryboardSpec(text: string): string | null {
    const match =
      text.match(/"spec":\s*"([^"]*storyboard3_L[^"]*)"/) ||
      text.match(
        /"playerStoryboardSpecRenderer":\s*\{\s*"spec":\s*"([^"]+)"/,
      ) ||
      text.match(/"storyboard_spec":\s*"([^"]+)"/);
    return match ? decodeJsonString(match[1]) : null;
  }

  function extractSpecFromScripts(): string | null {
    for (const script of document.scripts) {
      const text = script.textContent;
      if (!text) continue;

      if (
        text.includes("storyboard3_L") ||
        text.includes("playerStoryboardSpecRenderer") ||
        text.includes("storyboard_spec")
      ) {
        const spec = extractStoryboardSpec(text);
        if (spec) return spec;
      }
    }
    return null;
  }

  function loadYouTubeStoryboardViaFetch(videoId: string) {
    if ((cachedYtStoryboard && cachedYtVideoId === videoId) || ytFetchPending)
      return;
    ytFetchPending = true;

    fetch(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`, {
      credentials: "include",
    })
      .then((res) => res.text())
      .then((html) => {
        const spec = extractStoryboardSpec(html);
        if (spec) {
          const parsed = parseYouTubeSpec(spec);
          if (parsed) {
            cachedYtStoryboard = parsed;
            cachedYtVideoId = videoId;
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        ytFetchPending = false;
      });
  }

  function getYouTubeSpec(videoId: string): string {
    const root = document.documentElement;
    let spec =
      root?.dataset.pipYtVideoId === videoId
        ? root.dataset.pipYtStoryboard || ""
        : "";

    if (!spec) {
      window.postMessage({ type: "PIP_REQUEST_YT_DATA" }, "*");
      document.dispatchEvent(new CustomEvent("pip-companion-request-yt-data"));
      if (root?.dataset.pipYtVideoId === videoId)
        spec = root.dataset.pipYtStoryboard || "";
    }

    if (
      !spec &&
      (!root?.dataset.pipYtVideoId || root.dataset.pipYtVideoId === videoId)
    )
      spec = extractSpecFromScripts() || "";

    return spec;
  }

  function getYouTubeStoryboard(
    videoId: string,
  ): ParsedYouTubeStoryboard | null {
    if (cachedYtStoryboard && cachedYtVideoId === videoId)
      return cachedYtStoryboard;

    const spec = getYouTubeSpec(videoId);
    const parsed = spec ? parseYouTubeSpec(spec) : null;
    if (parsed) {
      cachedYtStoryboard = parsed;
      cachedYtVideoId = videoId;
      return parsed;
    }

    loadYouTubeStoryboardViaFetch(videoId);
    return null;
  }

  function getYouTubeFrame(
    storyboard: ParsedYouTubeStoryboard,
    seconds: number,
    duration: number,
  ): StoryboardFrame | null {
    const lvl = storyboard.bestLevel;
    if (!lvl) return null;

    const intervalSec =
      lvl.interval > 0
        ? lvl.interval / 1000
        : duration / Math.max(1, lvl.count);
    if (!Number.isFinite(intervalSec) || intervalSec <= 0) return null;

    let frameIndex = Math.max(0, Math.floor(seconds / intervalSec));
    if (lvl.count > 0) frameIndex = Math.min(frameIndex, lvl.count - 1);
    const sheetCapacity = lvl.cols * lvl.rows;
    if (sheetCapacity <= 0) return null;

    const sheetIndex = Math.floor(frameIndex / sheetCapacity);
    const indexInSheet = frameIndex % sheetCapacity;
    const col = indexInSheet % lvl.cols;
    const row = Math.floor(indexInSheet / lvl.cols);

    let url = storyboard.baseUrl.replace("$L", String(lvl.levelIndex));
    const imgNamePattern =
      lvl.imgName || (lvl.count > sheetCapacity ? "M$M" : "default");
    const imgName = imgNamePattern.includes("$M")
      ? imgNamePattern.replace("$M", String(sheetIndex))
      : imgNamePattern;
    url = url.replace("$N", imgName);
    if (lvl.signature)
      url += (url.includes("?") ? "&" : "?") + "sigh=" + lvl.signature;

    return {
      url,
      x: col * lvl.width,
      y: row * lvl.height,
      width: lvl.width,
      height: lvl.height,
      sheetWidth: lvl.cols * lvl.width,
      sheetHeight: lvl.rows * lvl.height,
    };
  }

  function getBilibiliBvid(): string | null {
    const match = location.pathname.match(/\/video\/(BV[\w]{10})/i);
    return match ? match[1] : null;
  }

  async function resolveBilibiliImagesToBlobs(
    images: string[],
  ): Promise<string[]> {
    return Promise.all(
      images.map(async (raw) => {
        let url = raw;
        if (url.startsWith("//")) url = "https:" + url;
        if (url.startsWith("blob:") || url.startsWith("data:")) return url;
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const blob = await res.blob();
          return URL.createObjectURL(blob);
        } catch {
          return url;
        }
      }),
    );
  }

  function loadBilibiliVideoshot(bvid: string) {
    if (cachedBvid === bvid || bilibiliFetchPending) return;
    bilibiliFetchPending = true;
    fetch(
      `https://api.bilibili.com/x/player/videoshot?bvid=${encodeURIComponent(bvid)}&index=1`,
      {
        credentials: "include",
      },
    )
      .then((res) => res.json())
      .then(async (json) => {
        if (
          json &&
          json.code === 0 &&
          json.data &&
          Array.isArray(json.data.image)
        ) {
          json.data.image = await resolveBilibiliImagesToBlobs(json.data.image);
          cachedBvid = bvid;
          cachedBilibiliData = json.data;
        }
      })
      .catch(() => {})
      .finally(() => {
        bilibiliFetchPending = false;
      });
  }

  function getBilibiliFrame(
    data: BilibiliVideoshotData,
    seconds: number,
    duration: number,
  ): StoryboardFrame | null {
    const images = data.image;
    if (!images || images.length === 0) return null;
    const cols = data.img_x_len || 10;
    const rows = data.img_y_len || 10;
    const tileWidth = data.img_x_size || 160;
    const tileHeight = data.img_y_size || 90;
    const sheetCapacity = cols * rows;
    const totalFrames = images.length * sheetCapacity;

    let frameIndex = 0;
    if (Array.isArray(data.index) && data.index.length > 0) {
      let low = 0;
      let high = data.index.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (data.index[mid] <= seconds) {
          frameIndex = mid;
          low = mid + 1;
        } else high = mid - 1;
      }
    } else {
      if (!Number.isFinite(duration) || duration <= 0) return null;
      frameIndex = Math.floor((seconds / duration) * totalFrames);
    }

    frameIndex = Math.max(0, Math.min(totalFrames - 1, frameIndex));
    const sheetIndex = Math.floor(frameIndex / sheetCapacity);
    const indexInSheet = frameIndex % sheetCapacity;
    const col = indexInSheet % cols;
    const row = Math.floor(indexInSheet / cols);

    let rawUrl = images[sheetIndex] || images[0];
    if (rawUrl.startsWith("//")) rawUrl = "https:" + rawUrl;

    return {
      url: rawUrl,
      x: col * tileWidth,
      y: row * tileHeight,
      width: tileWidth,
      height: tileHeight,
      sheetWidth: cols * tileWidth,
      sheetHeight: rows * tileHeight,
    };
  }

  function getBahaSn(): string | null {
    try {
      const url = new URL(location.href);
      const sn = url.searchParams.get("sn");
      if (sn) return sn;
    } catch {}
    try {
      const win = window as unknown as {
        animefun?: { videoSn?: string | number };
      };
      if (win.animefun?.videoSn) return String(win.animefun.videoSn);
    } catch {}
    return null;
  }

  function getBahaStoryboard(sn: string | null): BahaStoryboardData | null {
    if (
      cachedBahaData &&
      (!sn || !cachedBahaData.sn || cachedBahaData.sn === sn)
    )
      return cachedBahaData;

    const raw = document.documentElement?.dataset.pipBahaStoryboard;
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as BahaStoryboardData;
        if (
          parsed &&
          Array.isArray(parsed.images) &&
          parsed.images.length > 0 &&
          (!sn || !parsed.sn || parsed.sn === sn)
        ) {
          cachedBahaData = parsed;
          return parsed;
        }
      } catch {}
    }

    window.postMessage({ type: "PIP_REQUEST_BAHA_DATA" }, "*");
    document.dispatchEvent(new CustomEvent("pip-companion-request-baha-data"));
    return cachedBahaData &&
      (!sn || !cachedBahaData.sn || cachedBahaData.sn === sn)
      ? cachedBahaData
      : null;
  }

  function getBahaFrame(
    data: BahaStoryboardData,
    seconds: number,
    duration: number,
  ): StoryboardFrame | null {
    const images = data.images;
    if (!images || images.length === 0) return null;
    const interval = data.interval > 0 ? data.interval : 10;
    const cols = data.cols > 0 ? data.cols : 10;
    const rows = data.rows > 0 ? data.rows : 10;
    const tileWidth = data.width > 0 ? data.width : 160;
    const tileHeight = data.height > 0 ? data.height : 90;
    const sheetCapacity = cols * rows;
    if (sheetCapacity <= 0) return null;

    const maxFrame =
      Number.isFinite(duration) && duration > 0
        ? Math.max(0, Math.floor(duration / interval))
        : images.length * sheetCapacity - 1;

    let frameIndex = Math.max(0, Math.floor(seconds / interval));
    frameIndex = Math.min(
      frameIndex,
      maxFrame,
      images.length * sheetCapacity - 1,
    );

    const sheetIndex = Math.floor(frameIndex / sheetCapacity);
    const clampedSheetIndex = Math.min(images.length - 1, sheetIndex);
    const indexInSheet = frameIndex % sheetCapacity;
    const col = indexInSheet % cols;
    const row = Math.floor(indexInSheet / cols);

    const url = images[clampedSheetIndex];
    if (!url) return null;

    return {
      url,
      x: col * tileWidth,
      y: row * tileHeight,
      width: tileWidth,
      height: tileHeight,
      sheetWidth: cols * tileWidth,
      sheetHeight: rows * tileHeight,
    };
  }

  type Platform = "youtube" | "bilibili" | "bahamut" | "unknown";

  function getPlatform(): Platform {
    const host = location.hostname;
    if (/(^|\.)youtube\.com$/.test(host)) return "youtube";
    if (/(^|\.)bilibili\.com$/.test(host) && host !== "live.bilibili.com")
      return "bilibili";
    if (/(^|\.)gamer\.com\.tw$/.test(host)) return "bahamut";
    return "unknown";
  }

  window.addEventListener(
    "message",
    (
      e: MessageEvent<{
        type?: string;
        spec?: string;
        videoId?: string;
        data?: BahaStoryboardData;
      }>,
    ) => {
      if (e.data?.type === "PIP_YT_STORYBOARD_DATA" && e.data?.spec) {
        const parsed = parseYouTubeSpec(e.data.spec);
        if (parsed) {
          cachedYtStoryboard = parsed;
          cachedYtVideoId = e.data.videoId || getYouTubeVideoId() || "";
        }
      } else if (e.data?.type === "PIP_YT_RESET") {
        cachedYtVideoId = "";
        cachedYtStoryboard = null;
      } else if (e.data?.type === "PIP_BAHA_STORYBOARD_DATA" && e.data?.data) {
        const currentSn = getBahaSn();
        if (!currentSn || !e.data.data.sn || e.data.data.sn === currentSn)
          cachedBahaData = e.data.data;
      } else if (e.data?.type === "PIP_BAHA_RESET") cachedBahaData = null;
    },
    { passive: true },
  );

  document.addEventListener("pip-companion-yt-storyboard", ((
    e: CustomEvent<{ spec?: string; videoId?: string }>,
  ) => {
    const detail = e.detail;
    if (detail?.spec) {
      const parsed = parseYouTubeSpec(detail.spec);
      if (parsed) {
        cachedYtStoryboard = parsed;
        cachedYtVideoId = detail.videoId || getYouTubeVideoId() || "";
      }
    }
  }) as EventListener);

  document.addEventListener("pip-companion-yt-reset", () => {
    cachedYtVideoId = "";
    cachedYtStoryboard = null;
  });

  document.addEventListener("pip-companion-baha-storyboard", ((
    e: CustomEvent<BahaStoryboardData>,
  ) => {
    if (e.detail && Array.isArray(e.detail.images)) {
      const currentSn = getBahaSn();
      if (!currentSn || !e.detail.sn || e.detail.sn === currentSn) {
        cachedBahaData = e.detail;
      }
    }
  }) as EventListener);

  document.addEventListener("pip-companion-baha-reset", () => {
    cachedBahaData = null;
  });

  function preload(video: HTMLVideoElement | null) {
    if (!video) return;
    const platform = getPlatform();

    if (platform === "youtube") {
      const videoId = getYouTubeVideoId();
      if (!videoId) return;
      if (cachedYtStoryboard && cachedYtVideoId === videoId) return;

      const spec = getYouTubeSpec(videoId);
      const parsed = spec ? parseYouTubeSpec(spec) : null;
      if (parsed) {
        cachedYtStoryboard = parsed;
        cachedYtVideoId = videoId;
        return;
      }

      loadYouTubeStoryboardViaFetch(videoId);
      return;
    }

    if (platform === "bilibili") {
      const bvid = getBilibiliBvid();
      if (bvid && (cachedBvid !== bvid || !cachedBilibiliData))
        loadBilibiliVideoshot(bvid);
      return;
    }

    if (platform === "bahamut") {
      const sn = getBahaSn();
      if (!cachedBahaData || (sn && cachedBahaData.sn !== sn))
        getBahaStoryboard(sn);
      return;
    }
  }

  function getFrame(
    seconds: number,
    video: HTMLVideoElement | null,
  ): StoryboardFrame | null {
    if (
      !video ||
      !Number.isFinite(video.duration) ||
      video.duration <= 0 ||
      globalThis.PipCompanion.ContentPlayback?.isLiveStream(video)
    )
      return null;

    const platform = getPlatform();

    if (platform === "youtube") {
      const videoId = getYouTubeVideoId();
      if (!videoId) return null;
      const sb = getYouTubeStoryboard(videoId);
      if (!sb) return null;
      return getYouTubeFrame(sb, seconds, video.duration);
    }

    if (platform === "bilibili") {
      const bvid = getBilibiliBvid();
      if (!bvid) return null;
      if (cachedBvid !== bvid || !cachedBilibiliData)
        loadBilibiliVideoshot(bvid);
      if (cachedBilibiliData && cachedBvid === bvid)
        return getBilibiliFrame(cachedBilibiliData, seconds, video.duration);
      return null;
    }

    if (platform === "bahamut") {
      const sn = getBahaSn();
      const sb = getBahaStoryboard(sn);
      if (!sb) return null;
      return getBahaFrame(sb, seconds, video.duration);
    }

    return null;
  }

  function reset() {
    cachedYtVideoId = "";
    cachedYtStoryboard = null;
    cachedBvid = "";
    cachedBilibiliData = null;
    cachedBahaData = null;
  }

  window.addEventListener("popstate", reset, { passive: true });
  window.addEventListener("hashchange", reset, { passive: true });

  return {
    getFrame,
    preload,
    reset,
  };
})();
