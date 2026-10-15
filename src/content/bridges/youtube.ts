"use strict";

(() => {
  const MAX_SUBTITLE_RESPONSE_BYTES = 5_000_000;
  const INNERTUBE_CLIENT_VERSION = "20.10.4";
  const INNERTUBE_TRACK_CACHE_MS = 5 * 60 * 1000;
  let cachedInnerTubeTracks: {
    videoId: string;
    expiresAt: number;
    tracks: Record<string, unknown>[];
  } | null = null;
  let innerTubeTracksRequest: {
    videoId: string;
    promise: Promise<Record<string, unknown>[]>;
  } | null = null;

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

  function readSubtitleTrackText(value: unknown): string {
    if (typeof value === "string") return value;
    if (!isRecord(value)) return "";
    if (typeof value.simpleText === "string") return value.simpleText;
    if (Array.isArray(value.runs))
      return value.runs
        .map((run) =>
          isRecord(run) && typeof run.text === "string" ? run.text : "",
        )
        .join("");
    return "";
  }

  function getSubtitleTrackKey(track: Record<string, unknown>): string {
    const vssId = track.vss_id ?? track.vssId;
    if (typeof vssId === "string") return vssId;
    return [
      track.languageCode,
      track.kind,
      readSubtitleTrackText(track.languageName ?? track.name),
    ]
      .map((value) => (typeof value === "string" ? value : ""))
      .join(":");
  }

  function getPlayerSubtitleTracks(
    player: YouTubePlayer,
  ): Record<string, unknown>[] {
    try {
      const response = player.getPlayerResponse?.();
      if (isRecord(response)) {
        const captions = isRecord(response.captions)
          ? response.captions.playerCaptionsTracklistRenderer
          : null;
        if (isRecord(captions) && Array.isArray(captions.captionTracks))
          return captions.captionTracks.filter(isRecord);
        const subtitles = isRecord(response.subtitles)
          ? response.subtitles.playerSubtitlesTracklistRenderer
          : null;
        return isRecord(subtitles) && Array.isArray(subtitles.subtitleTracks)
          ? subtitles.subtitleTracks.filter(isRecord)
          : [];
      }
      return [];
    } catch {
      return [];
    }
  }

  function findPlayerSubtitleTrack(
    track: Record<string, unknown>,
    playerTracks: Record<string, unknown>[],
  ): Record<string, unknown> | null {
    const key = getSubtitleTrackKey(track);
    const exactMatch = playerTracks.find(
      (candidate) => getSubtitleTrackKey(candidate) === key,
    );
    if (exactMatch) return exactMatch;

    const language = track.languageCode;
    if (typeof language !== "string" || !language) return null;
    const kind = typeof track.kind === "string" ? track.kind : "";
    const name = readSubtitleTrackText(
      track.languageName ?? track.displayName ?? track.name,
    );
    const matches = playerTracks.filter((candidate) => {
      const candidateKind =
        typeof candidate.kind === "string" ? candidate.kind : "";
      const candidateName = readSubtitleTrackText(
        candidate.languageName ?? candidate.displayName ?? candidate.name,
      );
      return (
        candidate.languageCode === language &&
        (!kind || !candidateKind || kind === candidateKind) &&
        (!name || !candidateName || name === candidateName)
      );
    });
    return matches.length === 1 ? matches[0]! : null;
  }

  async function fetchInnerTubeSubtitleTracks(
    videoId: string,
  ): Promise<Record<string, unknown>[]> {
    if (
      cachedInnerTubeTracks?.videoId === videoId &&
      cachedInnerTubeTracks.expiresAt > Date.now()
    )
      return cachedInnerTubeTracks.tracks;
    if (innerTubeTracksRequest?.videoId === videoId)
      return innerTubeTracksRequest.promise;

    const request = (async () => {
      const apiKey =
        window.ytcfg?.get?.("INNERTUBE_API_KEY") ??
        window.ytcfg?.data_?.INNERTUBE_API_KEY;
      if (typeof apiKey !== "string" || !apiKey)
        throw new Error("innertube-api-key-unavailable");

      const endpoint = new URL("/youtubei/v1/player", location.origin);
      endpoint.searchParams.set("key", apiKey);
      endpoint.searchParams.set("prettyPrint", "false");
      const response = await fetch(endpoint.href, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json",
          Accept: "*/*",
          "X-YouTube-Client-Name": "5",
          "X-YouTube-Client-Version": INNERTUBE_CLIENT_VERSION,
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: "IOS",
              clientVersion: INNERTUBE_CLIENT_VERSION,
              hl: "en",
              gl: "US",
              deviceMake: "Apple",
              deviceModel: "iPhone16,2",
              platform: "MOBILE",
              osName: "iOS",
              osVersion: "18.3.2.22D82",
            },
            user: { lockedSafetyMode: false },
            request: { useSsl: true },
          },
          videoId,
          contentCheckOk: true,
          racyCheckOk: true,
        }),
      });
      if (!response.ok) throw new Error(`innertube-http-${response.status}`);
      const body = await readLimitedText(response, MAX_SUBTITLE_RESPONSE_BYTES);
      const payload: unknown = JSON.parse(body);
      if (!isRecord(payload) || !isRecord(payload.captions))
        throw new Error("innertube-captions-unavailable");
      const tracklist = payload.captions.playerCaptionsTracklistRenderer;
      if (!isRecord(tracklist) || !Array.isArray(tracklist.captionTracks))
        throw new Error("innertube-captions-unavailable");
      const tracks = tracklist.captionTracks.filter(isRecord);
      cachedInnerTubeTracks = {
        videoId,
        expiresAt: Date.now() + INNERTUBE_TRACK_CACHE_MS,
        tracks,
      };
      return tracks;
    })();
    innerTubeTracksRequest = { videoId, promise: request };
    try {
      return await request;
    } finally {
      if (innerTubeTracksRequest?.promise === request)
        innerTubeTracksRequest = null;
    }
  }

  function getPlayerOption(player: YouTubePlayer, option: string): unknown {
    try {
      const value = player.getOption?.("captions", option);
      if (value !== undefined && value !== null) return value;
    } catch {}
    try {
      return player.getOption?.("subtitles", option);
    } catch {
      return undefined;
    }
  }

  function setPlayerSubtitleTrack(player: YouTubePlayer, track: unknown): void {
    try {
      player.setOption?.("captions", "track", track);
      return;
    } catch {}
    try {
      player.setOption?.("subtitles", "track", track);
    } catch {}
  }

  function getSubtitleTracks(player: YouTubePlayer): Record<string, unknown>[] {
    let available: Record<string, unknown>[] = [];
    try {
      const tracks = getPlayerOption(player, "tracklist");
      if (Array.isArray(tracks)) available = tracks.filter(isRecord);
    } catch {}

    const playerTracks = getPlayerSubtitleTracks(player);
    if (!available.length) return playerTracks;
    return available.map((track) => {
      const playerTrack = findPlayerSubtitleTrack(track, playerTracks);
      return playerTrack && typeof playerTrack.baseUrl === "string"
        ? { ...track, baseUrl: playerTrack.baseUrl }
        : track;
    });
  }

  function canLoadSubtitleCues(track: Record<string, unknown>): boolean {
    if (typeof track.baseUrl !== "string") return false;
    try {
      const url = new URL(track.baseUrl);
      return (
        url.protocol === "https:" &&
        (url.hostname === "youtube.com" ||
          url.hostname === "www.youtube.com") &&
        url.pathname === "/api/timedtext"
      );
    } catch {
      return false;
    }
  }

  function parseSubtitleCues(value: unknown) {
    if (!isRecord(value) || !Array.isArray(value.events)) return [];
    const cues: { from: number; to: number; content: string }[] = [];
    let totalTextLength = 0;
    for (const event of value.events) {
      if (
        !isRecord(event) ||
        typeof event.tStartMs !== "number" ||
        !Number.isFinite(event.tStartMs) ||
        typeof event.dDurationMs !== "number" ||
        !Number.isFinite(event.dDurationMs) ||
        event.dDurationMs <= 0 ||
        !Array.isArray(event.segs)
      )
        continue;
      const content = event.segs
        .map((segment) =>
          isRecord(segment) && typeof segment.utf8 === "string"
            ? segment.utf8
            : "",
        )
        .join("")
        .replace(/<[^>]*>/g, "")
        .trim();
      if (!content) continue;
      totalTextLength += content.length;
      if (cues.length >= 5000 || totalTextLength > 1_000_000) break;
      cues.push({
        from: event.tStartMs / 1000,
        to: (event.tStartMs + event.dDurationMs) / 1000,
        content,
      });
    }
    return cues;
  }

  async function readLimitedText(response: Response, maxBytes: number) {
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Missing response body");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error("Response is too large");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
  }

  async function requestSubtitleCues(key: string, requestId: number) {
    let cues: { from: number; to: number; content: string }[] = [];
    let ok = false;
    let error = "request-failed";
    let videoId = "";
    try {
      const player = document.querySelector<YouTubePlayer>("#movie_player");
      videoId = player?.getVideoData?.()?.video_id || "";
      const track = player
        ? getSubtitleTracks(player).find(
            (candidate) => getSubtitleTrackKey(candidate) === key,
          )
        : null;
      if (!track || typeof track.baseUrl !== "string") {
        error = "track-unavailable";
        throw new Error();
      }
      let cueBaseUrl = track.baseUrl;
      if (cueBaseUrl.includes("&exp=xpe")) {
        const videoId = player?.getVideoData?.()?.video_id;
        if (!videoId) {
          error = "innertube-video-id-unavailable";
          throw new Error();
        }
        const tracks = await fetchInnerTubeSubtitleTracks(videoId);
        const freshTrack = findPlayerSubtitleTrack(track, tracks);
        if (!freshTrack || typeof freshTrack.baseUrl !== "string") {
          error = "innertube-track-unavailable";
          throw new Error();
        }
        cueBaseUrl = freshTrack.baseUrl;
      }
      const url = new URL(cueBaseUrl);
      if (
        url.protocol !== "https:" ||
        !(
          url.hostname === "youtube.com" || url.hostname === "www.youtube.com"
        ) ||
        url.pathname !== "/api/timedtext"
      ) {
        error = "invalid-timedtext-url";
        throw new Error();
      }
      const formatParameter = /([?&])fmt=[^&]*/;
      const cueUrl = formatParameter.test(cueBaseUrl)
        ? cueBaseUrl.replace(formatParameter, "$1fmt=json3")
        : `${cueBaseUrl}${cueBaseUrl.includes("?") ? "&" : "?"}fmt=json3`;
      const response = await fetch(cueUrl, { credentials: "same-origin" });
      const contentLength = Number(response.headers.get("content-length"));
      if (!response.ok) {
        error = `http-${response.status}`;
        throw new Error();
      }
      if (
        Number.isFinite(contentLength) &&
        contentLength > MAX_SUBTITLE_RESPONSE_BYTES
      ) {
        error = "response-too-large";
        throw new Error();
      }
      const body = await readLimitedText(
        response,
        MAX_SUBTITLE_RESPONSE_BYTES,
      ).catch((cause: unknown) => {
        error =
          cause instanceof Error && cause.message === "Response is too large"
            ? "response-too-large"
            : "response-read-failed";
        throw cause;
      });
      if (!body.trim()) {
        error = "empty-response";
        throw new Error();
      }
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        error = "invalid-response";
        throw new Error();
      }
      cues = parseSubtitleCues(payload);
      ok = cues.length > 0;
      if (!ok) error = "no-cues";
      else error = "";
    } catch (cause) {
      if (error === "request-failed" && cause instanceof Error)
        error = `request-failed:${cause.name}`;
    }
    window.postMessage(
      {
        type: "PIP_YT_SUBTITLE_CUES",
        requestId,
        key,
        videoId,
        ok,
        error,
        cues,
      },
      location.origin,
    );
  }

  function syncYouTubeSubtitleTracks() {
    try {
      const player = document.querySelector<YouTubePlayer>("#movie_player");
      const tracks = player ? getSubtitleTracks(player) : [];
      const current = player ? getPlayerOption(player, "track") : undefined;
      const selectedKey = isRecord(current) ? getSubtitleTrackKey(current) : "";
      const videoId = player?.getVideoData?.()?.video_id || "";
      window.postMessage(
        {
          type: "PIP_YT_SUBTITLE_TRACKS",
          videoId,
          tracks: tracks.map((track) => ({
            key: getSubtitleTrackKey(track),
            label:
              readSubtitleTrackText(
                track.languageName ?? track.displayName ?? track.name,
              ) ||
              (typeof track.languageCode === "string"
                ? track.languageCode
                : ""),
            language:
              typeof track.languageCode === "string" ? track.languageCode : "",
            selected: getSubtitleTrackKey(track) === selectedKey,
            canLoadCues: canLoadSubtitleCues(track),
          })),
        },
        "*",
      );
    } catch {}
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

      syncYouTubeSubtitleTracks();

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
    window.postMessage({ type: "PIP_YT_SUBTITLE_TRACKS", tracks: [] }, "*");
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

  let subtitleSelectionGeneration = 0;
  window.addEventListener(
    "message",
    (e) => {
      if (e.source !== window) return;
      if (e.data?.type === "PIP_SELECT_YT_PLAYLIST") {
        const player = document.querySelector<YouTubePlayer>("#movie_player");
        const index = Number(e.data.index);
        if (!player || !Number.isInteger(index) || index < 0) return;
        try {
          if (typeof player.playVideoAt === "function")
            player.playVideoAt(index);
          else if (
            typeof e.data.videoId === "string" &&
            typeof player.loadVideoById === "function"
          )
            player.loadVideoById(e.data.videoId);
          if (document.documentElement)
            document.documentElement.dataset.pipYtPlaylistIndex = String(index);
        } catch {}
        return;
      }
      if (e.data?.type === "PIP_REQUEST_YT_SUBTITLE_TRACKS") {
        syncYouTubeSubtitleTracks();
        return;
      }
      if (e.data?.type === "PIP_REQUEST_YT_SUBTITLE_CUES") {
        if (
          typeof e.data.key === "string" &&
          e.data.key.length <= 200 &&
          typeof e.data.requestId === "number" &&
          Number.isInteger(e.data.requestId)
        )
          void requestSubtitleCues(e.data.key, e.data.requestId);
        return;
      }
      if (e.data?.type === "PIP_SET_YT_SUBTITLES_ENABLED") {
        if (typeof e.data.enabled !== "boolean") return;
        subtitleSelectionGeneration++;
        const button = document.querySelector<HTMLElement>(
          "#movie_player .ytp-subtitles-button",
        );
        if (
          button &&
          (button.getAttribute("aria-pressed") === "true") !== e.data.enabled
        )
          button.click();
        syncYouTubeSubtitleTracks();
        return;
      }
      if (e.data?.type !== "PIP_SELECT_YT_SUBTITLE_TRACK") return;
      if (typeof e.data.key !== "string") return;
      const key = e.data.key;
      const generation = ++subtitleSelectionGeneration;
      void (async () => {
        const player = document.querySelector<YouTubePlayer>("#movie_player");
        if (!player?.setOption) return;
        const button = document.querySelector<HTMLElement>(
          "#movie_player .ytp-subtitles-button",
        );
        if (button?.getAttribute("aria-pressed") !== "true") button?.click();
        if (button) {
          for (let attempt = 0; attempt < 20; attempt++) {
            if (generation !== subtitleSelectionGeneration) return;
            if (button.getAttribute("aria-pressed") === "true") break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        }
        if (generation !== subtitleSelectionGeneration) return;
        const track = getSubtitleTracks(player).find(
          (entry) => getSubtitleTrackKey(entry) === key,
        );
        if (!track) return;
        try {
          setPlayerSubtitleTrack(player, track);
          for (let attempt = 0; attempt < 20; attempt++) {
            if (generation !== subtitleSelectionGeneration) return;
            const current = getPlayerOption(player, "track");
            if (isRecord(current) && getSubtitleTrackKey(current) === key)
              break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } catch {}
        if (generation === subtitleSelectionGeneration)
          syncYouTubeSubtitleTracks();
      })();
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
