"use strict";

(() => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isStringArray(value: unknown): value is string[] {
    return (
      Array.isArray(value) && value.every((item) => typeof item === "string")
    );
  }

  function positiveNumber(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
      ? value
      : fallback;
  }

  interface BahaSpriteOptions {
    width?: number;
    height?: number;
    columns?: number;
    rows?: number;
    interval?: number;
    images?: string[];
  }

  function isBahaSpriteOptions(value: unknown): value is BahaSpriteOptions {
    if (!isRecord(value)) return false;
    for (const key of ["width", "height", "columns", "rows", "interval"])
      if (
        value[key] !== undefined &&
        (typeof value[key] !== "number" || !Number.isFinite(value[key]))
      )
        return false;
    return value.images === undefined || isStringArray(value.images);
  }

  function getBahaSn(url = location.href): string {
    try {
      const fromUrl = new URL(url, location.href).searchParams.get("sn");
      if (fromUrl) return fromUrl;
    } catch {}
    try {
      const videoSn = window.animefun?.videoSn;
      if (videoSn) return String(videoSn);
    } catch {}
    return "";
  }

  const blobUrlCache = new Map<string, string>();

  async function resolveImagesToBlobs(images: string[]): Promise<string[]> {
    return Promise.all(
      images.map(async (url) => {
        if (!url || url.startsWith("blob:") || url.startsWith("data:"))
          return url;
        if (blobUrlCache.has(url)) return blobUrlCache.get(url)!;
        try {
          const res = await fetch(url);
          if (!res.ok) return url;
          const blob = await res.blob();
          const objUrl = URL.createObjectURL(blob);
          blobUrlCache.set(url, objUrl);
          return objUrl;
        } catch {
          return url;
        }
      }),
    );
  }

  function resetBahaData() {
    if (document.documentElement)
      delete document.documentElement.dataset.pipBahaStoryboard;
    window.postMessage({ type: "PIP_BAHA_RESET" }, "*");
    document.dispatchEvent(new CustomEvent("pip-companion-baha-reset"));
  }

  async function emitBahaData(opts: BahaSpriteOptions, sn = getBahaSn()) {
    if (!opts || !Array.isArray(opts.images) || opts.images.length === 0)
      return;

    const blobImages = await resolveImagesToBlobs(opts.images);
    const data: BahaStoryboardData = {
      sn,
      width: opts.width || 160,
      height: opts.height || 90,
      cols: opts.columns || 10,
      rows: opts.rows || 10,
      interval: opts.interval || 10,
      images: blobImages,
    };

    if (document.documentElement)
      document.documentElement.dataset.pipBahaStoryboard = JSON.stringify(data);

    window.postMessage(
      {
        type: "PIP_BAHA_STORYBOARD_DATA",
        data,
      },
      "*",
    );

    document.dispatchEvent(
      new CustomEvent("pip-companion-baha-storyboard", {
        detail: data,
      }),
    );
  }

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === "function") {
      window.fetch = async function (...args) {
        const input = args[0];
        const url =
          typeof input === "string"
            ? input
            : input instanceof Request
              ? input.url
              : input instanceof URL
                ? input.href
                : "";
        const requestSn = getBahaSn(url || location.href) || getBahaSn();
        const res = await origFetch.apply(this, args);
        try {
          const clone = res.clone();
          clone
            .json()
            .then((json: unknown) => {
              if (
                !isRecord(json) ||
                !isStringArray(json.images) ||
                json.images.length === 0
              )
                return;

              const search = new URL(url, location.href).search;
              const resolvedImages = json.images.map((img) => {
                try {
                  const full = new URL(img, url).href;
                  return full.includes("?") || !search ? full : full + search;
                } catch {
                  return img;
                }
              });
              emitBahaData(
                {
                  width: 160,
                  height: 90,
                  columns: positiveNumber(json.cols, 10),
                  rows: positiveNumber(json.rows, 10),
                  interval: positiveNumber(json.interval, 10),
                  images: resolvedImages,
                },
                requestSn,
              );
            })
            .catch(() => {});
        } catch {}
        return res;
      };
    }
  } catch {}

  function getPlayer() {
    try {
      const selectors = [
        "#ani_video_html5_api",
        "#ani_video video",
        "#ani_video",
        ".video-js video",
        ".video-js",
        "#video-container .video-js",
        "video",
      ];

      for (const sel of selectors) {
        const element = document.querySelector(sel);
        if (element && "player" in element && isRecord(element.player))
          return element.player;
      }

      const winPlayer =
        window.videojs?.getPlayer?.("ani_video") ||
        window.videojs?.players?.["ani_video"];
      if (isRecord(winPlayer)) return winPlayer;
    } catch {}
    return null;
  }

  function syncBahaData() {
    try {
      const player = getPlayer();
      if (!player) return;

      const animeSpriteThumbnails = player.animeSpriteThumbnails;
      if (typeof animeSpriteThumbnails !== "function") return;

      const plugin: unknown = animeSpriteThumbnails.call(player);
      if (!isRecord(plugin)) return;

      const proto: unknown = Object.getPrototypeOf(plugin);
      if (
        isRecord(proto) &&
        typeof proto.setSrc === "function" &&
        !proto._pipHooked
      ) {
        const origSetSrc = proto.setSrc;
        proto._pipHooked = true;
        proto.setSrc = function (this: unknown, cfg: unknown) {
          const result = origSetSrc.call(this, cfg);
          try {
            const options = cfg
              ? isBahaSpriteOptions(cfg)
                ? cfg
                : null
              : isRecord(this) && isBahaSpriteOptions(this.options)
                ? this.options
                : null;
            if (options?.images?.length) void emitBahaData(options);
          } catch {}
          return result;
        };
      }

      if (isBahaSpriteOptions(plugin.options) && plugin.options.images?.length)
        void emitBahaData(plugin.options);
    } catch {}
  }

  window.addEventListener(
    "message",
    (e: MessageEvent<unknown>) => {
      if (isRecord(e.data) && e.data.type === "PIP_REQUEST_BAHA_DATA")
        syncBahaData();
    },
    { passive: true },
  );

  document.addEventListener("pip-companion-request-baha-data", syncBahaData, {
    passive: true,
  });

  setInterval(syncBahaData, 1000);

  document.addEventListener("play", syncBahaData, {
    capture: true,
    passive: true,
  });
  document.addEventListener("loadedmetadata", syncBahaData, {
    capture: true,
    passive: true,
  });

  window.addEventListener("popstate", resetBahaData, { passive: true });
  window.addEventListener("hashchange", resetBahaData, { passive: true });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", syncBahaData, { once: true });
  else syncBahaData();
})();
