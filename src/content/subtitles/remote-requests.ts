"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleRemoteRequests = {
  create(options) {
    function createCueRequest(
      type: string,
      targetOrigin: string,
      throttleInitialRequest = false,
    ): SubtitleCueRequest {
      let trackKey = "";
      let cues: TimedSubtitleCue[] | null = null;
      let loadedTrack = "";
      let pendingTrack = "";
      let requestId = 0;
      let lastRequest = 0;
      return {
        get trackKey() {
          return trackKey;
        },
        get cues() {
          return cues;
        },
        get loadedTrack() {
          return loadedTrack;
        },
        get pendingTrack() {
          return pendingTrack;
        },
        reset(key = "", resetThrottle = true) {
          trackKey = key;
          cues = null;
          loadedTrack = "";
          pendingTrack = "";
          requestId++;
          if (resetThrottle) lastRequest = 0;
        },
        request() {
          const now = Date.now();
          if (
            !trackKey ||
            loadedTrack === trackKey ||
            pendingTrack === trackKey ||
            ((throttleInitialRequest || lastRequest > 0) &&
              now - lastRequest < 3000)
          )
            return;
          requestId++;
          pendingTrack = trackKey;
          lastRequest = now;
          window.postMessage({ type, requestId, key: trackKey }, targetOrigin);
        },
        matches(id, key) {
          return typeof id === "number" && id === requestId && key === trackKey;
        },
        complete(nextCues, loaded = Boolean(nextCues?.length)) {
          pendingTrack = "";
          cues = nextCues;
          loadedTrack = loaded ? trackKey : "";
        },
        retry() {
          pendingTrack = "";
          cues = null;
          loadedTrack = "";
          lastRequest = 0;
        },
      };
    }

    const youtubePrimary = createCueRequest(
      "PIP_REQUEST_YT_SUBTITLE_CUES",
      "*",
    );
    const youtubeSecondary = createCueRequest(
      "PIP_REQUEST_YT_SUBTITLE_CUES",
      "*",
    );
    const netflixSecondary = createCueRequest(
      "PIP_REQUEST_NETFLIX_SUBTITLE_CUES",
      location.origin,
      true,
    );
    const state: SubtitleRemoteRequestState = {
      youtubeTracks: [],
      lastYouTubeTrackRequest: 0,
      netflixTracks: [],
      netflixPrimaryTrackKey: "",
      netflixSecondaryCueRetryTimer: null,
      netflixSecondaryCueRetryCount: 0,
      lastNetflixTrackRequest: 0,
      netflixTrackRequestId: 0,
    };

    function requestYouTubeTracks() {
      if (
        !options.isYouTube ||
        Date.now() - state.lastYouTubeTrackRequest < 2000
      )
        return;
      state.lastYouTubeTrackRequest = Date.now();
      window.postMessage({ type: "PIP_REQUEST_YT_SUBTITLE_TRACKS" }, "*");
    }

    function updateYouTubePrimaryTrackKey() {
      const key =
        state.youtubeTracks.find((track) => track.selected)?.key ?? "";
      if (key !== youtubePrimary.trackKey) youtubePrimary.reset(key);
      return key;
    }

    function requestYouTubePrimaryCues() {
      const track = state.youtubeTracks.find((item) => item.selected);
      updateYouTubePrimaryTrackKey();
      if (options.isYouTube && track?.canLoadCues) youtubePrimary.request();
    }

    function requestYouTubeSecondaryCues() {
      if (options.isYouTube) youtubeSecondary.request();
    }

    function requestNetflixTracks(force = false) {
      if (
        !options.isNetflix ||
        (!force && Date.now() - state.lastNetflixTrackRequest < 2000)
      )
        return;
      state.lastNetflixTrackRequest = Date.now();
      const requestId = ++state.netflixTrackRequestId;
      window.postMessage(
        { type: "PIP_REQUEST_NETFLIX_SUBTITLE_TRACKS", requestId },
        location.origin,
      );
    }

    function requestNetflixSecondaryCues() {
      if (options.isNetflix) netflixSecondary.request();
    }

    function isNetflixSecondaryActive() {
      if (!options.isNetflix || !netflixSecondary.trackKey) return false;
      const selectedKey = state.netflixTracks.find(
        (track) => track.selected,
      )?.key;
      return (
        selectedKey === netflixSecondary.trackKey ||
        netflixSecondary.pendingTrack === netflixSecondary.trackKey ||
        state.netflixSecondaryCueRetryTimer !== null
      );
    }

    function reset() {
      state.youtubeTracks = [];
      state.lastYouTubeTrackRequest = 0;
      youtubePrimary.reset();
      youtubeSecondary.reset();
      state.netflixTracks = [];
      state.netflixPrimaryTrackKey = "";
      netflixSecondary.reset();
      if (state.netflixSecondaryCueRetryTimer !== null) {
        window.clearTimeout(state.netflixSecondaryCueRetryTimer);
        state.netflixSecondaryCueRetryTimer = null;
      }
      state.netflixSecondaryCueRetryCount = 0;
      state.lastNetflixTrackRequest = 0;
      state.netflixTrackRequestId++;
    }

    return {
      state,
      youtubePrimary,
      youtubeSecondary,
      netflixSecondary,
      requestYouTubeTracks,
      updateYouTubePrimaryTrackKey,
      requestYouTubePrimaryCues,
      requestYouTubeSecondaryCues,
      requestNetflixTracks,
      requestNetflixSecondaryCues,
      isNetflixSecondaryActive,
      reset,
    };
  },
};
