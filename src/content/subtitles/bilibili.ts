"use strict";

const bilibiliSubtitles = (() => {
  interface Options {
    onVideoChange(): void;
    onTracksChanged(): void;
    onCuesChanged(): void;
    onFailure(): void;
  }

  function create(options: Options) {
    let tracks: {
      key: string;
      label: string;
      language: string;
      subtitleUrl: string;
      isAi: boolean;
    }[] = [];
    let primaryKey = "";
    let secondaryKey = "";
    let primaryCues: TimedSubtitleCue[] | null = null;
    let secondaryCues: TimedSubtitleCue[] | null = null;
    let videoKey = "";
    let trackRequestId = 0;
    let trackRequestPending = false;
    let tracksLoaded = false;
    let lastTrackRequest = 0;
    let cueRequestId = 0;
    let cuePendingTrack = "";
    let cueLoadedTrack = "";
    let secondaryCueRequestId = 0;
    let secondaryCuePendingTrack = "";
    let secondaryCueLoadedTrack = "";
    window.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        event.origin !== location.origin ||
        !globalThis.PipCompanion.util.isRecord(event.data) ||
        event.data.type !== "PIP_BILI_SUBTITLE_TRACKS" ||
        typeof event.data.requestId !== "number" ||
        event.data.requestId !== trackRequestId ||
        typeof event.data.ok !== "boolean"
      )
        return;

      trackRequestPending = false;
      if (!event.data.ok || !Array.isArray(event.data.tracks)) return;
      tracks = event.data.tracks.flatMap((track) => {
        if (
          !globalThis.PipCompanion.util.isRecord(track) ||
          typeof track.key !== "string" ||
          track.key.length > 200 ||
          typeof track.label !== "string" ||
          track.label.length > 200 ||
          typeof track.language !== "string" ||
          track.language.length > 50 ||
          typeof track.subtitleUrl !== "string" ||
          track.subtitleUrl.length > 8192 ||
          typeof track.isAi !== "boolean"
        )
          return [];
        try {
          const url = new URL(track.subtitleUrl, location.href);
          if (
            url.protocol !== "https:" ||
            url.hostname !== "aisubtitle.hdslb.com"
          )
            return [];
          return [
            {
              key: track.key,
              label: track.label,
              language: track.language,
              subtitleUrl: url.href,
              isAi: track.isAi,
            },
          ];
        } catch {
          return [];
        }
      });
      tracksLoaded = true;
      if (!tracks.some((track) => track.key === primaryKey))
        primaryKey = globalThis.PipCompanion.standardTextTrack.getTracks(
          state.sourceVideo,
        ).length
          ? ""
          : (tracks.find((track) => !track.isAi)?.key ?? tracks[0]?.key ?? "");
      if (
        secondaryKey &&
        (secondaryKey === primaryKey ||
          !tracks.some((track) => track.key === secondaryKey))
      )
        clearSecondary();
      options.onTracksChanged();
    });

    function requestTracks() {
      if (!IS_BILIBILI || !state.pipUi) return;
      const video = state.sourceVideo;
      const nextVideoKey = video?.currentSrc || video?.src || "";
      if (!nextVideoKey) return;
      if (nextVideoKey !== videoKey) {
        reset();
        videoKey = nextVideoKey;
        options.onVideoChange();
      }
      if (
        tracksLoaded ||
        trackRequestPending ||
        Date.now() - lastTrackRequest < 3000
      )
        return;

      lastTrackRequest = Date.now();
      trackRequestPending = true;
      trackRequestId++;
      window.postMessage(
        {
          type: "PIP_REQUEST_BILI_SUBTITLE_TRACKS",
          requestId: trackRequestId,
        },
        location.origin,
      );
    }

    function loadTrack(trackKey: string, secondary = false) {
      if (!IS_BILIBILI || !state.pipUi || !trackKey) return;
      const track = tracks.find((item) => item.key === trackKey);
      const loadedTrack = secondary ? secondaryCueLoadedTrack : cueLoadedTrack;
      const pendingTrack = secondary
        ? secondaryCuePendingTrack
        : cuePendingTrack;
      if (!track || loadedTrack === track.key || pendingTrack === track.key)
        return;

      const requestId = secondary ? ++secondaryCueRequestId : ++cueRequestId;
      const requestVideoKey = videoKey;
      if (secondary) secondaryCuePendingTrack = track.key;
      else cuePendingTrack = track.key;
      void chrome.runtime
        .sendMessage({
          type: "GET_BILIBILI_SUBTITLE_CUES",
          url: track.subtitleUrl,
        } satisfies ExtensionMessage)
        .then((response: unknown) => {
          const currentRequestId = secondary
            ? secondaryCueRequestId
            : cueRequestId;
          const selectedTrackKey = secondary ? secondaryKey : primaryKey;
          if (
            currentRequestId !== requestId ||
            videoKey !== requestVideoKey ||
            selectedTrackKey !== track.key
          )
            return;
          if (
            !globalThis.PipCompanion.util.isRecord(response) ||
            response.ok !== true ||
            !Array.isArray(response.cues)
          ) {
            if (secondary) secondaryCueLoadedTrack = track.key;
            else cueLoadedTrack = track.key;
            options.onFailure();
            return;
          }

          const cues = response.cues.filter(
            (cue): cue is TimedSubtitleCue =>
              globalThis.PipCompanion.util.isRecord(cue) &&
              typeof cue.from === "number" &&
              Number.isFinite(cue.from) &&
              typeof cue.to === "number" &&
              Number.isFinite(cue.to) &&
              cue.to > cue.from &&
              typeof cue.content === "string",
          );
          if (secondary) {
            secondaryCues = cues;
            secondaryCueLoadedTrack = track.key;
          } else {
            primaryCues = cues;
            cueLoadedTrack = track.key;
          }
          if (!cues.length) options.onFailure();
          options.onCuesChanged();
        })
        .catch(() => {
          const currentRequestId = secondary
            ? secondaryCueRequestId
            : cueRequestId;
          const selectedTrackKey = secondary ? secondaryKey : primaryKey;
          if (
            currentRequestId === requestId &&
            videoKey === requestVideoKey &&
            selectedTrackKey === track.key
          ) {
            if (secondary) secondaryCueLoadedTrack = track.key;
            else cueLoadedTrack = track.key;
            options.onFailure();
          }
        })
        .finally(() => {
          if (secondary && secondaryCueRequestId === requestId)
            secondaryCuePendingTrack = "";
          if (!secondary && cueRequestId === requestId) cuePendingTrack = "";
        });
    }

    function clearPrimary() {
      primaryKey = "";
      primaryCues = null;
      cueLoadedTrack = "";
      cuePendingTrack = "";
      cueRequestId++;
    }

    function clearSecondary() {
      secondaryKey = "";
      secondaryCues = null;
      secondaryCueLoadedTrack = "";
      secondaryCuePendingTrack = "";
      secondaryCueRequestId++;
    }

    function reset() {
      tracks = [];
      clearPrimary();
      clearSecondary();
      videoKey = "";
      trackRequestId++;
      trackRequestPending = false;
      tracksLoaded = false;
      lastTrackRequest = 0;
    }

    return {
      get tracks() {
        return tracks;
      },
      get primaryKey() {
        return primaryKey;
      },
      get secondaryKey() {
        return secondaryKey;
      },
      get primaryCues() {
        return primaryCues;
      },
      get secondaryCues() {
        return secondaryCueLoadedTrack === secondaryKey ? secondaryCues : null;
      },
      getNativeEnabled(): boolean | null {
        if (
          document.querySelector(
            ".bpx-player-ctrl-subtitle-close-switch.bpx-state-active",
          )
        )
          return false;
        if (
          document.querySelector(
            ".bpx-player-ctrl-subtitle-language-item.bpx-state-active",
          )
        )
          return true;
        return null;
      },
      requestTracks,
      loadTrack,
      clearPrimary,
      clearSecondary,
      reset,
      selectPrimary(key: string): boolean {
        if (!tracks.some((track) => track.key === key)) return false;
        clearPrimary();
        primaryKey = key;
        if (secondaryKey === key) clearSecondary();
        return true;
      },
      selectSecondary(key: string): boolean {
        if (key === primaryKey || !tracks.some((track) => track.key === key))
          return false;
        clearSecondary();
        secondaryKey = key;
        return true;
      },
    };
  }

  return { create };
})();

globalThis.PipCompanion.BilibiliSubtitles = bilibiliSubtitles;
