"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleRemoteRequests = {
  create(options) {
    const state: SubtitleRemoteRequestState = {
      youtubeTracks: [],
      lastYouTubeTrackRequest: 0,
      youtubePrimaryTrackKey: "",
      youtubePrimaryCues: null,
      youtubePrimaryCueLoadedTrack: "",
      youtubePrimaryCuePendingTrack: "",
      youtubePrimaryCueRequestId: 0,
      lastYouTubePrimaryCueRequest: 0,
      youtubeSecondaryTrackKey: "",
      youtubeSecondaryCues: null,
      youtubeSecondaryCueLoadedTrack: "",
      youtubeSecondaryCuePendingTrack: "",
      youtubeSecondaryCueRequestId: 0,
      lastYouTubeSecondaryCueRequest: 0,
      netflixTracks: [],
      netflixPrimaryTrackKey: "",
      netflixSecondaryTrackKey: "",
      netflixSecondaryCues: null,
      netflixSecondaryCueLoadedTrack: "",
      netflixSecondaryCuePendingTrack: "",
      netflixSecondaryCueRequestId: 0,
      lastNetflixSecondaryCueRequest: 0,
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
      if (key === state.youtubePrimaryTrackKey) return key;
      state.youtubePrimaryTrackKey = key;
      state.youtubePrimaryCues = null;
      state.youtubePrimaryCueLoadedTrack = "";
      state.youtubePrimaryCuePendingTrack = "";
      state.youtubePrimaryCueRequestId++;
      state.lastYouTubePrimaryCueRequest = 0;
      return key;
    }

    function requestYouTubePrimaryCues() {
      const track = state.youtubeTracks.find((item) => item.selected);
      const key = updateYouTubePrimaryTrackKey();
      if (
        !options.isYouTube ||
        !key ||
        !track?.canLoadCues ||
        state.youtubePrimaryCueLoadedTrack === key ||
        state.youtubePrimaryCuePendingTrack === key ||
        (state.lastYouTubePrimaryCueRequest > 0 &&
          Date.now() - state.lastYouTubePrimaryCueRequest < 3000)
      )
        return;
      const requestId = ++state.youtubePrimaryCueRequestId;
      state.youtubePrimaryCuePendingTrack = key;
      state.lastYouTubePrimaryCueRequest = Date.now();
      window.postMessage(
        { type: "PIP_REQUEST_YT_SUBTITLE_CUES", requestId, key },
        "*",
      );
    }

    function requestYouTubeSecondaryCues() {
      const key = state.youtubeSecondaryTrackKey;
      if (
        !options.isYouTube ||
        !key ||
        state.youtubeSecondaryCueLoadedTrack === key ||
        state.youtubeSecondaryCuePendingTrack === key ||
        (state.lastYouTubeSecondaryCueRequest > 0 &&
          Date.now() - state.lastYouTubeSecondaryCueRequest < 3000)
      )
        return;
      const requestId = ++state.youtubeSecondaryCueRequestId;
      state.youtubeSecondaryCuePendingTrack = key;
      state.lastYouTubeSecondaryCueRequest = Date.now();
      window.postMessage(
        { type: "PIP_REQUEST_YT_SUBTITLE_CUES", requestId, key },
        "*",
      );
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
      const key = state.netflixSecondaryTrackKey;
      if (
        !options.isNetflix ||
        !key ||
        state.netflixSecondaryCueLoadedTrack === key ||
        state.netflixSecondaryCuePendingTrack === key ||
        Date.now() - state.lastNetflixSecondaryCueRequest < 3000
      )
        return;
      const requestId = ++state.netflixSecondaryCueRequestId;
      state.netflixSecondaryCuePendingTrack = key;
      state.lastNetflixSecondaryCueRequest = Date.now();
      window.postMessage(
        { type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES", requestId, key },
        location.origin,
      );
    }

    function isNetflixSecondaryActive() {
      if (!options.isNetflix || !state.netflixSecondaryTrackKey) return false;
      const selectedKey = state.netflixTracks.find(
        (track) => track.selected,
      )?.key;
      return (
        selectedKey === state.netflixSecondaryTrackKey ||
        state.netflixSecondaryCuePendingTrack ===
          state.netflixSecondaryTrackKey ||
        state.netflixSecondaryCueRetryTimer !== null
      );
    }

    function reset() {
      state.youtubeTracks = [];
      state.lastYouTubeTrackRequest = 0;
      state.youtubePrimaryTrackKey = "";
      state.youtubePrimaryCues = null;
      state.youtubePrimaryCueLoadedTrack = "";
      state.youtubePrimaryCuePendingTrack = "";
      state.youtubePrimaryCueRequestId++;
      state.lastYouTubePrimaryCueRequest = 0;
      state.youtubeSecondaryTrackKey = "";
      state.youtubeSecondaryCues = null;
      state.youtubeSecondaryCueLoadedTrack = "";
      state.youtubeSecondaryCuePendingTrack = "";
      state.youtubeSecondaryCueRequestId++;
      state.lastYouTubeSecondaryCueRequest = 0;
      state.netflixTracks = [];
      state.netflixPrimaryTrackKey = "";
      state.netflixSecondaryTrackKey = "";
      state.netflixSecondaryCues = null;
      state.netflixSecondaryCueLoadedTrack = "";
      state.netflixSecondaryCuePendingTrack = "";
      state.netflixSecondaryCueRequestId++;
      if (state.netflixSecondaryCueRetryTimer !== null) {
        window.clearTimeout(state.netflixSecondaryCueRetryTimer);
        state.netflixSecondaryCueRetryTimer = null;
      }
      state.netflixSecondaryCueRetryCount = 0;
      state.lastNetflixSecondaryCueRequest = 0;
      state.lastNetflixTrackRequest = 0;
      state.netflixTrackRequestId++;
    }

    return {
      state,
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
