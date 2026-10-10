"use strict";

(() => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

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
      if (!isRecord(obj)) return "";
      const o = obj;

      if (typeof o.spec === "string" && o.spec.includes("|")) return o.spec;
      const renderer = o.playerStoryboardSpecRenderer;
      if (isRecord(renderer) && typeof renderer.spec === "string")
        return renderer.spec;
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
      const player = document.querySelector<YouTubePlayer>("#movie_player");

      let spec = "";
      let isLive = false;
      let videoId = "";
      let playlistIndex = -1;

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

        if (typeof player.getPlaylistIndex === "function") {
          try {
            const index = player.getPlaylistIndex();
            if (Number.isInteger(index) && index >= 0) playlistIndex = index;
          } catch {}
        }
      }

      if (!spec) {
        try {
          if (window.ytInitialPlayerResponse)
            spec = extractSpecFromObject(window.ytInitialPlayerResponse);
          if (!spec && window.ytplayer?.config?.args)
            spec = extractSpecFromObject(window.ytplayer.config.args);
          if (!spec && window.ytcfg?.get)
            spec = extractSpecFromObject(window.ytcfg.get("PLAYER_VARS"));
          if (!spec && window.ytcfg?.data_?.PLAYER_VARS)
            spec = extractSpecFromObject(window.ytcfg.data_.PLAYER_VARS);
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
        if (playlistIndex >= 0)
          document.documentElement.dataset.pipYtPlaylistIndex =
            String(playlistIndex);
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
      delete document.documentElement.dataset.pipYtPlaylistIndex;
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

  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== window || e.data?.type !== "PIP_SELECT_YT_PLAYLIST")
        return;
      const player = document.querySelector<YouTubePlayer>("#movie_player");
      const index = Number(e.data.index);
      if (!player || !Number.isInteger(index) || index < 0) return;
      try {
        if (typeof player.playVideoAt === "function") player.playVideoAt(index);
        else if (
          typeof e.data.videoId === "string" &&
          typeof player.loadVideoById === "function"
        )
          player.loadVideoById(e.data.videoId);
        if (document.documentElement)
          document.documentElement.dataset.pipYtPlaylistIndex = String(index);
      } catch {}
    },
    { passive: true },
  );

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
