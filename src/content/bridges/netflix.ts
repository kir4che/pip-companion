"use strict";

interface NetflixPlayer {
  seek(timeMs: number): void;
  isReady?: () => boolean;
  isPlaying?: () => boolean;
  getTimedTextTrackList?: () => unknown;
  getTimedTextTrack?: () => unknown;
  setTimedTextTrack?: (track: unknown) => unknown;
  getMovieId?: () => string | number;
  getTrickPlayFrame?: (timeMs: number) => unknown;
}

interface NetflixTimedTextCue {
  from: number;
  to: number;
  content: string;
}

interface NetflixVideoPlayerApi {
  getAllPlayerSessionIds(): string[];
  getVideoPlayerBySessionId(sessionId: string): NetflixPlayer | null;
}

interface NetflixApp {
  appContext?: {
    state?: {
      playerApp?: {
        getAPI?: () => { videoPlayer?: NetflixVideoPlayerApi };
        getState?: () => unknown;
      };
    };
  };
}

(() => {
  function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  function isReady(player: NetflixPlayer): boolean {
    if (typeof player.isReady !== "function") return true;
    try {
      return player.isReady();
    } catch {
      return false;
    }
  }

  function isPlaying(player: NetflixPlayer): boolean {
    try {
      return player.isPlaying?.() ?? false;
    } catch {
      return false;
    }
  }

  const manifestTimedTextUrls = new Map<string, string>();
  const manifestTimedTextUrlsByLanguage = new Map<string, string>();
  const manifestTimedTextUrlWaiters = new Map<
    string,
    Set<(url: string) => void>
  >();
  const timedTextCueCache = new Map<string, NetflixTimedTextCue[]>();
  let subtitleCueRequestGeneration = 0;
  let timedTextCacheScope = "";
  const WEBVTT_PROFILE = "webvtt-lssdh-ios8";
  const subtitleEntityDecoder = document.createElement("textarea");
  const storyboardFrames = new Map<string, string>();
  let storyboardScope = "";

  function resetStoryboard() {
    for (const url of storyboardFrames.values()) URL.revokeObjectURL(url);
    storyboardFrames.clear();
    storyboardScope = "";
    if (document.documentElement)
      delete document.documentElement.dataset.pipNetflixStoryboardFrame;
  }

  document.addEventListener(
    "pip-companion-reset-netflix-storyboard",
    resetStoryboard,
  );
  document.addEventListener("pip-companion-request-netflix-storyboard", (e) => {
    if (!(e instanceof CustomEvent) || !isRecord(e.detail)) return;
    const { seconds, path } = e.detail;
    const root = document.documentElement;
    if (!root) return;
    delete root.dataset.pipNetflixStoryboardFrame;
    if (
      path !== location.pathname ||
      typeof seconds !== "number" ||
      !Number.isFinite(seconds) ||
      seconds < 0
    )
      return;
    try {
      const session = getActivePlayerSession(path);
      const player = session?.player;
      if (!session || !player?.getTrickPlayFrame) return;
      const movieId = player.getMovieId?.();
      if (movieId != null && `/watch/${movieId}` !== path) return;
      const scope = `${path}:${session.sessionId}`;
      if (scope !== storyboardScope) {
        resetStoryboard();
        storyboardScope = scope;
      }
      const frame = player.getTrickPlayFrame(seconds * 1000);
      if (!isRecord(frame)) return;
      const { image, width, height, time } = frame;
      if (
        !ArrayBuffer.isView(image) ||
        image.byteLength === 0 ||
        image.byteLength > 2 * 1024 * 1024 ||
        typeof width !== "number" ||
        !Number.isFinite(width) ||
        width <= 0 ||
        width > 2048 ||
        typeof height !== "number" ||
        !Number.isFinite(height) ||
        height <= 0 ||
        height > 2048 ||
        typeof time !== "number" ||
        !Number.isFinite(time) ||
        time < 0
      )
        return;
      const key = String(time);
      let url = storyboardFrames.get(key);
      if (!url) {
        const bytes = new Uint8Array(
          image.buffer,
          image.byteOffset,
          image.byteLength,
        );
        // 複製播放器提供的圖片資料，避免影響 Netflix 自己的縮圖快取。
        url = URL.createObjectURL(
          new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }),
        );
        storyboardFrames.set(key, url);
        while (storyboardFrames.size > 16) {
          const oldest = storyboardFrames.keys().next().value!;
          URL.revokeObjectURL(storyboardFrames.get(oldest)!);
          storyboardFrames.delete(oldest);
        }
      }
      root.dataset.pipNetflixStoryboardFrame = JSON.stringify({
        path,
        seconds,
        url,
        width,
        height,
      });
    } catch {
      // 播放器尚未載入縮圖時，維持只顯示時間。
    }
  });

  function getPlayerRepositoryRoot(
    sessionId: string,
  ): Record<string, unknown> | null {
    try {
      const netflix = (window as Window & { netflix?: NetflixApp }).netflix;
      const root = (
        netflix?.appContext?.state?.playerApp?.getState?.() as
          | {
              videoPlayer?: {
                cadmiumPlayerRepository?: {
                  playersById?: Record<string, unknown>;
                };
              };
            }
          | undefined
      )?.videoPlayer?.cadmiumPlayerRepository?.playersById?.[sessionId];
      return isRecord(root) ? root : null;
    } catch {
      return null;
    }
  }

  function findVideoIdentity(
    value: unknown,
    depth = 0,
    seen = new WeakSet<object>(),
  ): string {
    if (depth > 6 || !isRecord(value) || seen.has(value)) return "";
    seen.add(value);
    for (const key of [
      "videoId",
      "video_id",
      "movieId",
      "movie_id",
      "catalogId",
      "catalog_id",
      "episodeId",
      "episode_id",
      "vpid",
    ]) {
      const candidate = value[key];
      if (
        (typeof candidate === "string" && candidate) ||
        (typeof candidate === "number" && Number.isFinite(candidate))
      )
        return `${key}:${String(candidate)}`;
    }
    for (const child of Object.values(value)) {
      const identity = Array.isArray(child)
        ? child
            .map((item) => findVideoIdentity(item, depth + 1, seen))
            .find(Boolean)
        : findVideoIdentity(child, depth + 1, seen);
      if (identity) return identity;
    }
    return "";
  }

  function getTimedTextCacheScope(sessionId: string): string {
    const videoIdentity =
      findVideoIdentity(getPlayerRepositoryRoot(sessionId)) ||
      `path:${location.pathname}`;
    const scope = `${sessionId}\u0000${videoIdentity}`;
    if (scope !== timedTextCacheScope) {
      manifestTimedTextUrls.clear();
      manifestTimedTextUrlsByLanguage.clear();
      timedTextCueCache.clear();
      timedTextCacheScope = scope;
    }
    return scope;
  }

  function getVideoIdentity(sessionId: string): string {
    return findVideoIdentity(getPlayerRepositoryRoot(sessionId));
  }

  function scopedCacheKey(scope: string, value: string): string {
    return `${scope}\u0000${value}`;
  }

  function notifyTimedTextUrl(key: string, url: string): void {
    const waiters = manifestTimedTextUrlWaiters.get(key);
    if (!waiters) return;
    manifestTimedTextUrlWaiters.delete(key);
    for (const waiter of waiters) waiter(url);
  }

  function cacheTimedTextUrl(
    cache: Map<string, string>,
    key: string,
    url: string,
  ): void {
    cache.set(key, url);
    notifyTimedTextUrl(key, url);
  }

  function getManifestTimedTextUrl(
    scope: string,
    trackIds: string[],
    languages: string[],
  ): string | undefined {
    return (
      trackIds
        .map((trackId) =>
          manifestTimedTextUrls.get(scopedCacheKey(scope, trackId)),
        )
        .find(Boolean) ??
      languages
        .map((language) =>
          manifestTimedTextUrlsByLanguage.get(scopedCacheKey(scope, language)),
        )
        .find(Boolean)
    );
  }

  function waitForManifestTimedTextUrl(
    scope: string,
    trackIds: string[],
    languages: string[],
  ): Promise<string | null> {
    const existing = getManifestTimedTextUrl(scope, trackIds, languages);
    if (existing) return Promise.resolve(existing);

    return new Promise((resolve) => {
      const keys = [
        ...new Set([
          ...trackIds.map((trackId) => scopedCacheKey(scope, trackId)),
          ...languages.map((language) => scopedCacheKey(scope, language)),
        ]),
      ];
      let settled = false;
      let timeout = 0;
      const finish = (url: string | null) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        for (const key of keys) {
          const waiters = manifestTimedTextUrlWaiters.get(key);
          waiters?.delete(onUrl);
          if (waiters?.size === 0) manifestTimedTextUrlWaiters.delete(key);
        }
        resolve(url);
      };
      const onUrl = (url: string) => finish(url);
      for (const key of keys) {
        const waiters = manifestTimedTextUrlWaiters.get(key) ?? new Set();
        waiters.add(onUrl);
        manifestTimedTextUrlWaiters.set(key, waiters);
      }
      timeout = window.setTimeout(() => finish(null), 100);
    });
  }

  function cacheTimedTextCues(key: string, cues: NetflixTimedTextCue[]): void {
    if (!cues.length) return;
    timedTextCueCache.delete(key);
    timedTextCueCache.set(key, cues);
    while (timedTextCueCache.size > 4)
      timedTextCueCache.delete(timedTextCueCache.keys().next().value!);
  }

  function getTimedTextIds(track: Record<string, unknown>): string[] {
    return [
      track.new_track_id,
      track.trackId,
      track.track_id,
      track.id,
    ].flatMap((value) => (value == null ? [] : [String(value)]));
  }

  function getDownloadUrl(value: unknown): string | null {
    if (typeof value === "string" && value.length <= 8192) return value;
    if (!isRecord(value)) return null;
    for (const candidate of [value.url, value.cdnUrl]) {
      if (typeof candidate === "string" && candidate.length <= 8192)
        return candidate;
    }
    return null;
  }

  function rememberTimedTextManifest(
    value: unknown,
    depth = 0,
    scope: string | null = null,
  ): void {
    if (depth > 8 || !isRecord(value)) return;
    for (const field of ["timedtexttracks", "textTracks"]) {
      const tracks = value[field];
      if (!Array.isArray(tracks)) continue;
      for (const track of tracks) {
        if (!isRecord(track)) continue;
        const downloadablesValue = track.ttDownloadables ?? track.downloadables;
        const trackIds = getTimedTextIds(track);
        const language = [track.bcp47, track.language]
          .find((item): item is string => typeof item === "string" && !!item)
          ?.toLowerCase();
        if (!trackIds.length || !isRecord(downloadablesValue)) continue;
        const downloadables = downloadablesValue;
        const profiles = Object.entries(downloadables)
          .filter(([, profile]) => isRecord(profile))
          .map(([name, profile]) => ({
            name,
            profile: profile as Record<string, unknown>,
          }));
        const preferred =
          profiles.find(({ name }) => name === WEBVTT_PROFILE) ??
          profiles.find(({ name }) => name === "dfxp-ls-sdh") ??
          profiles.find(({ name }) => name === "dfxp-ls") ??
          profiles.find(({ profile }) => profile.downloadUrls) ??
          profiles.find(({ profile }) => Array.isArray(profile.urls)) ??
          profiles[0];
        if (!preferred) continue;
        const candidates = [
          ...(isRecord(preferred.profile.downloadUrls)
            ? Object.values(preferred.profile.downloadUrls)
            : []),
          ...(Array.isArray(preferred.profile.urls)
            ? preferred.profile.urls
            : []),
          preferred.profile.url,
          preferred.profile.cdnUrl,
        ];
        const urlValue = candidates.map(getDownloadUrl).find(Boolean);
        if (urlValue && scope)
          for (const trackId of trackIds)
            cacheTimedTextUrl(
              manifestTimedTextUrls,
              scopedCacheKey(scope, trackId),
              urlValue,
            );
        if (urlValue && language && scope)
          cacheTimedTextUrl(
            manifestTimedTextUrlsByLanguage,
            scopedCacheKey(scope, language),
            urlValue,
          );
      }
    }
    for (const child of Object.values(value)) {
      if (isRecord(child)) rememberTimedTextManifest(child, depth + 1, scope);
      else if (Array.isArray(child))
        for (const item of child)
          rememberTimedTextManifest(item, depth + 1, scope);
    }
  }

  const nativeJsonStringify = JSON.stringify;
  const hookedJsonStringify = function (
    this: typeof JSON,
    value: unknown,
    replacer?: unknown,
    space?: string | number,
  ): string | undefined {
    try {
      const profiles = isRecord(value)
        ? isRecord(value.params)
          ? value.params.profiles
          : undefined
        : undefined;
      if (
        Array.isArray(profiles) &&
        profiles.some(
          (profile) =>
            typeof profile === "string" &&
            /^(heaac|playready|dfxp|simplesdh|imsc)/.test(profile),
        ) &&
        !profiles.includes(WEBVTT_PROFILE)
      )
        profiles.push(WEBVTT_PROFILE);
    } catch {}
    return (
      nativeJsonStringify as unknown as (
        ...args: unknown[]
      ) => string | undefined
    ).call(this, value, replacer, space);
  };
  JSON.stringify = hookedJsonStringify as typeof JSON.stringify;

  const nativeJsonParse = JSON.parse;
  JSON.parse = function (text, reviver) {
    const result = nativeJsonParse.call(this, text, reviver);
    if (
      typeof text === "string" &&
      !text.includes('"timedtexttracks"') &&
      !text.includes('"textTracks"') &&
      !text.includes("\\u")
    )
      return result;
    const session = getActivePlayerSession();
    const scope = session ? getTimedTextCacheScope(session.sessionId) : null;
    rememberTimedTextManifest(result, 0, scope);
    return result;
  };

  function getActivePlayer(): NetflixPlayer | null {
    return getActivePlayerSession()?.player ?? null;
  }

  function getActivePlayerSession(moviePath?: string): {
    player: NetflixPlayer;
    sessionId: string;
  } | null {
    try {
      const netflix = (window as Window & { netflix?: NetflixApp }).netflix;
      const playerApp = netflix?.appContext?.state?.playerApp;
      const videoPlayer = playerApp?.getAPI?.()?.videoPlayer;
      if (!videoPlayer) return null;

      const players = videoPlayer
        .getAllPlayerSessionIds()
        .flatMap((sessionId) => {
          const player = videoPlayer.getVideoPlayerBySessionId(sessionId);
          return player && typeof player.seek === "function"
            ? [{ player, sessionId }]
            : [];
        });
      const matchingPlayers = moviePath
        ? players.filter(
            ({ player }) => `/watch/${player.getMovieId?.()}` === moviePath,
          )
        : players;
      const readyPlayers = matchingPlayers.filter(({ player }) =>
        isReady(player),
      );
      const candidates =
        readyPlayers.length > 0 ? readyPlayers : matchingPlayers;
      return (
        candidates.find(({ player }) => isPlaying(player)) ??
        candidates[0] ??
        null
      );
    } catch {
      return null;
    }
  }

  function getTimedTextUrls(sessionId: string): Map<string, string> {
    const urls = new Map<string, string>();
    try {
      const root = getPlayerRepositoryRoot(sessionId);
      if (!isRecord(root)) return urls;

      const seen = new WeakSet<object>();
      const pending: { value: unknown; depth: number; path: string }[] = [
        { value: root, depth: 0, path: "playersById[session]" },
      ];
      while (pending.length) {
        const item = pending.pop();
        if (!item || item.depth > 20 || !isRecord(item.value)) continue;
        if (seen.has(item.value)) continue;
        seen.add(item.value);
        const trackId =
          item.value.trackId ??
          item.value.track_id ??
          item.value.new_track_id ??
          item.value.id;
        if (trackId != null) {
          const candidates = [
            ...(Array.isArray(item.value.urls) ? item.value.urls : []),
            item.value.url,
            item.value.downloadUrl,
            item.value.ttmlUrl,
          ];
          const url = candidates.find((entry) => {
            const value = isRecord(entry) ? entry.url : entry;
            return typeof value === "string" && value.length <= 8192;
          });
          const value = isRecord(url) ? url.url : url;
          if (typeof value === "string") urls.set(String(trackId), value);
        }
        for (const value of Object.values(item.value))
          if (isRecord(value))
            pending.push({
              value,
              depth: item.depth + 1,
              path: `${item.path}.*`,
            });
          else if (Array.isArray(value))
            for (const [index, entry] of value.entries())
              if (isRecord(entry))
                pending.push({
                  value: entry,
                  depth: item.depth + 1,
                  path: `${item.path}.*[${index}]`,
                });
      }
    } catch {}
    return urls;
  }

  function parseTime(value: unknown): number | null {
    if (typeof value !== "string") return null;
    const text = value.trim();
    if (!text) return null;
    const unit = text.match(/^(-?[\d.]+)(h|m|ms|s|f|t)$/i);
    if (unit) {
      const number = Number(unit[1]);
      const unitName = unit[2]!.toLowerCase();
      if (!Number.isFinite(number)) return null;
      const divisor =
        unitName === "h"
          ? 3600
          : unitName === "m"
            ? 60
            : unitName === "ms"
              ? 1 / 1000
              : 1;
      return unitName === "f"
        ? number / 30
        : unitName === "t"
          ? number / 10_000_000
          : number * divisor;
    }
    const parts = text.split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return null;
    if (parts.length === 4)
      return parts[0]! * 3600 + parts[1]! * 60 + parts[2]! + parts[3]! / 30;
    if (parts.length === 3)
      return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
    if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
    return Number.isFinite(Number(text)) ? Number(text) : null;
  }

  function parseTimedTextNumber(value: unknown): number | null {
    if (typeof value === "number")
      return Number.isFinite(value) ? value / 1000 : null;
    return parseTime(value);
  }

  function parseTtmlTime(value: string | null): number | null {
    if (!value) return null;
    const text = value.trim();
    if (/^-?\d+$/.test(text)) {
      const number = Number(text);
      return Number.isFinite(number) ? number / 10_000_000 : null;
    }
    return parseTime(text);
  }

  function cleanSubtitleText(value: string): string {
    subtitleEntityDecoder.innerHTML = value;
    return subtitleEntityDecoder.value
      .replace(
        /[\u200b\u200e\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g,
        "",
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  function getJsonCueText(value: unknown): string {
    if (typeof value === "string") return value;
    if (Array.isArray(value))
      return value.map(getJsonCueText).filter(Boolean).join(" ");
    if (!isRecord(value)) return "";
    return typeof value.c === "string"
      ? value.c
      : Array.isArray(value.c)
        ? getJsonCueText(value.c)
        : "";
  }

  function parseJsonSubtitleCues(text: string): NetflixTimedTextParseResult {
    try {
      const data: unknown = JSON.parse(text);
      if (!isRecord(data) || !Array.isArray(data.events))
        return { cues: [], parsed: false };
      const cues = data.events.flatMap((e) => {
        if (!isRecord(e)) return [];
        const from = parseTimedTextNumber(e.t);
        const duration = parseTimedTextNumber(e.d);
        const content = cleanSubtitleText(getJsonCueText(e.c));
        return from !== null && duration !== null && duration > 0 && content
          ? [{ from, to: from + duration, content }]
          : [];
      });
      return { cues, parsed: data.events.length === 0 || cues.length > 0 };
    } catch {
      return { cues: [], parsed: false };
    }
  }

  function parseSubtitleCues(text: string): NetflixTimedTextParseResult {
    const jsonCues = parseJsonSubtitleCues(text);
    if (jsonCues.parsed) return jsonCues;
    try {
      const xml = new DOMParser().parseFromString(text, "text/xml");
      const cueElements = [
        ...Array.from(xml.getElementsByTagName("p")),
        ...Array.from(xml.getElementsByTagNameNS("*", "p")),
      ].filter((cue, i, elements) => elements.indexOf(cue) === i);
      const seenCues = new Set<string>();
      const cues = cueElements.flatMap((cue) => {
        const from = parseTtmlTime(cue.getAttribute("begin"));
        const end = parseTtmlTime(cue.getAttribute("end"));
        const duration = parseTtmlTime(cue.getAttribute("dur"));
        const to =
          end ?? (from !== null && duration !== null ? from + duration : null);
        const content = cleanSubtitleText(cue.textContent ?? "");
        if (from === null || to === null || to <= from || !content) return [];
        const key = `${from}\u0000${to}\u0000${content}`;
        if (seenCues.has(key)) return [];
        seenCues.add(key);
        return [{ from, to, content }];
      });
      if (cueElements.length > 0) return { cues, parsed: cues.length > 0 };
    } catch {}

    const vttCues: NetflixTimedTextCue[] = [];
    const isWebVtt = /^\uFEFF?WEBVTT(?:\s|$)/i.test(text);
    const lines = text.replace(/^\uFEFF?WEBVTT[^\r\n]*/i, "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index++) {
      const timing = lines[index]?.match(/^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/);
      if (!timing) continue;
      const from = parseTime(timing[1]);
      const to = parseTime(timing[2]);
      if (from === null || to === null || to <= from) continue;
      const content: string[] = [];
      for (index++; index < lines.length && lines[index]?.trim(); index++)
        content.push(lines[index]!.replace(/<[^>]*>/g, ""));
      const value = cleanSubtitleText(content.join(" "));
      if (value) vttCues.push({ from, to, content: value });
    }
    return { cues: vttCues, parsed: isWebVtt };
  }

  interface NetflixTimedTextParseResult {
    cues: NetflixTimedTextCue[];
    parsed: boolean;
  }

  interface NetflixTimedTextCueResult {
    cues: NetflixTimedTextCue[];
    loaded: boolean;
    restored: boolean;
  }

  let activeTemporaryRestore: {
    player: NetflixPlayer;
    previous: Record<string, unknown>;
    temporary: Record<string, unknown>;
  } | null = null;

  async function getTimedTextCues(
    key: string,
    requestGeneration: number,
  ): Promise<NetflixTimedTextCueResult> {
    const session = getActivePlayerSession();
    if (!session) return { cues: [], loaded: false, restored: false };
    const tracks = getTimedTextTracks(session.player);
    const track = tracks.find((item, i) => getTrackKey(item, i) === key);
    if (!track) return { cues: [], loaded: false, restored: false };
    const cacheScope = getTimedTextCacheScope(session.sessionId);
    const cueCacheKey = scopedCacheKey(cacheScope, key);
    const cachedCues = timedTextCueCache.get(cueCacheKey);
    if (cachedCues) {
      timedTextCueCache.delete(cueCacheKey);
      timedTextCueCache.set(cueCacheKey, cachedCues);
      return { cues: cachedCues, loaded: true, restored: true };
    }
    const trackIds = getTimedTextIds(track);
    const languages = [track.bcp47, track.language]
      .filter((item): item is string => typeof item === "string" && !!item)
      .map((item) => item.toLowerCase());
    const findUrl = () => {
      const repositoryUrls = getTimedTextUrls(session.sessionId);
      return (
        trackIds
          .map(
            (trackId) =>
              manifestTimedTextUrls.get(scopedCacheKey(cacheScope, trackId)) ??
              repositoryUrls.get(trackId),
          )
          .find(Boolean) ??
        languages
          .map((language) =>
            manifestTimedTextUrlsByLanguage.get(
              scopedCacheKey(cacheScope, language),
            ),
          )
          .find(Boolean)
      );
    };
    let url = findUrl();
    const current = session.player.getTimedTextTrack?.();
    if (
      activeTemporaryRestore &&
      (activeTemporaryRestore.player !== session.player ||
        !isRecord(current) ||
        !sameTrack(activeTemporaryRestore.temporary, current))
    )
      activeTemporaryRestore = null;
    const previous =
      activeTemporaryRestore?.player === session.player
        ? activeTemporaryRestore.previous
        : current;
    let changed = false;
    let restored = true;
    let loaded = false;
    let cues: NetflixTimedTextCue[] = [];
    try {
      if (requestGeneration !== subtitleCueRequestGeneration) {
        restored = false;
      } else if (
        !url &&
        typeof session.player.setTimedTextTrack === "function"
      ) {
        if (!isRecord(previous) || !sameTrack(track, previous)) {
          await Promise.resolve(session.player.setTimedTextTrack(track));
          changed = true;
          if (!activeTemporaryRestore) {
            if (isRecord(previous))
              activeTemporaryRestore = {
                player: session.player,
                previous,
                temporary: track,
              };
            else restored = false;
          }
        }
        for (let attempt = 0; attempt < 30 && !url; attempt++) {
          if (requestGeneration !== subtitleCueRequestGeneration) {
            restored = false;
            break;
          }
          url = findUrl();
          if (url) break;
          const notifiedUrl = await waitForManifestTimedTextUrl(
            cacheScope,
            trackIds,
            languages,
          );
          if (notifiedUrl) url = notifiedUrl;
        }
      }
      if (restored && url) {
        const response = await fetch(url);
        if (!response.ok) restored = false;
        else {
          const text = await response.text();
          const parsed = parseSubtitleCues(text);
          if (!parsed.parsed) restored = false;
          else {
            cues = parsed.cues;
            loaded = true;
          }
        }
      } else if (!url) {
        restored = false;
      }
    } catch {
      loaded = false;
      cues = [];
      restored = false;
    } finally {
      if (changed) {
        try {
          if (isRecord(previous))
            restored = await restoreTimedTextTrack(
              session.player,
              previous,
              track,
            );
          else restored = false;
        } catch {}
        if (restored && activeTemporaryRestore?.player === session.player)
          activeTemporaryRestore = null;
        syncNetflixSubtitleTracks(session.player);
      }
    }
    if (loaded && cacheScope === timedTextCacheScope)
      cacheTimedTextCues(cueCacheKey, cues);
    return { cues, loaded, restored };
  }

  async function restoreTimedTextTrack(
    player: NetflixPlayer,
    previous: Record<string, unknown>,
    temporary: Record<string, unknown>,
  ): Promise<boolean> {
    for (let attempt = 0; attempt < 20; attempt++) {
      const current = player.getTimedTextTrack?.();
      if (isRecord(current) && sameTrack(previous, current)) return true;
      if (isRecord(current) && !sameTrack(temporary, current)) return true;
      await Promise.resolve(player.setTimedTextTrack?.(previous));
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const current = player.getTimedTextTrack?.();
    return isRecord(current) && sameTrack(previous, current);
  }

  function getTimedTextTracks(
    player: NetflixPlayer,
  ): Record<string, unknown>[] {
    try {
      const tracks = player.getTimedTextTrackList?.();
      return Array.isArray(tracks) ? tracks.filter(isRecord) : [];
    } catch {
      return [];
    }
  }

  function getTrackKey(track: Record<string, unknown>, i: number): string {
    const id =
      track.trackId ?? track.track_id ?? track.new_track_id ?? track.id;
    return id == null ? `index:${i}` : String(id);
  }

  function trackLabel(track: Record<string, unknown>): string {
    for (const value of [
      track.displayName,
      track.languageDescription,
      track.label,
      track.bcp47,
      track.language,
    ])
      if (typeof value === "string" && value.trim()) return value.trim();
    return "";
  }

  function sameTrack(
    track: Record<string, unknown>,
    current: Record<string, unknown> | null,
  ): boolean {
    if (!current) return false;
    if (track === current) return true;

    const trackId =
      track.trackId ?? track.track_id ?? track.new_track_id ?? track.id;
    const currentId =
      current.trackId ?? current.track_id ?? current.new_track_id ?? current.id;
    if (trackId != null && currentId != null)
      return String(trackId) === String(currentId);

    const language = track.bcp47 ?? track.language;
    const currentLanguage = current.bcp47 ?? current.language;
    const label = track.displayName ?? track.languageDescription;
    const currentLabel = current.displayName ?? current.languageDescription;
    return (
      typeof language === "string" &&
      language === currentLanguage &&
      typeof label === "string" &&
      label === currentLabel
    );
  }

  function syncNetflixSubtitleTracks(
    player = getActivePlayer(),
    requestId = lastSubtitleTrackRequestId,
  ) {
    const session = getActivePlayerSession();
    const videoIdentity =
      session?.player === player ? getVideoIdentity(session.sessionId) : "";
    let tracks: Record<string, unknown>[] = [];
    let current: Record<string, unknown> | null = null;
    let subtitlesEnabled: boolean | null = null;
    if (player) {
      tracks = getTimedTextTracks(player);
      if (typeof player.getTimedTextTrack === "function") {
        try {
          const selected = player.getTimedTextTrack();
          if (isRecord(selected)) current = selected;
          subtitlesEnabled = Boolean(current && current.isNoneTrack !== true);
        } catch {}
      }
    }
    const trackOptions = tracks.flatMap((track, i) =>
      track.isNoneTrack
        ? []
        : [
            {
              key: getTrackKey(track, i),
              index: i,
              label: trackLabel(track),
              language:
                typeof (track.bcp47 ?? track.language) === "string"
                  ? String(track.bcp47 ?? track.language)
                  : "",
              selected: sameTrack(track, current),
            },
          ],
    );
    if (player && videoIdentity && trackOptions.length > 0) {
      lastValidSubtitleTrackState = {
        player,
        videoIdentity,
        tracks: trackOptions,
        subtitlesEnabled,
      };
    }
    const state =
      trackOptions.length === 0 &&
      lastValidSubtitleTrackState &&
      player &&
      lastValidSubtitleTrackState.player === player &&
      lastValidSubtitleTrackState.videoIdentity === videoIdentity
        ? lastValidSubtitleTrackState
        : { tracks: trackOptions, subtitlesEnabled };
    window.postMessage(
      {
        type: "PIP_NETFLIX_SUBTITLE_TRACKS",
        requestId,
        videoIdentity,
        subtitlesEnabled: state.subtitlesEnabled,
        tracks: state.tracks,
      },
      location.origin,
    );
  }

  let subtitleSelectionGeneration = 0;
  let timedTextCueOperation: Promise<void> = Promise.resolve();
  let lastSubtitleTrackRequestId = 0;
  let lastValidSubtitleTrackState: {
    player: NetflixPlayer;
    videoIdentity: string;
    tracks: {
      key: string;
      index: number;
      label: string;
      language: string;
      selected: boolean;
    }[];
    subtitlesEnabled: boolean | null;
  } | null = null;
  let lastFailure = "";
  window.addEventListener("message", (e) => {
    const data = e.data;
    if (e.source !== window || e.origin !== location.origin || !isRecord(data))
      return;

    if (data.type === "PIP_REQUEST_NETFLIX_SUBTITLE_TRACKS") {
      const requestId = data.requestId;
      if (
        typeof requestId !== "number" ||
        !Number.isSafeInteger(requestId) ||
        requestId < 1
      )
        return;
      lastSubtitleTrackRequestId = requestId;
      syncNetflixSubtitleTracks();
      return;
    }

    if (data.type === "PIP_SELECT_NETFLIX_SUBTITLE_TRACK") {
      if (typeof data.key !== "string") return;
      const generation = ++subtitleSelectionGeneration;
      ++subtitleCueRequestGeneration;
      void (async () => {
        const player = getActivePlayer();
        if (!player || typeof player.setTimedTextTrack !== "function") return;
        const tracks = getTimedTextTracks(player);
        const track = tracks.find(
          (item, i) => getTrackKey(item, i) === data.key,
        );
        if (!track) return;
        try {
          void Promise.resolve(player.setTimedTextTrack(track)).catch(() => {});
          for (let attempt = 0; attempt < 30; attempt++) {
            if (generation !== subtitleSelectionGeneration) return;
            const current = player.getTimedTextTrack?.();
            if (isRecord(current) && sameTrack(track, current)) break;
            await new Promise((resolve) => setTimeout(resolve, 50));
          }
        } catch {}
        if (generation === subtitleSelectionGeneration)
          syncNetflixSubtitleTracks(player);
      })();
      return;
    }

    if (data.type === "PIP_REQUEST_NETFLIX_SUBTITLE_CUES") {
      if (typeof data.key !== "string" || typeof data.requestId !== "number")
        return;
      const requestGeneration = ++subtitleCueRequestGeneration;
      timedTextCueOperation = timedTextCueOperation
        .catch(() => {})
        .then(async () => {
          const result = await getTimedTextCues(
            data.key as string,
            requestGeneration,
          );
          window.postMessage(
            {
              type: "PIP_NETFLIX_SUBTITLE_CUES",
              requestId: data.requestId,
              key: data.key,
              cues: result.cues,
              loaded: result.loaded,
              restored: result.restored,
            },
            location.origin,
          );
        });
      return;
    }

    if (data.type !== "PIP_NETFLIX_SEEK") return;
    const targetSeconds = data.targetSeconds;
    if (
      typeof targetSeconds !== "number" ||
      !Number.isFinite(targetSeconds) ||
      targetSeconds < 0
    )
      return;

    try {
      const player = getActivePlayer();
      if (!player)
        throw new Error("Netflix video player session was not found");
      player.seek(targetSeconds * 1000);
      lastFailure = "";
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Netflix seek failed";
      if (message !== lastFailure) lastFailure = message;
    }
  });
})();
