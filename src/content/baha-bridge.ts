"use strict";

(() => {
  function getBahaSn(url = location.href): string {
    try {
      const fromUrl = new URL(url, location.href).searchParams.get("sn");
      if (fromUrl) return fromUrl;
    } catch {}
    try {
      const win = window as unknown as {
        animefun?: { videoSn?: string | number };
      };
      if (win.animefun?.videoSn) return String(win.animefun.videoSn);
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

  async function emitBahaData(
    opts: {
      width?: number;
      height?: number;
      columns?: number;
      rows?: number;
      interval?: number;
      images?: string[];
    },
    sn = getBahaSn(),
  ) {
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
            .then((json) => {
              if (
                json &&
                Array.isArray(json.images) &&
                json.images.length > 0 &&
                typeof json.interval === "number"
              ) {
                const search = new URL(url, location.href).search;
                const resolvedImages = json.images.map((img: string) => {
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
                    columns: json.cols || 10,
                    rows: json.rows || 10,
                    interval: json.interval,
                    images: resolvedImages,
                  },
                  requestSn,
                );
              }
            })
            .catch(() => {});
        } catch {}
        return res;
      };
    }
  } catch {}

  function getPlayer() {
    try {
      const win = window as unknown as {
        videojs?: {
          getPlayer?: (id: string) => unknown;
          players?: Record<string, unknown>;
        };
      };

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
        const el = document.querySelector(sel) as { player?: unknown } | null;
        if (el?.player) return el.player as Record<string, unknown>;
      }

      const winPlayer =
        win.videojs?.getPlayer?.("ani_video") ||
        win.videojs?.players?.["ani_video"];
      if (winPlayer) return winPlayer as Record<string, unknown>;
    } catch {}
    return null;
  }

  function syncBahaData() {
    try {
      const player = getPlayer();
      if (!player) return;

      const animeSpriteThumbnails = player.animeSpriteThumbnails as
        | (() => {
            options?: {
              width?: number;
              height?: number;
              columns?: number;
              rows?: number;
              interval?: number;
              images?: string[];
            };
            setSrc?: (cfg: unknown) => unknown;
            _pipHooked?: boolean;
          })
        | undefined;

      if (typeof animeSpriteThumbnails === "function") {
        const plugin = animeSpriteThumbnails.call(player);
        if (plugin) {
          const proto = Object.getPrototypeOf(plugin) as {
            setSrc?: (cfg: unknown) => unknown;
            _pipHooked?: boolean;
          };

          if (
            proto &&
            typeof proto.setSrc === "function" &&
            !proto._pipHooked
          ) {
            proto._pipHooked = true;
            const origSetSrc = proto.setSrc;
            proto.setSrc = function (cfg: unknown) {
              const res = origSetSrc.call(this, cfg);
              try {
                const conf = (cfg ||
                  (
                    this as {
                      options?: {
                        width?: number;
                        height?: number;
                        columns?: number;
                        rows?: number;
                        interval?: number;
                        images?: string[];
                      };
                    }
                  ).options) as {
                  width?: number;
                  height?: number;
                  columns?: number;
                  rows?: number;
                  interval?: number;
                  images?: string[];
                };
                if (conf?.images && conf.images.length > 0) emitBahaData(conf);
              } catch {}
              return res;
            };
          }

          if (plugin.options?.images && plugin.options.images.length > 0)
            emitBahaData(plugin.options);
        }
      }
    } catch {}
  }

  window.addEventListener(
    "message",
    (e: MessageEvent<{ type?: string }>) => {
      if (e.data?.type === "PIP_REQUEST_BAHA_DATA") syncBahaData();
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
