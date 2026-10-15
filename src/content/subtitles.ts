"use strict";

globalThis.PipCompanion.ContentSubtitles = (() => {
  const t = globalThis.PipCompanion.util.getMessage;
  const IS_NETFLIX = globalThis.PipCompanion.site.isNetflixHost(
    location.hostname,
  );
  const IS_HAHOW = globalThis.PipCompanion.site.isHahowHost(location.hostname);
  const standardTextTrack = globalThis.PipCompanion.standardTextTrack;
  const SUBTITLE_SCAN_MS = 2000;
  const SUBTITLE_OVERLAY_SCAN_MS = 100;
  const SUBTITLE_EMPTY_GRACE_MS = 80;
  const SUBTITLE_EMPTY_LIMIT = 10;
  const SUBTITLE_TRACK_SCAN_MS = 2000;
  const HAHOW_CAPTION_PULSE_MS = 100;
  const MIN_SUBTITLE_FIT_SCALE = 0.85;
  let selectedNativeTrack: TextTrack | null = null;
  let subtitleFitObserver: ResizeObserver | null = null;
  let subtitleFitObservedElement: HTMLElement | null = null;
  let subtitleFitObservedSubtitle: HTMLElement | null = null;
  let subtitleFitFrame: number | null = null;
  let subtitleFitPendingSubtitle: HTMLElement | null = null;
  let renderedSubtitleSignature: string | null = null;
  let renderedSubtitleElement: HTMLElement | null = null;
  let subtitleClockTimer: number | null = null;
  let subtitleEmptyTimer: number | null = null;
  let lastHahowCaptionPulse = 0;
  const nativeSecondaryTrack =
    globalThis.PipCompanion.NativeSecondarySubtitleTrack.create({
      rememberMode: (track) => {
        const changedTracks = (state.nativeSubtitleTracks ??= new Map());
        if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
      },
      onChange: renderSubtitle,
    });
  let subtitleRefreshPending = false;
  let subtitleEmptyCount = 0;
  const nativeTrackIds = new WeakMap<TextTrack, string>();
  let nextNativeTrackId = 0;
  let youtubeSubtitleTracks: {
    key: string;
    label: string;
    language: string;
    selected: boolean;
    canLoadCues: boolean;
  }[] = [];
  let lastYouTubeSubtitleRequest = 0;
  let youtubePrimarySubtitleTrackKey = "";
  let youtubePrimarySubtitleCues: TimedSubtitleCue[] | null = null;
  let youtubePrimaryCueLoadedTrack = "";
  let youtubePrimaryCuePendingTrack = "";
  let youtubePrimaryCueRequestId = 0;
  let lastYouTubePrimaryCueRequest = 0;
  let youtubeSecondarySubtitleTrackKey = "";
  let youtubeSecondarySubtitleCues: TimedSubtitleCue[] | null = null;
  let youtubeSecondaryCueLoadedTrack = "";
  let youtubeSecondaryCuePendingTrack = "";
  let youtubeSecondaryCueRequestId = 0;
  let lastYouTubeCueRequest = 0;
  let netflixSubtitleTracks: {
    key: string;
    index: number;
    label: string;
    language: string;
    selected: boolean;
  }[] = [];
  let netflixPrimarySubtitleTrackKey = "";
  let netflixSecondarySubtitleTrackKey = "";
  let netflixSecondarySubtitleCues: TimedSubtitleCue[] | null = null;
  let netflixSecondaryCueLoadedTrack = "";
  let netflixSecondaryCuePendingTrack = "";
  let netflixSecondaryCueRequestId = 0;
  let lastNetflixSecondaryCueRequest = 0;
  let netflixSecondaryCueRetryTimer: number | null = null;
  let netflixSecondaryCueRetryCount = 0;
  let subtitleInitializationPending = false;
  let lastNetflixSubtitleRequest = 0;
  let netflixSubtitleTrackRequestId = 0;
  const bilibiliSubtitles = globalThis.PipCompanion.BilibiliSubtitles.create({
    onVideoChange: () => {
      secondarySubtitleFailureShown = false;
      state.pipUi?.refreshSubtitleTracks();
    },
    onTracksChanged: () => {
      state.pipUi?.refreshSubtitleTracks();
      refreshSubtitle(true);
    },
    onCuesChanged: () => refreshSubtitle(true),
    onFailure: showSecondarySubtitleFailure,
  });
  let subtitleMediaKey = "";
  let subtitleSourceConfirmed = false;
  let subtitleTranslationSuspended = false;
  let youtubeSubtitleOffEnforcedForMedia = "";
  let subtitleEnabledOverride: {
    platform: string;
    enabled: boolean;
    nativeControl: boolean;
  } | null = null;
  let secondarySubtitleFailureShown = false;
  const subtitleTranslation =
    globalThis.PipCompanion.SubtitleTranslation.create({
      getPreferences: () => state.subtitleTranslationPreferences,
      isSubtitlesEnabled: () => state.subtitlessOn && Boolean(state.pipUi),
      isSubtitleTranslationSuspended: () => subtitleTranslationSuspended,
      isNativeSecondaryActive,
      getNativeSecondaryLines: getNativeSecondarySubtitleLines,
      hasSupportedTrack: () =>
        (IS_YOUTUBE && youtubeSubtitleTracks.some((track) => track.selected)) ||
        (IS_NETFLIX && netflixSubtitleTracks.some((track) => track.selected)) ||
        (IS_BILIBILI && Boolean(bilibiliSubtitles.primaryKey)) ||
        Boolean(
          selectedNativeTrack &&
          getSubtitleTracks().includes(selectedNativeTrack),
        ) ||
        Boolean(standardTextTrack.getSelectedTrack(state.sourceVideo, null)) ||
        Boolean(state.subtitleNode?.isConnected || findGenericSubtitleNode()),
      prefersNativeSubtitle: (targetLanguage) =>
        getNativeSubtitleTracks().some(
          (track) =>
            track.selected &&
            subtitleLanguagesMatch(track.language ?? "", targetLanguage),
        ),
      getPreferNativeSecondaryLines,
      showFeedback: (message) =>
        globalThis.PipCompanion.ContentFeedback.showFeedback(message),
      render: renderSubtitle,
    });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_YT_SUBTITLE_TRACKS" ||
      typeof event.data.videoId !== "string" ||
      event.data.videoId !== getCurrentYouTubeVideoId() ||
      !Array.isArray(event.data.tracks)
    )
      return;
    const previousPrimaryTrackKey = youtubePrimarySubtitleTrackKey;
    const previousSecondaryTrackKey = youtubeSecondarySubtitleTrackKey;
    youtubeSubtitleTracks = event.data.tracks.filter(
      (
        track,
      ): track is {
        key: string;
        label: string;
        language: string;
        selected: boolean;
        canLoadCues: boolean;
      } =>
        globalThis.PipCompanion.util.isRecord(track) &&
        typeof track.key === "string" &&
        typeof track.label === "string" &&
        typeof track.language === "string" &&
        typeof track.selected === "boolean" &&
        typeof track.canLoadCues === "boolean",
    );
    updateYouTubePrimarySubtitleTrackKey();
    requestYouTubePrimarySubtitleCues();
    if (
      youtubeSecondarySubtitleTrackKey &&
      !youtubeSubtitleTracks.some(
        (track) =>
          track.key === youtubeSecondarySubtitleTrackKey && !track.selected,
      )
    ) {
      youtubeSecondarySubtitleTrackKey = "";
      youtubeSecondarySubtitleCues = null;
      youtubeSecondaryCueLoadedTrack = "";
      youtubeSecondaryCuePendingTrack = "";
      youtubeSecondaryCueRequestId++;
    } else if (youtubeSecondarySubtitleTrackKey) {
      requestYouTubeSecondarySubtitleCues();
    }
    state.pipUi?.refreshSubtitleTracks();
    if (
      previousPrimaryTrackKey !== youtubePrimarySubtitleTrackKey ||
      previousSecondaryTrackKey !== youtubeSecondarySubtitleTrackKey
    )
      refreshSubtitle(true);
  });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_YT_SUBTITLE_CUES" ||
      typeof event.data.videoId !== "string" ||
      event.data.videoId !== getCurrentYouTubeVideoId() ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !== youtubePrimaryCueRequestId ||
      event.data.key !== youtubePrimarySubtitleTrackKey ||
      typeof event.data.ok !== "boolean" ||
      !Array.isArray(event.data.cues)
    )
      return;
    youtubePrimaryCuePendingTrack = "";
    if (!event.data.ok) {
      console.warn(
        "[PiP Companion] YouTube primary subtitle timeline unavailable:",
        typeof event.data.error === "string" ? event.data.error : "unknown",
      );
      refreshSubtitle(true);
      return;
    }
    youtubePrimarySubtitleCues = event.data.cues
      .slice(0, 5000)
      .flatMap((cue) =>
        globalThis.PipCompanion.util.isRecord(cue) &&
        typeof cue.from === "number" &&
        Number.isFinite(cue.from) &&
        typeof cue.to === "number" &&
        Number.isFinite(cue.to) &&
        cue.to > cue.from &&
        typeof cue.content === "string" &&
        cue.content.length <= 10000
          ? [{ from: cue.from, to: cue.to, content: cue.content }]
          : [],
      );
    if (!youtubePrimarySubtitleCues.length) {
      refreshSubtitle(true);
      return;
    }
    youtubePrimaryCueLoadedTrack = youtubePrimarySubtitleTrackKey;
    refreshSubtitle(true);
  });

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_YT_SUBTITLE_CUES" ||
      typeof event.data.videoId !== "string" ||
      event.data.videoId !== getCurrentYouTubeVideoId() ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !== youtubeSecondaryCueRequestId ||
      event.data.key !== youtubeSecondarySubtitleTrackKey ||
      typeof event.data.ok !== "boolean" ||
      !Array.isArray(event.data.cues)
    )
      return;
    youtubeSecondaryCuePendingTrack = "";
    if (!event.data.ok) {
      console.warn(
        "[PiP Companion] YouTube subtitle timeline unavailable:",
        typeof event.data.error === "string" ? event.data.error : "unknown",
      );
      showSecondarySubtitleFailure();
      return;
    }
    youtubeSecondarySubtitleCues = event.data.cues
      .slice(0, 5000)
      .flatMap((cue) =>
        globalThis.PipCompanion.util.isRecord(cue) &&
        typeof cue.from === "number" &&
        Number.isFinite(cue.from) &&
        typeof cue.to === "number" &&
        Number.isFinite(cue.to) &&
        cue.to > cue.from &&
        typeof cue.content === "string" &&
        cue.content.length <= 10000
          ? [{ from: cue.from, to: cue.to, content: cue.content }]
          : [],
      );
    if (!youtubeSecondarySubtitleCues.length) return;
    youtubeSecondaryCueLoadedTrack = youtubeSecondarySubtitleTrackKey;
    refreshSubtitle(true);
  });

  function requestYouTubeSubtitleTracks() {
    if (
      !IS_YOUTUBE ||
      Date.now() - lastYouTubeSubtitleRequest < SUBTITLE_TRACK_SCAN_MS
    )
      return;
    lastYouTubeSubtitleRequest = Date.now();
    window.postMessage({ type: "PIP_REQUEST_YT_SUBTITLE_TRACKS" }, "*");
  }

  function getCurrentYouTubeVideoId() {
    if (!IS_YOUTUBE) return "";
    const fromDataset = document.documentElement.dataset.pipYtVideoId;
    if (fromDataset) return fromDataset;
    try {
      const url = new URL(location.href);
      return (
        url.searchParams.get("v") ||
        url.pathname.match(/\/(?:shorts|live)\/([^/?]+)/)?.[1] ||
        ""
      );
    } catch {
      return "";
    }
  }

  function updateYouTubePrimarySubtitleTrackKey() {
    const key =
      youtubeSubtitleTracks.find((track) => track.selected)?.key ?? "";
    if (key === youtubePrimarySubtitleTrackKey) return key;
    youtubePrimarySubtitleTrackKey = key;
    youtubePrimarySubtitleCues = null;
    youtubePrimaryCueLoadedTrack = "";
    youtubePrimaryCuePendingTrack = "";
    youtubePrimaryCueRequestId++;
    lastYouTubePrimaryCueRequest = 0;
    return key;
  }

  function requestYouTubePrimarySubtitleCues() {
    const track = youtubeSubtitleTracks.find((item) => item.selected);
    const key = updateYouTubePrimarySubtitleTrackKey();
    if (
      !IS_YOUTUBE ||
      !state.pipUi ||
      !state.subtitlessOn ||
      !key ||
      !track?.canLoadCues ||
      youtubePrimaryCueLoadedTrack === key ||
      youtubePrimaryCuePendingTrack === key ||
      (lastYouTubePrimaryCueRequest > 0 &&
        Date.now() - lastYouTubePrimaryCueRequest < 3000)
    )
      return;
    const requestId = ++youtubePrimaryCueRequestId;
    youtubePrimaryCuePendingTrack = key;
    lastYouTubePrimaryCueRequest = Date.now();
    window.postMessage(
      { type: "PIP_REQUEST_YT_SUBTITLE_CUES", requestId, key },
      "*",
    );
  }

  function requestYouTubeSecondarySubtitleCues() {
    const key = youtubeSecondarySubtitleTrackKey;
    if (
      !IS_YOUTUBE ||
      !key ||
      youtubeSecondaryCueLoadedTrack === key ||
      youtubeSecondaryCuePendingTrack === key ||
      (lastYouTubeCueRequest > 0 && Date.now() - lastYouTubeCueRequest < 3000)
    )
      return;
    const requestId = ++youtubeSecondaryCueRequestId;
    youtubeSecondaryCuePendingTrack = key;
    lastYouTubeCueRequest = Date.now();
    window.postMessage(
      { type: "PIP_REQUEST_YT_SUBTITLE_CUES", requestId, key },
      "*",
    );
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_NETFLIX_SUBTITLE_TRACKS" ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !== netflixSubtitleTrackRequestId ||
      !Array.isArray(event.data.tracks)
    )
      return;
    const nextNetflixSubtitleTracks = event.data.tracks.filter(
      (
        track,
      ): track is {
        key: string;
        index: number;
        label: string;
        language: string;
        selected: boolean;
      } =>
        globalThis.PipCompanion.util.isRecord(track) &&
        typeof track.key === "string" &&
        typeof track.index === "number" &&
        Number.isInteger(track.index) &&
        track.index >= 0 &&
        typeof track.label === "string" &&
        typeof track.language === "string" &&
        typeof track.selected === "boolean",
    );
    if (nextNetflixSubtitleTracks.length > 0)
      netflixSubtitleTracks = nextNetflixSubtitleTracks;
    const selectedTrack = netflixSubtitleTracks.find((track) => track.selected);
    const selectedTrackKey = selectedTrack?.key ?? "";
    const temporarySecondaryTrackKey = netflixSecondaryCuePendingTrack;
    const selectedIsSecondaryTrack =
      selectedTrackKey === netflixSecondarySubtitleTrackKey;
    if (
      selectedTrackKey !== temporarySecondaryTrackKey &&
      !selectedIsSecondaryTrack
    )
      netflixPrimarySubtitleTrackKey = selectedTrackKey;
    if (
      !temporarySecondaryTrackKey &&
      !selectedIsSecondaryTrack &&
      (netflixSecondarySubtitleTrackKey === netflixPrimarySubtitleTrackKey ||
        !netflixSubtitleTracks.some(
          (track) => track.key === netflixSecondarySubtitleTrackKey,
        ))
    ) {
      netflixSecondarySubtitleTrackKey = "";
      netflixSecondarySubtitleCues = null;
      netflixSecondaryCueLoadedTrack = "";
      netflixSecondaryCuePendingTrack = "";
      lastNetflixSecondaryCueRequest = 0;
    }
    if (typeof event.data.subtitlesEnabled === "boolean") {
      if (subtitleInitializationPending) {
        subtitleInitializationPending = false;
        setSubtitlesEnabled(event.data.subtitlesEnabled);
        applySubtitleEnabledOverride();
        if (state.subtitlessOn) prepareNativeSubtitles();
        refreshSubtitle(true);
      }
    }
    state.pipUi?.refreshSubtitleTracks();
  });

  function requestNetflixSubtitleTracks(force = false) {
    if (
      !IS_NETFLIX ||
      (!force &&
        Date.now() - lastNetflixSubtitleRequest < SUBTITLE_TRACK_SCAN_MS)
    )
      return;
    lastNetflixSubtitleRequest = Date.now();
    const requestId = ++netflixSubtitleTrackRequestId;
    window.postMessage(
      { type: "PIP_REQUEST_NETFLIX_SUBTITLE_TRACKS", requestId },
      location.origin,
    );
  }

  function requestNetflixSecondarySubtitleCues() {
    const key = netflixSecondarySubtitleTrackKey;
    if (
      !IS_NETFLIX ||
      !key ||
      netflixSecondaryCueLoadedTrack === key ||
      netflixSecondaryCuePendingTrack === key ||
      Date.now() - lastNetflixSecondaryCueRequest < 3000
    )
      return;
    const requestId = ++netflixSecondaryCueRequestId;
    netflixSecondaryCuePendingTrack = key;
    lastNetflixSecondaryCueRequest = Date.now();
    window.postMessage(
      { type: "PIP_REQUEST_NETFLIX_SUBTITLE_CUES", requestId, key },
      location.origin,
    );
  }

  function isNetflixSecondaryTrackActive(): boolean {
    if (!IS_NETFLIX || !netflixSecondarySubtitleTrackKey) return false;
    const selectedKey = netflixSubtitleTracks.find(
      (track) => track.selected,
    )?.key;
    return (
      selectedKey === netflixSecondarySubtitleTrackKey ||
      netflixSecondaryCuePendingTrack === netflixSecondarySubtitleTrackKey ||
      netflixSecondaryCueRetryTimer !== null
    );
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_NETFLIX_SUBTITLE_CUES" ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !== netflixSecondaryCueRequestId ||
      event.data.key !== netflixSecondarySubtitleTrackKey ||
      !Array.isArray(event.data.cues)
    )
      return;
    netflixSecondaryCuePendingTrack = "";
    const cues = event.data.cues.flatMap((cue) =>
      globalThis.PipCompanion.util.isRecord(cue) &&
      typeof cue.from === "number" &&
      typeof cue.to === "number" &&
      cue.to > cue.from &&
      typeof cue.content === "string"
        ? [{ from: cue.from, to: cue.to, content: cue.content }]
        : [],
    );
    if (event.data.restored !== true) {
      netflixSecondarySubtitleCues = null;
      netflixSecondaryCueLoadedTrack = "";
      lastNetflixSecondaryCueRequest = 0;
      requestNetflixSubtitleTracks(true);
      if (
        netflixSecondaryCueRetryCount < 3 &&
        netflixSecondaryCueRetryTimer === null
      ) {
        netflixSecondaryCueRetryCount++;
        netflixSecondaryCueRetryTimer = window.setTimeout(() => {
          netflixSecondaryCueRetryTimer = null;
          requestNetflixSecondarySubtitleCues();
        }, 150);
      } else if (netflixSecondaryCueRetryCount >= 3)
        showSecondarySubtitleFailure();
    } else {
      netflixSecondarySubtitleCues = cues;
      netflixSecondaryCueLoadedTrack = netflixSecondarySubtitleTrackKey;
      netflixSecondaryCueRetryCount = 0;
    }
    state.pipUi?.refreshSubtitleTranslationPreferences();
    refreshSubtitle(true);
  });

  function getSubtitleTracks() {
    return standardTextTrack.getTracks(state.sourceVideo);
  }

  function hasSubtitleSource() {
    const textTracks = Array.from(state.sourceVideo?.textTracks ?? []).filter(
      (track) => {
        const kind = String(track.kind).toLowerCase();
        if (["chapters", "descriptions"].includes(kind)) return false;
        return (
          kind === "subtitles" ||
          kind === "captions" ||
          Boolean(track.label.trim() || track.language.trim())
        );
      },
    );
    if (
      textTracks.length ||
      getNativeSubtitleTracks().length ||
      state.subtitleNode?.isConnected ||
      findGenericSubtitleNode()
    )
      subtitleSourceConfirmed = true;
    return subtitleSourceConfirmed;
  }

  function getTimedSubtitleLines(
    cues: TimedSubtitleCue[] | null,
    currentTime: number,
  ): SubtitleLine[] {
    return (cues ?? [])
      .filter((cue) => cue.from <= currentTime && currentTime < cue.to)
      .flatMap((cue) => {
        const text = cue.content.replace(/\r?\n/g, " ").trim();
        return text
          ? [{ segments: [{ text }], from: cue.from, to: cue.to }]
          : [];
      });
  }

  function syncYouTubePrimarySubtitleTimeline(): boolean {
    if (!IS_YOUTUBE || !state.pipUi || !state.subtitlessOn) return false;
    const track = youtubeSubtitleTracks.find((item) => item.selected);
    const key = updateYouTubePrimarySubtitleTrackKey();
    if (!key || !track?.canLoadCues) return false;
    if (youtubePrimaryCueLoadedTrack !== key) {
      requestYouTubePrimarySubtitleCues();
      return false;
    }

    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    const lines = getTimedSubtitleLines(
      youtubePrimarySubtitleCues,
      state.sourceVideo?.currentTime ?? 0,
    );
    state.subtitleLines = lines;
    renderSubtitle();
    return true;
  }

  function renderBilibiliSubtitles() {
    if (!state.pipUi || !bilibiliSubtitles.primaryKey) return false;

    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    state.subtitleLines = getTimedSubtitleLines(
      bilibiliSubtitles.primaryCues,
      state.sourceVideo?.currentTime ?? 0,
    );
    renderSubtitle();
    return true;
  }

  function getNativeTrackId(track: TextTrack) {
    let id = nativeTrackIds.get(track);
    if (!id) {
      id = `native:${++nextNativeTrackId}`;
      nativeTrackIds.set(track, id);
    }
    return id;
  }

  function getNativeSubtitleTracks(): SubtitleTrackOption[] {
    if (IS_NETFLIX && netflixSubtitleTracks.length)
      return netflixSubtitleTracks.map((track) => ({
        id: `netflix:${track.key}`,
        index: track.index,
        label:
          track.label || t("pipSubtitleTrackNumber", String(track.index + 1)),
        language: track.language,
        selected: track.key === netflixPrimarySubtitleTrackKey,
      }));

    if (IS_YOUTUBE && youtubeSubtitleTracks.length)
      return youtubeSubtitleTracks.map((track, index) => ({
        id: `youtube:${track.key}`,
        index,
        label: track.label || t("pipSubtitleTrackNumber", String(index + 1)),
        language: track.language,
        selected: track.selected,
      }));

    const tracks = getSubtitleTracks();
    const candidateTrack = standardTextTrack.getSelectedTrack(
      state.sourceVideo,
      selectedNativeTrack,
    );
    selectedNativeTrack =
      candidateTrack === nativeSecondaryTrack.getTrack()
        ? null
        : candidateTrack;
    const selectedTrack = selectedNativeTrack;
    const nativeOptions = tracks.map((track, index) => ({
      id: getNativeTrackId(track),
      index,
      label:
        track.label.trim() ||
        track.language.trim() ||
        t("pipSubtitleTrackNumber", String(index + 1)),
      language: track.language,
      selected: track === selectedTrack,
    }));
    if (IS_BILIBILI && bilibiliSubtitles.tracks.length) {
      const platformTracks = tracks.length
        ? bilibiliSubtitles.tracks.filter((track) => track.isAi)
        : bilibiliSubtitles.tracks;
      return [
        ...nativeOptions,
        ...platformTracks.map((track, index) => ({
          id: `bilibili:${track.key}`,
          index: tracks.length + index,
          label: track.label || t("pipSubtitleTrackNumber", String(index + 1)),
          language: track.language,
          selected: track.key === bilibiliSubtitles.primaryKey,
        })),
      ];
    }
    return nativeOptions;
  }

  function getSecondarySubtitleTracks(): SubtitleTrackOption[] {
    if (IS_YOUTUBE) {
      const primaryKey = youtubeSubtitleTracks.find(
        (track) => track.selected,
      )?.key;
      return youtubeSubtitleTracks.flatMap((track, index) =>
        track.key === primaryKey || !track.canLoadCues
          ? []
          : [
              {
                id: `youtube:${track.key}`,
                index,
                label:
                  track.label || t("pipSubtitleTrackNumber", String(index + 1)),
                language: track.language,
                selected: track.key === youtubeSecondarySubtitleTrackKey,
              },
            ],
      );
    }
    if (IS_NETFLIX)
      return netflixSubtitleTracks.flatMap((track) =>
        track.key === netflixPrimarySubtitleTrackKey
          ? []
          : [
              {
                id: `netflix:${track.key}`,
                index: track.index,
                label:
                  track.label ||
                  t("pipSubtitleTrackNumber", String(track.index + 1)),
                language: track.language,
                selected: track.key === netflixSecondarySubtitleTrackKey,
              },
            ],
      );

    const tracks = getSubtitleTracks();
    const candidateTrack = standardTextTrack.getSelectedTrack(
      state.sourceVideo,
      selectedNativeTrack,
    );
    const primaryTrack =
      candidateTrack === nativeSecondaryTrack.getTrack()
        ? null
        : candidateTrack;
    const nativeTracks = tracks.flatMap((track, index) =>
      track === primaryTrack
        ? []
        : [
            {
              id: getNativeTrackId(track),
              index,
              label:
                track.label.trim() ||
                track.language.trim() ||
                t("pipSubtitleTrackNumber", String(index + 1)),
              language: track.language,
              selected: track === nativeSecondaryTrack.getTrack(),
            },
          ],
    );
    if (!IS_BILIBILI) return nativeTracks;
    const biliTracks = bilibiliSubtitles.tracks.flatMap((track, index) =>
      track.key === bilibiliSubtitles.primaryKey
        ? []
        : [
            {
              id: `bilibili:${track.key}`,
              index: tracks.length + index,
              label: track.label,
              language: track.language,
              selected: track.key === bilibiliSubtitles.secondaryKey,
            },
          ],
    );
    return [...nativeTracks, ...biliTracks];
  }

  function getSelectedSecondarySubtitleTrack(): string {
    if (IS_YOUTUBE)
      return youtubeSecondarySubtitleTrackKey
        ? `youtube:${youtubeSecondarySubtitleTrackKey}`
        : "";
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return `bilibili:${bilibiliSubtitles.secondaryKey}`;
    if (IS_NETFLIX && netflixSecondarySubtitleTrackKey)
      return `netflix:${netflixSecondarySubtitleTrackKey}`;
    const track = nativeSecondaryTrack.getTrack();
    return track ? getNativeTrackId(track) : "";
  }

  function selectSecondarySubtitleTrack(id: string) {
    if (IS_YOUTUBE && id.startsWith("youtube:")) {
      const key = id.slice("youtube:".length);
      if (
        !youtubeSubtitleTracks.some(
          (track) => track.key === key && !track.selected && track.canLoadCues,
        )
      )
        return;
      youtubeSecondarySubtitleTrackKey = key;
      youtubeSecondarySubtitleCues = null;
      youtubeSecondaryCueLoadedTrack = "";
      youtubeSecondaryCuePendingTrack = "";
      youtubeSecondaryCueRequestId++;
      secondarySubtitleFailureShown = false;
      requestYouTubeSecondarySubtitleCues();
      state.pipUi?.refreshSubtitleTracks();
      refreshSubtitle(true);
      return;
    }
    if (IS_BILIBILI && id.startsWith("bilibili:")) {
      const key = id.slice("bilibili:".length);
      if (!bilibiliSubtitles.selectSecondary(key)) return;
      nativeSecondaryTrack.clear(true);
      secondarySubtitleFailureShown = false;
      bilibiliSubtitles.loadTrack(key, true);
      state.pipUi?.refreshSubtitleTracks();
      refreshSubtitle(true);
      return;
    }
    if (IS_NETFLIX && id.startsWith("netflix:")) {
      const key = id.slice("netflix:".length);
      if (
        key === netflixPrimarySubtitleTrackKey ||
        !netflixSubtitleTracks.some((track) => track.key === key)
      )
        return;
      netflixSecondarySubtitleTrackKey = key;
      netflixSecondarySubtitleCues = null;
      netflixSecondaryCueLoadedTrack = "";
      netflixSecondaryCuePendingTrack = "";
      lastNetflixSecondaryCueRequest = 0;
      netflixSecondaryCueRequestId++;
      if (netflixSecondaryCueRetryTimer !== null) {
        window.clearTimeout(netflixSecondaryCueRetryTimer);
        netflixSecondaryCueRetryTimer = null;
      }
      netflixSecondaryCueRetryCount = 0;
      secondarySubtitleFailureShown = false;
      requestNetflixSecondarySubtitleCues();
      state.pipUi?.refreshSubtitleTracks();
      refreshSubtitle(true);
      return;
    }
    const track = getSubtitleTracks().find(
      (item) => getNativeTrackId(item) === id,
    );
    const candidatePrimaryTrack = standardTextTrack.getSelectedTrack(
      state.sourceVideo,
      selectedNativeTrack,
    );
    const primaryTrack =
      candidatePrimaryTrack === nativeSecondaryTrack.getTrack()
        ? null
        : candidatePrimaryTrack;
    if (!track || track === primaryTrack) return;
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey) {
      bilibiliSubtitles.clearSecondary();
    }
    selectedNativeTrack = primaryTrack;
    if (!nativeSecondaryTrack.select(track, primaryTrack)) return;
    state.pipUi?.refreshSubtitleTracks();
    refreshSubtitle(true);
  }

  function activateNativeSecondaryTrack() {
    const track = nativeSecondaryTrack.getTrack();
    if (!track || track === selectedNativeTrack) return;
    nativeSecondaryTrack.activate();
  }

  function normalizeSubtitleLanguage(language: string): string {
    const normalized = language.trim().replace(/_/g, "-").toLowerCase();
    if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(normalized)) return "zh-hant";
    if (/^zh-(?:hans|cn|sg)(?:-|$)/.test(normalized)) return "zh-hans";
    return normalized.split("-")[0] ?? normalized;
  }

  function subtitleLanguagesMatch(left: string, right: string): boolean {
    return Boolean(
      left &&
      right &&
      normalizeSubtitleLanguage(left) === normalizeSubtitleLanguage(right),
    );
  }

  function onTranslationConfigChanged(previous: unknown, next: unknown) {
    subtitleTranslation.onConfigChanged(previous, next);
  }

  function onTranslationPreferencesChanged(
    previous: SubtitleTranslationPreferences | null,
    next: SubtitleTranslationPreferences,
  ) {
    subtitleTranslation.onPreferencesChanged(previous, next);
  }

  function onSubtitlesEnabledChanged(enabled: boolean) {
    subtitleTranslation.onSubtitlesEnabledChanged(enabled);
    state.pipUi?.refreshSubtitleTranslationPreferences();
    void chrome.runtime
      .sendMessage({
        type: "PIP_SUBTITLES_ENABLED_CHANGED",
        enabled,
      } satisfies ExtensionMessage)
      .catch(() => {});
  }

  function setSubtitlesEnabled(enabled: boolean) {
    if (!enabled) subtitleTranslationSuspended = true;
    if (state.subtitlessOn === enabled) return;
    state.subtitlessOn = enabled;
    onSubtitlesEnabledChanged(enabled);
  }

  function resumeSubtitleTranslation() {
    subtitleTranslationSuspended = false;
    state.pipUi?.refreshSubtitleTranslationPreferences();
    renderSubtitle();
  }

  function selectNativeSubtitleTrack(id: string) {
    cancelSubtitleInitialization();
    if (id.startsWith("netflix:")) {
      const key = id.slice("netflix:".length);
      if (!netflixSubtitleTracks.some((track) => track.key === key)) return;
      preserveSubtitleEnabledOverride();
      netflixPrimarySubtitleTrackKey = key;
      if (netflixSecondarySubtitleTrackKey === key) {
        netflixSecondarySubtitleTrackKey = "";
        netflixSecondarySubtitleCues = null;
        netflixSecondaryCueLoadedTrack = "";
        netflixSecondaryCuePendingTrack = "";
        lastNetflixSecondaryCueRequest = 0;
        netflixSecondaryCueRequestId++;
      }
      state.pipUi?.refreshSubtitleTracks();
      window.postMessage(
        { type: "PIP_SELECT_NETFLIX_SUBTITLE_TRACK", key },
        location.origin,
      );
      refreshSubtitle(true);
      return;
    }

    if (id.startsWith("youtube:")) {
      const key = id.slice("youtube:".length);
      if (!youtubeSubtitleTracks.some((track) => track.key === key)) return;
      preserveSubtitleEnabledOverride();
      for (const track of youtubeSubtitleTracks)
        track.selected = track.key === key;
      if (youtubeSecondarySubtitleTrackKey === key) {
        youtubeSecondarySubtitleTrackKey = "";
        youtubeSecondarySubtitleCues = null;
        youtubeSecondaryCueLoadedTrack = "";
        youtubeSecondaryCuePendingTrack = "";
        youtubeSecondaryCueRequestId++;
      }
      state.pipUi?.refreshSubtitleTracks();
      rememberYouTubeSubtitleState();
      window.postMessage({ type: "PIP_SELECT_YT_SUBTITLE_TRACK", key }, "*");
      refreshSubtitle(true);
      return;
    }

    const nativeTracks = getSubtitleTracks();
    if (IS_BILIBILI && id.startsWith("bilibili:")) {
      const key = id.slice("bilibili:".length);
      if (!bilibiliSubtitles.tracks.some((track) => track.key === key)) return;
      preserveSubtitleEnabledOverride();
      bilibiliSubtitles.selectPrimary(key);
      secondarySubtitleFailureShown = false;
      selectedNativeTrack = null;
      state.subtitleLines = [];
      const changedTracks = (state.nativeSubtitleTracks ??= new Map());
      for (const nativeTrack of nativeTracks) {
        if (!changedTracks.has(nativeTrack))
          changedTracks.set(nativeTrack, nativeTrack.mode);
        nativeTrack.mode = "disabled";
      }
      activateNativeSecondaryTrack();
      bilibiliSubtitles.requestTracks();
      bilibiliSubtitles.loadTrack(bilibiliSubtitles.primaryKey);
      state.pipUi?.refreshSubtitleTracks();
      refreshSubtitle(true);
      return;
    }

    const selectedTrack = nativeTracks.find(
      (track) => getNativeTrackId(track) === id,
    );
    if (!selectedTrack) return;
    preserveSubtitleEnabledOverride();

    const changedTracks = (state.nativeSubtitleTracks ??= new Map());
    standardTextTrack.selectTrack(state.sourceVideo, selectedTrack, (track) => {
      if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
    });
    selectedNativeTrack = selectedTrack;
    if (nativeSecondaryTrack.getTrack() === selectedTrack)
      nativeSecondaryTrack.clear();
    else activateNativeSecondaryTrack();
    if (IS_BILIBILI && bilibiliSubtitles.primaryKey) {
      bilibiliSubtitles.clearPrimary();
    }
    syncNativeSubtitles();
    state.pipUi?.refreshSubtitleTracks();
  }

  function getSubtitleMediaKey() {
    const video = state.sourceVideo;
    const source = video?.currentSrc || video?.src || "";
    if (IS_YOUTUBE) {
      const videoId =
        document.documentElement.dataset.pipYtVideoId ||
        new URL(location.href).searchParams.get("v");
      if (videoId) return `youtube:${videoId}`;
    }
    if (IS_NETFLIX) return `netflix:${location.pathname}`;
    if (IS_BILIBILI)
      return `bilibili:${location.pathname}${location.search}|${source}`;
    return source ? `media:${source}` : "";
  }

  function getSubtitlePlatformKey() {
    if (IS_YOUTUBE) return "youtube";
    if (IS_NETFLIX) return "netflix";
    if (IS_BILIBILI) return "bilibili";
    return location.hostname;
  }

  function setSubtitleEnabledOverride(enabled: boolean, nativeControl = false) {
    subtitleEnabledOverride = {
      platform: getSubtitlePlatformKey(),
      enabled,
      nativeControl,
    };
  }

  function preserveSubtitleEnabledOverride() {
    setSubtitleEnabledOverride(
      state.subtitlessOn,
      subtitleEnabledOverride?.nativeControl === true,
    );
  }

  function applySubtitleEnabledOverride() {
    if (!subtitleEnabledOverride) return;
    if (subtitleEnabledOverride.platform !== getSubtitlePlatformKey()) {
      subtitleEnabledOverride = null;
      return;
    }

    setSubtitlesEnabled(subtitleEnabledOverride.enabled);
    if (subtitleEnabledOverride.enabled) return;

    subtitleInitializationPending = false;
    if (!subtitleEnabledOverride.nativeControl) return;
    if (
      IS_YOUTUBE &&
      subtitleMediaKey &&
      youtubeSubtitleOffEnforcedForMedia !== subtitleMediaKey &&
      getYouTubeSubtitleButton()
    ) {
      rememberYouTubeSubtitleState();
      youtubeSubtitleOffEnforcedForMedia = subtitleMediaKey;
      window.postMessage(
        { type: "PIP_SET_YT_SUBTITLES_ENABLED", enabled: false },
        "*",
      );
    }
    const changedTracks = (state.nativeSubtitleTracks ??= new Map());
    for (const track of getSubtitleTracks()) {
      if (!["subtitles", "captions"].includes(String(track.kind))) continue;
      if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
      if (track !== nativeSecondaryTrack.getTrack()) track.mode = "disabled";
    }
    activateNativeSecondaryTrack();
  }

  function onNativeSubtitleEnabledChanged(enabled: boolean) {
    if (!state.pipUi) return;
    setSubtitleEnabledOverride(enabled, true);
    if (IS_YOUTUBE) {
      youtubeSubtitleOffEnforcedForMedia = enabled ? "" : subtitleMediaKey;
      window.postMessage(
        { type: "PIP_SET_YT_SUBTITLES_ENABLED", enabled },
        "*",
      );
    }
    setSubtitlesEnabled(enabled);
    if (enabled) prepareNativeSubtitles();
    refreshSubtitle(true);
  }

  function setSubtitlesEnabledFromPipShortcut(enabled: boolean) {
    cancelSubtitleInitialization();
    if (IS_YOUTUBE) {
      onNativeSubtitleEnabledChanged(enabled);
      return;
    }
    setSubtitleEnabledOverride(enabled);
    setSubtitlesEnabled(enabled);
    if (enabled) prepareNativeSubtitles();
    refreshSubtitle(true);
  }

  function resetForSubtitleMediaChange(mediaKey: string) {
    youtubeSubtitleOffEnforcedForMedia = "";
    if (state.subtitleTranslationPreferences.enabled) {
      const previous = state.subtitleTranslationPreferences;
      const next = { ...previous, enabled: false };
      state.subtitleTranslationPreferences = next;
      onTranslationPreferencesChanged(previous, next);
      void chrome.storage.local
        .set({
          [globalThis.PipCompanion.subtitleTranslationSettings.PREFERENCES_KEY]:
            next,
        })
        .catch(() => {});
    }
    state.nativeSubtitleTracks = null;
    selectedNativeTrack = null;
    nativeSecondaryTrack.clear();
    youtubeSubtitleTracks = [];
    lastYouTubeSubtitleRequest = 0;
    youtubePrimarySubtitleTrackKey = "";
    youtubePrimarySubtitleCues = null;
    youtubePrimaryCueLoadedTrack = "";
    youtubePrimaryCuePendingTrack = "";
    youtubePrimaryCueRequestId++;
    lastYouTubePrimaryCueRequest = 0;
    youtubeSecondarySubtitleTrackKey = "";
    youtubeSecondarySubtitleCues = null;
    youtubeSecondaryCueLoadedTrack = "";
    youtubeSecondaryCuePendingTrack = "";
    youtubeSecondaryCueRequestId++;
    lastYouTubeCueRequest = 0;
    netflixSubtitleTracks = [];
    netflixPrimarySubtitleTrackKey = "";
    netflixSecondarySubtitleTrackKey = "";
    netflixSecondarySubtitleCues = null;
    netflixSecondaryCueLoadedTrack = "";
    netflixSecondaryCuePendingTrack = "";
    netflixSecondaryCueRequestId++;
    if (netflixSecondaryCueRetryTimer !== null) {
      window.clearTimeout(netflixSecondaryCueRetryTimer);
      netflixSecondaryCueRetryTimer = null;
    }
    netflixSecondaryCueRetryCount = 0;
    lastNetflixSubtitleRequest = 0;
    netflixSubtitleTrackRequestId++;
    subtitleInitializationPending = false;
    bilibiliSubtitles.reset();
    secondarySubtitleFailureShown = false;
    state.youtubeSubtitlesInitiallyEnabled = null;
    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    state.lastSubtitleScan = 0;
    subtitleEmptyCount = 0;
    state.subtitleLines = [];
    setSubtitlesEnabled(false);
    subtitleSourceConfirmed = false;
    subtitleMediaKey = mediaKey;
    initializeSubtitleState();
    state.pipUi?.refreshSubtitleTracks();
    state.pipUi?.refreshSubtitleTranslationPreferences();
  }

  function getYouTubeSubtitleButton() {
    if (!IS_YOUTUBE) return null;
    return document.querySelector<HTMLElement>(
      "#movie_player .ytp-subtitles-button",
    );
  }

  function setNativeSubtitleVideo(video: HTMLVideoElement | null) {
    nativeSecondaryTrack.setVideo(video);
  }

  function initializeSubtitlesOn() {
    subtitleEnabledOverride = null;
    youtubeSubtitleOffEnforcedForMedia = "";
    const mediaKey = getSubtitleMediaKey();
    if (mediaKey && subtitleMediaKey && mediaKey !== subtitleMediaKey) {
      resetForSubtitleMediaChange(mediaKey);
      return;
    }
    if (mediaKey) subtitleMediaKey = mediaKey;
    initializeSubtitleState();
  }

  function initializeSubtitleState() {
    subtitleInitializationPending = false;
    selectedNativeTrack = null;
    nativeSecondaryTrack.clear();
    setSubtitlesEnabled(false);
    const button = getYouTubeSubtitleButton();
    if (button) {
      setSubtitlesEnabled(button.getAttribute("aria-pressed") === "true");
      applySubtitleEnabledOverride();
      return;
    }

    const tracks = getSubtitleTracks();
    const nativeEnabled = IS_BILIBILI
      ? bilibiliSubtitles.getNativeEnabled()
      : null;
    setSubtitlesEnabled(
      nativeEnabled ??
        (tracks.some((track) => track.mode === "showing") ||
          Boolean(findGenericSubtitleNode())),
    );
    if (IS_NETFLIX) {
      subtitleInitializationPending = true;
      requestNetflixSubtitleTracks(true);
    }
    applySubtitleEnabledOverride();
  }

  document.addEventListener(
    "click",
    (event) => {
      if (!IS_YOUTUBE || !state.pipUi || !event.isTrusted) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (!target.closest("#movie_player .ytp-subtitles-button")) return;
      window.setTimeout(() => {
        const button = getYouTubeSubtitleButton();
        if (button)
          onNativeSubtitleEnabledChanged(
            button.getAttribute("aria-pressed") === "true",
          );
      }, 0);
    },
    true,
  );

  function cancelSubtitleInitialization() {
    subtitleInitializationPending = false;
  }

  function rememberYouTubeSubtitleState() {
    const button = getYouTubeSubtitleButton();
    if (button && state.youtubeSubtitlesInitiallyEnabled === null)
      state.youtubeSubtitlesInitiallyEnabled =
        button.getAttribute("aria-pressed") === "true";
  }

  function enableYouTubeSubtitles() {
    const button = getYouTubeSubtitleButton();
    if (!button) return;
    rememberYouTubeSubtitleState();
    if (button.getAttribute("aria-pressed") !== "true") button.click();
  }

  function refreshSubtitle(force = false) {
    if (!state.pipUi) {
      stopSubtitleClockSync();
      clearSubtitleEmptyTimer();
      state.subtitleObserver?.disconnect();
      state.subtitleObserver = null;
      state.subtitleNode = null;
      state.subtitleExtract = null;
      state.subtitleLines = [];
      return;
    }

    state.pipUi.refreshSubtitleTracks();

    if (state.subtitlessOn) ensureSubtitleClockSync();
    else stopSubtitleClockSync();

    const mediaKey = getSubtitleMediaKey();
    if (mediaKey && subtitleMediaKey && mediaKey !== subtitleMediaKey)
      resetForSubtitleMediaChange(mediaKey);
    else if (mediaKey && !subtitleMediaKey) subtitleMediaKey = mediaKey;

    applySubtitleEnabledOverride();
    bilibiliSubtitles.requestTracks();
    if (!state.subtitlessOn) {
      clearSubtitleEmptyTimer();
      state.subtitleObserver?.disconnect();
      state.subtitleObserver = null;
      state.subtitleNode = null;
      state.subtitleExtract = null;
      state.subtitleLines = [];
      renderSubtitle();
      return;
    }
    requestYouTubeSubtitleTracks();
    requestNetflixSubtitleTracks();
    if (isNetflixSecondaryTrackActive()) return;

    bilibiliSubtitles.loadTrack(bilibiliSubtitles.primaryKey);
    if (renderBilibiliSubtitles()) return;
    if (syncYouTubePrimarySubtitleTimeline()) {
      syncSecondarySubtitleTimeline();
      return;
    }
    if (
      selectedNativeTrack &&
      !getSubtitleTracks().includes(selectedNativeTrack)
    )
      selectedNativeTrack = null;
    if (useNativeSubtitleTrack()) return;

    let nextNode = state.subtitleNode;
    if (state.subtitleNode?.isConnected) {
      if (Date.now() - state.lastSubtitleScan >= SUBTITLE_SCAN_MS) {
        state.lastSubtitleScan = Date.now();
        if (extractOverlayLines(state.subtitleNode).length)
          subtitleEmptyCount = 0;
        else if (++subtitleEmptyCount >= SUBTITLE_EMPTY_LIMIT) {
          subtitleEmptyCount = 0;
          state.subtitleObserver?.disconnect();
          state.subtitleObserver = null;
          state.subtitleNode = null;
          state.subtitleExtract = null;
        }
      }
      nextNode = state.subtitleNode;
    } else {
      if (!force && Date.now() - state.lastSubtitleScan < SUBTITLE_SCAN_MS) {
        syncSecondarySubtitleTimeline();
        return;
      }
      state.lastSubtitleScan = Date.now();
      nextNode = findGenericSubtitleNode();
    }
    if (nextNode !== state.subtitleNode) {
      clearSubtitleEmptyTimer();
      subtitleEmptyCount = 0;
      state.subtitleObserver?.disconnect();
      state.subtitleObserver = null;
      state.subtitleNode = nextNode;
      state.subtitleExtract = nextNode ? extractOverlayLines : null;
      const node = state.subtitleNode;
      const extract = state.subtitleExtract;
      if (node && extract) {
        state.subtitleObserver = new MutationObserver(() => {
          if (subtitleRefreshPending) return;
          subtitleRefreshPending = true;
          const update = () => {
            subtitleRefreshPending = false;
            if (
              !state.subtitlessOn ||
              !state.pipUi ||
              !state.subtitleNode ||
              !state.subtitleExtract
            )
              return;
            if (isNetflixSecondaryTrackActive()) return;
            if (selectedNativeTrack) {
              state.subtitleLines = getNativeSubtitleLines();
              renderSubtitle();
            } else {
              syncOverlaySubtitles(state.subtitleNode, state.subtitleExtract);
            }
          };
          const view = node.ownerDocument.defaultView;
          if (view) view.requestAnimationFrame(update);
          else queueMicrotask(update);
        });
        state.subtitleObserver.observe(node.parentElement ?? node, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ["style"],
        });
      }
      force = true;
    }
    if (!force) {
      if (selectedNativeTrack) {
        state.subtitleLines = getNativeSubtitleLines();
        renderSubtitle();
      }
      syncSecondarySubtitleTimeline();
      return;
    }
    const activeNode = state.subtitleNode;
    const activeExtract = state.subtitleExtract;
    if (selectedNativeTrack) {
      state.subtitleLines = getNativeSubtitleLines();
      renderSubtitle();
    } else if (activeNode && activeExtract)
      syncOverlaySubtitles(activeNode, activeExtract);
    else {
      state.subtitleLines = getNativeSubtitleLines();
      renderSubtitle();
    }
  }

  function findGenericSubtitleNode() {
    const selector =
      '[class*="subtitle" i], [class*="caption" i], [class*="timedtext" i], [class*="text-track-display" i], [id*="subtitle" i], [id*="caption" i]';
    const scored: {
      element: HTMLElement;
      score: number;
      hasText: boolean;
    }[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      const text = (element.innerText || "").trim();
      if (text.length > 300) continue;
      if (element.querySelector("button, a, input, select, video")) continue;
      const style = getComputedStyle(element);
      if (style.position !== "absolute" && style.position !== "fixed") continue;
      const rect = element.getBoundingClientRect();
      if (rect.width < 40) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      let score = 0;
      if (style.pointerEvents === "none") score += 2;
      if (
        element.closest(
          "button, [role='button'], [role='menu'], [role='listbox']",
        )
      )
        score -= 2;
      if (
        element.closest(
          "[class*='control' i], [class*='ctrl' i], [class*='panel' i]",
        )
      )
        score -= 2;
      scored.push({ element, score, hasText: Boolean(text) });
    }

    if (!scored.length) return null;
    const populated = scored.filter((entry) => entry.hasText);
    const candidates = populated.length ? populated : scored;
    const best = Math.max(...candidates.map((entry) => entry.score));
    const top = candidates
      .filter((entry) => entry.score === best)
      .map((entry) => entry.element);
    return (
      top.find(
        (element) =>
          !top.some((other) => other !== element && other.contains(element)),
      ) ??
      top[0] ??
      null
    );
  }

  function extractOverlayLines(node: HTMLElement | null) {
    if (!node) return [];
    return (node.innerText || "")
      .split(/\r?\n/)
      .map((line) => line.replace(/\s+/g, " ").trim())
      .filter(Boolean)
      .map((text) => ({ segments: [{ text }] }));
  }

  function getNativeSubtitleLines(): SubtitleLine[] {
    const track =
      selectedNativeTrack ??
      standardTextTrack.getSelectedTrack(state.sourceVideo, null);
    if (!track || track === nativeSecondaryTrack.getTrack()) return [];
    return standardTextTrack.getActiveLines(
      state.sourceVideo,
      track,
      state.sourceVideo?.currentTime ?? 0,
    );
  }

  function useNativeSubtitleTrack() {
    let track =
      selectedNativeTrack ??
      standardTextTrack.getSelectedTrack(state.sourceVideo, null);
    if (!track && state.videoStash) {
      const candidate = IS_HAHOW
        ? getSubtitleTracks()[0]
        : getSubtitleTracks().find(
            (item) => item.mode !== "disabled" || Boolean(item.cues?.length),
          );
      if (candidate) {
        const changedTracks = (state.nativeSubtitleTracks ??= new Map());
        if (!changedTracks.has(candidate))
          changedTracks.set(candidate, candidate.mode);
        if (!IS_HAHOW) candidate.mode = "hidden";
        track = candidate;
      }
    }
    if (!track || track === nativeSecondaryTrack.getTrack()) return false;
    selectedNativeTrack = track;
    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    state.subtitleLines = getNativeSubtitleLines();
    renderSubtitle();
    return true;
  }

  function syncSecondarySubtitleTimeline(): boolean {
    if (!isNativeSecondaryActive() || !state.pipUi) return false;
    renderSubtitle();
    return true;
  }

  function getNativeSecondarySubtitleLines(): SubtitleLine[] {
    if (IS_YOUTUBE) {
      const key = youtubeSecondarySubtitleTrackKey;
      if (!key) return [];
      if (youtubeSecondaryCueLoadedTrack !== key) {
        requestYouTubeSecondarySubtitleCues();
        return [];
      }
      const currentTime = state.sourceVideo?.currentTime ?? 0;
      return getTimedSubtitleLines(youtubeSecondarySubtitleCues, currentTime);
    }
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey) {
      return getTimedSubtitleLines(
        bilibiliSubtitles.secondaryCues,
        state.sourceVideo?.currentTime ?? 0,
      );
    }
    if (IS_NETFLIX && netflixSecondarySubtitleTrackKey) {
      if (netflixSecondaryCueLoadedTrack !== netflixSecondarySubtitleTrackKey) {
        requestNetflixSecondarySubtitleCues();
        return [];
      }
      return getTimedSubtitleLines(
        netflixSecondarySubtitleCues,
        state.sourceVideo?.currentTime ?? 0,
      );
    }
    return nativeSecondaryTrack.getLines(state.sourceVideo?.currentTime ?? 0);
  }

  function getPreferNativeSecondaryTrackLanguage(): string {
    if (IS_YOUTUBE)
      return (
        youtubeSubtitleTracks.find(
          (track) => track.key === youtubeSecondarySubtitleTrackKey,
        )?.language ?? ""
      );
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return (
        bilibiliSubtitles.tracks.find(
          (track) => track.key === bilibiliSubtitles.secondaryKey,
        )?.language ?? ""
      );
    if (IS_NETFLIX && netflixSecondarySubtitleTrackKey)
      return (
        netflixSubtitleTracks.find(
          (track) => track.key === netflixSecondarySubtitleTrackKey,
        )?.language ?? ""
      );
    return nativeSecondaryTrack.getTrack()?.language ?? "";
  }

  // 找原生同語言軌當第二字幕，不打翻譯 API。
  function getPreferNativeSecondaryLines(
    targetLanguage: string,
  ): SubtitleLine[] | null {
    const activeLanguage = getPreferNativeSecondaryTrackLanguage();
    if (activeLanguage) {
      // 已有明確選擇的第二軌：相符就用，不相符不覆寫。
      if (!subtitleLanguagesMatch(activeLanguage, targetLanguage)) return null;
      return getNativeSecondarySubtitleLines();
    }
    const match = getSecondarySubtitleTracks().find(
      (track) =>
        Boolean(track.language) &&
        subtitleLanguagesMatch(track.language ?? "", targetLanguage),
    );
    if (!match) return null;
    selectSecondarySubtitleTrack(match.id);
    return getNativeSecondarySubtitleLines();
  }

  function isNativeSecondaryActive(): boolean {
    if (
      !state.subtitleTranslationPreferences.enabled ||
      subtitleTranslationSuspended ||
      !state.subtitleTranslationPreferences.useNativeSecondaryTrack
    )
      return false;

    if (IS_YOUTUBE) return Boolean(youtubeSecondarySubtitleTrackKey);
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return bilibiliSubtitles.tracks.some(
        (track) => track.key === bilibiliSubtitles.secondaryKey,
      );
    if (IS_NETFLIX)
      return netflixSubtitleTracks.some(
        (track) => track.key === netflixSecondarySubtitleTrackKey,
      );
    return nativeSecondaryTrack.hasTrack();
  }

  function suppressNativeSubtitles() {
    if (IS_HAHOW || state.subtitleNode || !state.videoStash) return;
    for (const track of state.sourceVideo?.textTracks ?? []) {
      if (
        track.kind === "metadata" ||
        track.kind === "chapters" ||
        track.mode !== "showing"
      )
        continue;
      const tracks = (state.nativeSubtitleTracks ??= new Map());
      if (!tracks.has(track)) tracks.set(track, track.mode);
      track.mode = "hidden";
    }
  }

  function prepareNativeSubtitles() {
    if (!state.subtitlessOn) return;
    if (IS_HAHOW) return;
    enableYouTubeSubtitles();
    if (
      IS_BILIBILI &&
      (bilibiliSubtitles.primaryKey || !getSubtitleTracks().length)
    ) {
      bilibiliSubtitles.requestTracks();
      bilibiliSubtitles.loadTrack(bilibiliSubtitles.primaryKey);
      renderBilibiliSubtitles();
      return;
    }
    if (state.subtitleNode || !state.videoStash) return;
    suppressNativeSubtitles();
    const tracks = Array.from(state.sourceVideo?.textTracks ?? []).filter(
      (track) => ["subtitles", "captions"].includes(String(track.kind)),
    );
    if (tracks.some((track) => track.mode !== "disabled")) return;
    const track = tracks[0];
    if (!track) return;
    const changedTracks = (state.nativeSubtitleTracks ??= new Map());
    if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
    track.mode = "hidden";
  }

  function restoreNativeSubtitleModes() {
    if (subtitleEnabledOverride?.nativeControl) {
      state.nativeSubtitleTracks = null;
      selectedNativeTrack = null;
      nativeSecondaryTrack.clear();
      state.youtubeSubtitlesInitiallyEnabled = null;
      subtitleEnabledOverride = null;
      return;
    }
    for (const [track, mode] of state.nativeSubtitleTracks ?? []) {
      if (track.mode !== mode) track.mode = mode;
    }
    state.nativeSubtitleTracks = null;
    selectedNativeTrack = null;
    nativeSecondaryTrack.clear();

    const button = getYouTubeSubtitleButton();
    const initiallyEnabled = state.youtubeSubtitlesInitiallyEnabled;
    if (
      button &&
      initiallyEnabled !== null &&
      (button.getAttribute("aria-pressed") === "true") !== initiallyEnabled
    )
      button.click();
    state.youtubeSubtitlesInitiallyEnabled = null;
    subtitleEnabledOverride = null;
  }

  function syncNativeSubtitles() {
    if (!state.pipUi || (!state.subtitlessOn && !isNativeSecondaryActive()))
      return;
    if (IS_NETFLIX && isNetflixSecondaryTrackActive()) return;
    if (IS_HAHOW) pulseHahowCaptionClock();
    if (!state.subtitlessOn) {
      state.subtitleLines = [];
      renderSubtitle();
      return;
    }
    if (
      selectedNativeTrack &&
      !getSubtitleTracks().includes(selectedNativeTrack)
    )
      selectedNativeTrack = null;
    bilibiliSubtitles.requestTracks();
    bilibiliSubtitles.loadTrack(bilibiliSubtitles.primaryKey);
    if (renderBilibiliSubtitles()) return;
    if (syncYouTubePrimarySubtitleTimeline()) {
      syncSecondarySubtitleTimeline();
      return;
    }
    if (useNativeSubtitleTrack()) return;
    if (!selectedNativeTrack) {
      if (state.subtitleNode?.isConnected) {
        if (state.subtitleExtract)
          syncOverlaySubtitles(state.subtitleNode, state.subtitleExtract);
      } else if (
        Date.now() - state.lastSubtitleScan >=
        SUBTITLE_OVERLAY_SCAN_MS
      ) {
        refreshSubtitle(true);
      }
      return;
    }
    suppressNativeSubtitles();
    state.subtitleLines = getNativeSubtitleLines();
    renderSubtitle();
  }

  function pulseHahowCaptionClock() {
    const video = state.sourceVideo;
    const now = performance.now();
    if (!video || now - lastHahowCaptionPulse < HAHOW_CAPTION_PULSE_MS) return;
    lastHahowCaptionPulse = now;
    video.dispatchEvent(new Event("timeupdate", { bubbles: true }));
  }

  function showSecondarySubtitleFailure() {
    if (secondarySubtitleFailureShown) return;
    secondarySubtitleFailureShown = true;
    globalThis.PipCompanion.ContentFeedback.showFeedback(
      t("pipTranslationSecondaryUnavailable"),
    );
  }

  function fitSubtitlePairs(subtitle: HTMLElement) {
    if (!subtitle.isConnected || subtitle.hidden) return;
    const view = subtitle.ownerDocument.defaultView;
    if (!view) return;
    const subtitleStyle = view.getComputedStyle(subtitle);
    const availableWidth =
      subtitle.clientWidth -
      (Number.parseFloat(subtitleStyle.paddingLeft) || 0) -
      (Number.parseFloat(subtitleStyle.paddingRight) || 0);
    if (availableWidth <= 0) return;

    for (const pair of subtitle.querySelectorAll<HTMLElement>(
      ".subtitle-pair",
    )) {
      const lines = Array.from(pair.children).filter(
        (child): child is HTMLElement => child instanceof view.HTMLElement,
      );
      const fontSizes: number[] = [];
      let naturalWidth = 0;
      pair.classList.remove("subtitle-pair--wrapped");
      for (const line of lines) {
        line.classList.remove("subtitle-line--wrapped");
        line.style.removeProperty("--subtitle-fit-font-size");
        line.style.width = "max-content";
        line.style.maxWidth = "none";
        line.style.whiteSpace = "nowrap";
        naturalWidth = Math.max(
          naturalWidth,
          line.getBoundingClientRect().width,
        );
        const segment = line.querySelector<HTMLElement>(".subtitle-segment");
        fontSizes.push(
          segment
            ? Number.parseFloat(view.getComputedStyle(segment).fontSize)
            : 0,
        );
      }

      const scale =
        naturalWidth > availableWidth
          ? Math.max(MIN_SUBTITLE_FIT_SCALE, availableWidth / naturalWidth)
          : 1;
      lines.forEach((line, index) => {
        const fontSize = fontSizes[index] ?? 0;
        if (fontSize > 0)
          line.style.setProperty(
            "--subtitle-fit-font-size",
            `${fontSize * scale}px`,
          );
      });
      const scaledWidth = Math.max(
        0,
        ...lines.map((line) => line.getBoundingClientRect().width),
      );
      const needsWrapping = scaledWidth > availableWidth + 1;
      pair.classList.toggle("subtitle-pair--wrapped", needsWrapping);
      for (const line of lines) {
        line.style.removeProperty("width");
        line.style.removeProperty("max-width");
        line.style.removeProperty("white-space");
        line.classList.toggle("subtitle-line--wrapped", needsWrapping);
      }
    }
  }

  function observeSubtitleSize(subtitle: HTMLElement) {
    const target = subtitle.parentElement;
    if (
      target === subtitleFitObservedElement &&
      subtitle === subtitleFitObservedSubtitle
    )
      return;
    subtitleFitObserver?.disconnect();
    subtitleFitObserver = null;
    subtitleFitObservedElement = target;
    subtitleFitObservedSubtitle = subtitle;
    const ResizeObserverClass =
      subtitle.ownerDocument.defaultView?.ResizeObserver;
    if (!target || !ResizeObserverClass) return;
    subtitleFitObserver = new ResizeObserverClass(() =>
      scheduleSubtitleFit(subtitle),
    );
    subtitleFitObserver.observe(target);
  }

  function scheduleSubtitleFit(subtitle: HTMLElement) {
    subtitleFitPendingSubtitle = subtitle;
    if (subtitleFitFrame !== null) return;
    const view = subtitle.ownerDocument.defaultView;
    if (!view) return;
    const run = () => {
      subtitleFitFrame = null;
      const pendingSubtitle = subtitleFitPendingSubtitle;
      subtitleFitPendingSubtitle = null;
      if (pendingSubtitle) fitSubtitlePairs(pendingSubtitle);
    };
    subtitleFitFrame = view.requestAnimationFrame
      ? view.requestAnimationFrame(run)
      : view.setTimeout(run, 0);
  }

  function getRenderedSubtitleSignature(lines: RenderedSubtitleLine[]): string {
    return JSON.stringify({
      lines: lines.map((displayLine) => ({
        pairIndex: displayLine.pairIndex,
        role: displayLine.role,
        from: displayLine.line.from ?? null,
        to: displayLine.line.to ?? null,
        segments: displayLine.line.segments.map((segment) =>
          segment.text.replace(/\r?\n/g, " "),
        ),
      })),
      subtitleStyle: state.subtitleStyle,
      secondarySubtitleStyle: state.secondarySubtitleStyle,
      subtitleLayout: state.subtitleLayout,
    });
  }

  function stopSubtitleClockSync() {
    if (subtitleClockTimer === null) return;
    window.clearInterval(subtitleClockTimer);
    subtitleClockTimer = null;
  }

  function clearSubtitleEmptyTimer() {
    if (subtitleEmptyTimer === null) return;
    window.clearTimeout(subtitleEmptyTimer);
    subtitleEmptyTimer = null;
  }

  function syncOverlaySubtitles(node: HTMLElement, extract: SubtitleExtract) {
    if (!node.isConnected || state.subtitleNode !== node) return;
    const lines = extract(node);
    if (lines.length) {
      clearSubtitleEmptyTimer();
      state.subtitleLines = lines;
      renderSubtitle();
      return;
    }
    if (subtitleEmptyTimer !== null || state.subtitleLines.length === 0) {
      if (state.subtitleLines.length === 0) renderSubtitle();
      return;
    }
    subtitleEmptyTimer = window.setTimeout(() => {
      subtitleEmptyTimer = null;
      if (
        !state.subtitlessOn ||
        !node.isConnected ||
        state.subtitleNode !== node
      )
        return;
      const nextLines = extract(node);
      if (nextLines.length) {
        state.subtitleLines = nextLines;
        renderSubtitle();
        return;
      }
      state.subtitleLines = [];
      renderSubtitle();
    }, SUBTITLE_EMPTY_GRACE_MS);
  }

  function ensureSubtitleClockSync() {
    if (subtitleClockTimer !== null) return;
    subtitleClockTimer = window.setInterval(() => {
      if (!state.pipUi || !state.subtitlessOn) {
        stopSubtitleClockSync();
        return;
      }
      syncNativeSubtitles();
    }, 50);
  }

  function renderSubtitle() {
    if (!state.pipUi) return;
    const subtitle = state.pipUi.subtitle;
    if (!state.subtitlessOn) {
      if (!subtitle.hidden) subtitle.replaceChildren();
      subtitle.hidden = true;
      renderedSubtitleSignature = null;
      renderedSubtitleElement = null;
      return;
    }

    const seen = new Set<string>();
    const lines = state.subtitleLines.filter((line, index) => {
      const text = line.segments
        .map((segment) => segment.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .normalize("NFC")
        .toLowerCase();
      const timing =
        line.from !== undefined || line.to !== undefined
          ? `${line.from ?? ""}\u0000${line.to ?? ""}`
          : `untimed\u0000${index}`;
      const key = `${timing}\u0000${text}`;
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const displayLines = subtitleTranslation.getRenderedSubtitleLines(lines);
    if (!displayLines.length) {
      if (!subtitle.hidden) subtitle.replaceChildren();
      subtitle.hidden = true;
      renderedSubtitleSignature = null;
      renderedSubtitleElement = null;
      return;
    }

    const signature = getRenderedSubtitleSignature(displayLines);
    if (
      signature === renderedSubtitleSignature &&
      renderedSubtitleElement === subtitle &&
      !subtitle.hidden &&
      subtitle.children.length > 0
    )
      return;
    renderedSubtitleSignature = signature;
    renderedSubtitleElement = subtitle;

    globalThis.PipCompanion.subtitleSettings.apply(
      subtitle,
      state.subtitleStyle,
    );
    globalThis.PipCompanion.subtitleSettings.applyLayout(
      subtitle,
      state.subtitleLayout,
    );
    subtitle.hidden = false;
    const doc = subtitle.ownerDocument;
    const groups: { pairIndex: number; lines: RenderedSubtitleLine[] }[] = [];
    for (const displayLine of displayLines) {
      let group = groups.find(
        (candidate) => candidate.pairIndex === displayLine.pairIndex,
      );
      if (!group) {
        group = { pairIndex: displayLine.pairIndex, lines: [] };
        groups.push(group);
      }
      group.lines.push(displayLine);
    }

    const pairElements = Array.from(subtitle.children).filter(
      (element): element is HTMLDivElement =>
        element instanceof doc.defaultView!.HTMLElement &&
        element.classList.contains("subtitle-pair"),
    );
    while (pairElements.length < groups.length) {
      const pairEl = doc.createElement("div");
      pairEl.className = "subtitle-pair";
      subtitle.appendChild(pairEl);
      pairElements.push(pairEl);
    }
    while (pairElements.length > groups.length) {
      pairElements.pop()?.remove();
    }

    for (const [groupIndex, group] of groups.entries()) {
      const pairEl = pairElements[groupIndex]!;
      const lineElements = Array.from(pairEl.children).filter(
        (element): element is HTMLDivElement =>
          element instanceof doc.defaultView!.HTMLElement &&
          element.classList.contains("subtitle-line"),
      );
      while (lineElements.length < group.lines.length) {
        const lineEl = doc.createElement("div");
        lineEl.className = "subtitle-line";
        pairEl.appendChild(lineEl);
        lineElements.push(lineEl);
      }
      while (lineElements.length > group.lines.length) {
        lineElements.pop()?.remove();
      }
      for (const [lineIndex, displayLine] of group.lines.entries()) {
        const lineEl = lineElements[lineIndex]!;
        globalThis.PipCompanion.subtitleSettings.apply(
          lineEl,
          displayLine.role === "secondary"
            ? state.secondarySubtitleStyle
            : state.subtitleStyle,
        );
        const segments = displayLine.line.segments;
        while (lineEl.children.length > segments.length)
          lineEl.lastElementChild?.remove();
        for (const [segmentIndex, segment] of segments.entries()) {
          let segmentEl = lineEl.children[segmentIndex] as
            HTMLElement | undefined;
          if (!segmentEl) {
            segmentEl = doc.createElement("span");
            segmentEl.className = "subtitle-segment";
            lineEl.appendChild(segmentEl);
          }
          segmentEl.textContent = segment.text.replace(/\r?\n/g, " ");
        }
      }
    }

    observeSubtitleSize(subtitle);
    scheduleSubtitleFit(subtitle);
  }

  return {
    initializeSubtitlesOn,
    setNativeSubtitleVideo,
    setSubtitleEnabledOverride,
    setSubtitlesEnabledFromPipShortcut,
    onTranslationPreferencesChanged,
    onTranslationConfigChanged,
    cancelSubtitleInitialization,
    isSubtitleTranslationSuspended: () => subtitleTranslationSuspended,
    resumeSubtitleTranslation,
    hasSubtitleSource,
    getNativeSubtitleTracks,
    selectNativeSubtitleTrack,
    getSecondarySubtitleTracks,
    getSelectedSecondarySubtitleTrack,
    selectSecondarySubtitleTrack,
    refreshSubtitle,
    prepareNativeSubtitles,
    restoreNativeSubtitleModes,
    syncNativeSubtitles,
    renderSubtitle,
    suppressNativeSubtitles,
  };
})();
