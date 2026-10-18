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

  let cachedBilibiliKey = "";
  let cachedBilibiliData: BilibiliVideoshotData | null = null;
  const bilibiliFetchPending = new Set<string>();

  let cachedBahaData: BahaStoryboardData | null = null;

  function decodeJsonString(str: string): string {
    try {
      const decoded: unknown = JSON.parse(`"${str}"`);
      return typeof decoded === "string" ? decoded : str;
    } catch {
      return str
        .replace(/\\u0026/g, "&")
        .replace(/\\u003d/g, "=")
        .replace(/\\\//g, "/")
        .replace(/\\"/g, '"');
    }
  }

  function getYouTubeVideoId(): string | null {
    return (
      globalThis.PipCompanion.site.parseYouTubeVideoId(location.href) ||
      document.documentElement?.dataset.pipYtVideoId ||
      null
    );
  }

  function parseYouTubeSpec(spec: string): ParsedYouTubeStoryboard | null {
    if (!spec || !spec.includes("|")) return null;
    const parts = spec.trim().split("|");
    if (parts.length < 2) return null;
    const rawBaseUrl = parts[0];
    if (!rawBaseUrl) return null;
    let baseUrl = rawBaseUrl.replace(/\\/g, "");
    if (baseUrl.startsWith("//")) baseUrl = "https:" + baseUrl;

    const levels: ParsedLevel[] = [];

    for (let idx = 0; idx < parts.length - 1; idx++) {
      const raw = parts[idx + 1];
      if (raw === undefined) continue;
      const tokens = raw.split("#");
      const [rawWidth, rawHeight, rawCount, rawCols, rawRows, rawInterval] =
        tokens;
      if (
        rawWidth === undefined ||
        rawHeight === undefined ||
        rawCount === undefined ||
        rawCols === undefined ||
        rawRows === undefined ||
        rawInterval === undefined
      )
        continue;

      const width = parseInt(rawWidth, 10);
      const height = parseInt(rawHeight, 10);
      const count = parseInt(rawCount, 10);
      const cols = parseInt(rawCols, 10);
      const rows = parseInt(rawRows, 10);
      const interval = parseInt(rawInterval, 10);
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

    const firstLevel = levels[0];
    if (!firstLevel) return null;
    let bestLevel = firstLevel;
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
    const spec = match?.[1];
    return spec ? decodeJsonString(spec) : null;
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
    return (
      globalThis.PipCompanion.site.parseBilibiliVideoPath(location.pathname)
        ?.bvid || null
    );
  }

  function getBilibiliPage(): number {
    const page = Number(new URLSearchParams(location.search).get("p") || 1);
    return Number.isSafeInteger(page) && page > 0 ? page : 1;
  }

  function getBilibiliKey(bvid: string): string {
    return `${bvid}:p${getBilibiliPage()}`;
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
    const page = getBilibiliPage();
    const key = `${bvid}:p${page}`;
    if (cachedBilibiliKey === key || bilibiliFetchPending.has(key)) return;
    bilibiliFetchPending.add(key);

    const currentKey = () => {
      const currentBvid = getBilibiliBvid();
      return currentBvid ? getBilibiliKey(currentBvid) : "";
    };
    const query = `bvid=${encodeURIComponent(bvid)}`;

    fetch(`https://api.bilibili.com/x/player/pagelist?${query}`, {
      credentials: "include",
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.code !== 0 || !Array.isArray(json.data)) return null;
        const pageData = json.data.find(
          (item: unknown): item is { page: number; cid: number } =>
            globalThis.PipCompanion.util.isRecord(item) &&
            item.page === page &&
            typeof item.cid === "number" &&
            Number.isSafeInteger(item.cid) &&
            item.cid > 0,
        );
        return pageData?.cid
          ? fetch(
              `https://api.bilibili.com/x/player/videoshot?${query}&cid=${pageData.cid}&index=1`,
              { credentials: "include" },
            ).then((res) => res.json())
          : null;
      })
      .then(async (json) => {
        if (
          !json ||
          json.code !== 0 ||
          !json.data ||
          !Array.isArray(json.data.image) ||
          currentKey() !== key
        )
          return;

        const data = json.data as BilibiliVideoshotData;
        data.image = await resolveBilibiliImagesToBlobs(data.image);
        if (currentKey() !== key) return;
        cachedBilibiliKey = key;
        cachedBilibiliData = data;
      })
      .catch(() => {})
      .finally(() => bilibiliFetchPending.delete(key));
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
        const indexTime = data.index[mid];
        if (indexTime === undefined) break;
        if (indexTime <= seconds) {
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
    if (!rawUrl) return null;
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
      const videoSn = window.animefun?.videoSn;
      if (videoSn) return String(videoSn);
    } catch {}
    return null;
  }

  function parseBahaStoryboardData(value: unknown): BahaStoryboardData | null {
    if (!globalThis.PipCompanion.util.isRecord(value)) return null;
    const images = value.images;
    if (!Array.isArray(images)) return null;
    const validImages = images.filter(
      (image): image is string => typeof image === "string" && image.length > 0,
    );
    if (validImages.length === 0) return null;

    const positiveNumber = (input: unknown, fallback: number) =>
      typeof input === "number" && Number.isFinite(input) && input > 0
        ? input
        : fallback;
    const positiveInteger = (input: unknown, fallback: number) =>
      typeof input === "number" && Number.isSafeInteger(input) && input > 0
        ? input
        : fallback;
    const sn = typeof value.sn === "string" ? value.sn : undefined;

    return {
      ...(sn ? { sn } : {}),
      width: positiveNumber(value.width, 160),
      height: positiveNumber(value.height, 90),
      cols: positiveInteger(value.cols, 10),
      rows: positiveInteger(value.rows, 10),
      interval: positiveNumber(value.interval, 10),
      images: validImages,
    };
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
        const parsed = parseBahaStoryboardData(JSON.parse(raw));
        if (parsed && (!sn || !parsed.sn || parsed.sn === sn)) {
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

  function getNetflixFrame(seconds: number): StoryboardFrame | null {
    const root = document.documentElement;
    if (!root) return null;
    delete root.dataset.pipNetflixStoryboardFrame;
    document.dispatchEvent(
      new CustomEvent("pip-companion-request-netflix-storyboard", {
        detail: { seconds, path: location.pathname },
      }),
    );
    const raw = root.dataset.pipNetflixStoryboardFrame;
    if (!raw) return null;
    try {
      const frame: unknown = JSON.parse(raw);
      if (
        !globalThis.PipCompanion.util.isRecord(frame) ||
        frame.path !== location.pathname ||
        frame.seconds !== seconds ||
        typeof frame.url !== "string" ||
        !frame.url.startsWith(`blob:${location.origin}/`) ||
        typeof frame.width !== "number" ||
        !Number.isFinite(frame.width) ||
        frame.width <= 0 ||
        frame.width > 2048 ||
        typeof frame.height !== "number" ||
        !Number.isFinite(frame.height) ||
        frame.height <= 0 ||
        frame.height > 2048
      )
        return null;
      return {
        url: frame.url,
        x: 0,
        y: 0,
        width: frame.width,
        height: frame.height,
      };
    } catch {
      return null;
    }
  }

  type Platform = "youtube" | "bilibili" | "bahamut" | "netflix" | "unknown";

  function getPlatform(): Platform {
    const site = globalThis.PipCompanion.site;
    const host = location.hostname;
    if (site.isYouTubeHost(host)) return "youtube";
    if (site.isBilibiliHost(host) && !site.isBilibiliLiveHost(host))
      return "bilibili";
    if (site.isGamerHost(host)) return "bahamut";
    if (site.isNetflixHost(host)) return "netflix";
    return "unknown";
  }

  window.addEventListener(
    "message",
    (e: MessageEvent<unknown>) => {
      if (!globalThis.PipCompanion.util.isRecord(e.data)) return;
      const data = e.data;
      if (data.type === "PIP_YT_STORYBOARD_DATA") {
        const spec = typeof data.spec === "string" ? data.spec : "";
        const parsed = parseYouTubeSpec(spec);
        if (parsed) {
          cachedYtStoryboard = parsed;
          cachedYtVideoId =
            (typeof data.videoId === "string" ? data.videoId : "") ||
            getYouTubeVideoId() ||
            "";
        }
      } else if (data.type === "PIP_YT_RESET") {
        cachedYtVideoId = "";
        cachedYtStoryboard = null;
      } else if (data.type === "PIP_BAHA_STORYBOARD_DATA") {
        const bahaData = parseBahaStoryboardData(data.data);
        const currentSn = getBahaSn();
        if (
          bahaData &&
          (!currentSn || !bahaData.sn || bahaData.sn === currentSn)
        )
          cachedBahaData = bahaData;
      } else if (data.type === "PIP_BAHA_RESET") cachedBahaData = null;
    },
    { passive: true },
  );

  document.addEventListener("pip-companion-yt-storyboard", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const detail: unknown = event.detail;
    if (!globalThis.PipCompanion.util.isRecord(detail)) return;
    const spec = typeof detail.spec === "string" ? detail.spec : "";
    const parsed = parseYouTubeSpec(spec);
    if (parsed) {
      cachedYtStoryboard = parsed;
      cachedYtVideoId =
        (typeof detail.videoId === "string" ? detail.videoId : "") ||
        getYouTubeVideoId() ||
        "";
    }
  });

  document.addEventListener("pip-companion-yt-reset", () => {
    cachedYtVideoId = "";
    cachedYtStoryboard = null;
  });

  document.addEventListener("pip-companion-baha-storyboard", (event) => {
    if (!(event instanceof CustomEvent)) return;
    const bahaData = parseBahaStoryboardData(event.detail);
    const currentSn = getBahaSn();
    if (bahaData && (!currentSn || !bahaData.sn || bahaData.sn === currentSn))
      cachedBahaData = bahaData;
  });

  document.addEventListener("pip-companion-baha-reset", () => {
    cachedBahaData = null;
  });

  function preload(video: HTMLVideoElement | null) {
    if (!video) return;
    const platform = getPlatform();

    if (platform === "netflix") {
      getNetflixFrame(Math.max(0, video.currentTime));
      return;
    }

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
      if (
        bvid &&
        (cachedBilibiliKey !== getBilibiliKey(bvid) || !cachedBilibiliData)
      )
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

    if (platform === "netflix") return getNetflixFrame(seconds);

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
      const key = getBilibiliKey(bvid);
      if (cachedBilibiliKey !== key || !cachedBilibiliData)
        loadBilibiliVideoshot(bvid);
      if (cachedBilibiliData && cachedBilibiliKey === key)
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
    if (getPlatform() === "netflix")
      document.dispatchEvent(
        new CustomEvent("pip-companion-reset-netflix-storyboard"),
      );
    cachedYtVideoId = "";
    cachedYtStoryboard = null;
    cachedBilibiliKey = "";
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
