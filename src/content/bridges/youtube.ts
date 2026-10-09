"use strict";

(() => {
  function extractSpecFromObject(obj: unknown, depth = 0): string {
    if (!obj || depth > 5) return "";
    try {
      if (typeof obj === "string") {
        if (
          obj.includes("|") &&
          (obj.includes("storyboard") || obj.includes("http"))
        )
          return obj;
        try {
          obj = JSON.parse(obj);
        } catch {
          return "";
        }
      }
      if (typeof obj !== "object" || obj === null) return "";
      const o = obj as Record<string, unknown>;

      if (typeof o.spec === "string" && o.spec.includes("|")) return o.spec;
      if (
        o.playerStoryboardSpecRenderer &&
        typeof (o.playerStoryboardSpecRenderer as { spec?: string }).spec ===
          "string"
      )
        return (o.playerStoryboardSpecRenderer as { spec: string }).spec;
      if (o.storyboards) {
        const found = extractSpecFromObject(o.storyboards, depth + 1);
        if (found) return found;
      }
      if (o.playerConfig) {
        const found = extractSpecFromObject(o.playerConfig, depth + 1);
        if (found) return found;
      }
      if (
        typeof o.storyboard_spec === "string" &&
        o.storyboard_spec.includes("|")
      )
        return o.storyboard_spec;
      if (o.player_response) {
        const found = extractSpecFromObject(o.player_response, depth + 1);
        if (found) return found;
      }
    } catch {}
    return "";
  }

  function syncYouTubeData() {
    try {
      const player = document.querySelector("#movie_player") as {
        getStoryboardFormat?: () => string;
        getPlayerResponse?: () => unknown;
        getVideoData?: () => {
          video_id?: string;
          isLive?: boolean;
        };
      } | null;

      let spec = "";
      let isLive = false;
      let videoId = "";

      if (player) {
        if (typeof player.getStoryboardFormat === "function") {
          try {
            const s = player.getStoryboardFormat();
            if (typeof s === "string" && s.includes("|")) spec = s;
          } catch {}
        }

        if (!spec && typeof player.getPlayerResponse === "function") {
          try {
            spec = extractSpecFromObject(player.getPlayerResponse());
          } catch {}
        }

        if (typeof player.getVideoData === "function") {
          try {
            const data = player.getVideoData();
            if (data) {
              isLive = Boolean(data.isLive);
              videoId = data.video_id || "";
            }
          } catch {}
        }
      }

      if (!spec) {
        try {
          const ytWin = window as unknown as {
            ytInitialPlayerResponse?: unknown;
            ytplayer?: {
              config?: {
                args?: Record<string, unknown>;
              };
            };
            ytcfg?: {
              get?: (k: string) => unknown;
              data_?: Record<string, unknown>;
            };
          };

          if (ytWin.ytInitialPlayerResponse)
            spec = extractSpecFromObject(ytWin.ytInitialPlayerResponse);
          if (!spec && ytWin.ytplayer?.config?.args)
            spec = extractSpecFromObject(ytWin.ytplayer.config.args);
          if (!spec && ytWin.ytcfg?.get)
            spec = extractSpecFromObject(ytWin.ytcfg.get("PLAYER_VARS"));
          if (!spec && ytWin.ytcfg?.data_?.PLAYER_VARS)
            spec = extractSpecFromObject(ytWin.ytcfg.data_.PLAYER_VARS);
        } catch {}
      }

      if (!videoId) {
        try {
          const url = new URL(location.href);
          videoId =
            url.searchParams.get("v") ||
            url.pathname.match(/\/shorts\/([^/?]+)/)?.[1] ||
            url.pathname.match(/\/live\/([^/?]+)/)?.[1] ||
            "";
        } catch {}
      }

      if (document.documentElement) {
        if (spec) document.documentElement.dataset.pipYtStoryboard = spec;
        if (videoId) document.documentElement.dataset.pipYtVideoId = videoId;
        document.documentElement.dataset.pipYtIsLive = String(isLive);
      }

      window.postMessage(
        {
          type: "PIP_YT_STORYBOARD_DATA",
          spec,
          videoId,
          isLive,
        },
        "*",
      );

      document.dispatchEvent(
        new CustomEvent("pip-companion-yt-storyboard", {
          detail: { spec, videoId, isLive },
        }),
      );
    } catch {}
  }

  function resetYouTubeData() {
    if (document.documentElement) {
      delete document.documentElement.dataset.pipYtStoryboard;
      delete document.documentElement.dataset.pipYtVideoId;
      delete document.documentElement.dataset.pipYtIsLive;
    }
    window.postMessage({ type: "PIP_YT_RESET" }, "*");
    document.dispatchEvent(new CustomEvent("pip-companion-yt-reset"));
  }

  let requestPollTimer: ReturnType<typeof setInterval> | null = null;

  function requestSync() {
    syncYouTubeData();
    if (document.documentElement?.dataset.pipYtStoryboard) return;
    if (requestPollTimer) clearInterval(requestPollTimer);
    let count = 0;
    requestPollTimer = setInterval(() => {
      count++;
      syncYouTubeData();
      if (document.documentElement?.dataset.pipYtStoryboard || count >= 15) {
        if (requestPollTimer) clearInterval(requestPollTimer);
        requestPollTimer = null;
      }
    }, 500);
  }

  window.addEventListener("yt-navigate-start", resetYouTubeData, {
    passive: true,
  });
  window.addEventListener("yt-navigate-finish", requestSync, {
    passive: true,
  });
  window.addEventListener("yt-player-updated", requestSync, {
    passive: true,
  });
  window.addEventListener("yt-page-data-updated", requestSync, {
    passive: true,
  });
  document.addEventListener("pip-companion-request-yt-data", requestSync, {
    passive: true,
  });
  window.addEventListener(
    "message",
    (e) => {
      if (e.data?.type === "PIP_REQUEST_YT_DATA") requestSync();
    },
    { passive: true },
  );

  let pollCount = 0;
  const pollTimer = setInterval(() => {
    pollCount++;
    syncYouTubeData();
    if (document.documentElement?.dataset.pipYtStoryboard || pollCount >= 20)
      clearInterval(pollTimer);
  }, 500);

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", requestSync, {
      once: true,
    });
  else requestSync();
})();
