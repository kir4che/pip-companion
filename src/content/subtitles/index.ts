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
  const HAHOW_CAPTION_PULSE_MS = 100;
  const MIN_SUBTITLE_FIT_SCALE = 0.85;
  const remoteSubtitleRequests =
    globalThis.PipCompanion.subtitleRemoteRequests.create({
      isYouTube: IS_YOUTUBE,
      isNetflix: IS_NETFLIX,
    });
  const remoteSubtitleRequestState = remoteSubtitleRequests.state;
  let selectedNativeTrack: TextTrack | null = null;
  let renderedSubtitleSignature: string | null = null;
  let renderedSubtitleElement: HTMLElement | null = null;
  const subtitleClock = globalThis.PipCompanion.subtitleClock.create({
    isActive: () => Boolean(state.pipUi && state.subtitlessOn),
    sync: () => syncNativeSubtitles(),
  });
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
  const nativeSubtitleModes =
    globalThis.PipCompanion.nativeSubtitleModes.create({
      getTracks: getSubtitleTracks,
      getChangedTracks: () => state.nativeSubtitleTracks,
      setChangedTracks: (tracks) => {
        state.nativeSubtitleTracks = tracks;
      },
      isNativeControlOverride: () =>
        subtitleEnabledOverride?.nativeControl === true,
      resetSelection: () => {
        selectedNativeTrack = null;
        nativeSecondaryTrack.clear();
      },
      getYouTubeSubtitleButton,
      getInitiallyEnabled: () => state.youtubeSubtitlesInitiallyEnabled,
      clearInitiallyEnabled: () => {
        state.youtubeSubtitlesInitiallyEnabled = null;
        subtitleEnabledOverride = null;
      },
    });
  const subtitleFitController =
    globalThis.PipCompanion.subtitleFitController.create({
      fit: (subtitle) =>
        globalThis.PipCompanion.subtitleFitting.fit(
          subtitle,
          MIN_SUBTITLE_FIT_SCALE,
        ),
    });
  let subtitleRefreshPending = false;
  let subtitleEmptyCount = 0;
  const nativeTrackIds = new WeakMap<TextTrack, string>();
  let nextNativeTrackId = 0;
  let subtitleInitializationPending = false;
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
        (IS_YOUTUBE &&
          remoteSubtitleRequestState.youtubeTracks.some(
            (track) => track.selected,
          )) ||
        (IS_NETFLIX &&
          remoteSubtitleRequestState.netflixTracks.some(
            (track) => track.selected,
          )) ||
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
    const previousPrimaryTrackKey =
      remoteSubtitleRequestState.youtubePrimaryTrackKey;
    const previousSecondaryTrackKey =
      remoteSubtitleRequestState.youtubeSecondaryTrackKey;
    remoteSubtitleRequestState.youtubeTracks = event.data.tracks.filter(
      globalThis.PipCompanion.subtitleTrackValidation.isYouTubeTrack,
    );
    updateYouTubePrimarySubtitleTrackKey();
    requestYouTubePrimarySubtitleCues();
    if (
      remoteSubtitleRequestState.youtubeSecondaryTrackKey &&
      !remoteSubtitleRequestState.youtubeTracks.some(
        (track) =>
          track.key === remoteSubtitleRequestState.youtubeSecondaryTrackKey &&
          !track.selected,
      )
    ) {
      remoteSubtitleRequestState.youtubeSecondaryTrackKey = "";
      remoteSubtitleRequestState.youtubeSecondaryCues = null;
      remoteSubtitleRequestState.youtubeSecondaryCueLoadedTrack = "";
      remoteSubtitleRequestState.youtubeSecondaryCuePendingTrack = "";
      remoteSubtitleRequestState.youtubeSecondaryCueRequestId++;
    } else if (remoteSubtitleRequestState.youtubeSecondaryTrackKey) {
      requestYouTubeSecondarySubtitleCues();
    }
    state.pipUi?.refreshSubtitleTracks();
    if (
      previousPrimaryTrackKey !==
        remoteSubtitleRequestState.youtubePrimaryTrackKey ||
      previousSecondaryTrackKey !==
        remoteSubtitleRequestState.youtubeSecondaryTrackKey
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
      event.data.requestId !==
        remoteSubtitleRequestState.youtubePrimaryCueRequestId ||
      event.data.key !== remoteSubtitleRequestState.youtubePrimaryTrackKey ||
      typeof event.data.ok !== "boolean" ||
      !Array.isArray(event.data.cues)
    )
      return;
    remoteSubtitleRequestState.youtubePrimaryCuePendingTrack = "";
    if (!event.data.ok) {
      refreshSubtitle(true);
      return;
    }
    remoteSubtitleRequestState.youtubePrimaryCues =
      globalThis.PipCompanion.subtitleCueData.parseYouTubeCues(event.data.cues);
    if (!remoteSubtitleRequestState.youtubePrimaryCues.length) {
      refreshSubtitle(true);
      return;
    }
    remoteSubtitleRequestState.youtubePrimaryCueLoadedTrack =
      remoteSubtitleRequestState.youtubePrimaryTrackKey;
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
      event.data.requestId !==
        remoteSubtitleRequestState.youtubeSecondaryCueRequestId ||
      event.data.key !== remoteSubtitleRequestState.youtubeSecondaryTrackKey ||
      typeof event.data.ok !== "boolean" ||
      !Array.isArray(event.data.cues)
    )
      return;
    remoteSubtitleRequestState.youtubeSecondaryCuePendingTrack = "";
    if (!event.data.ok) {
      showSecondarySubtitleFailure();
      return;
    }
    remoteSubtitleRequestState.youtubeSecondaryCues =
      globalThis.PipCompanion.subtitleCueData.parseYouTubeCues(event.data.cues);
    if (!remoteSubtitleRequestState.youtubeSecondaryCues.length) return;
    remoteSubtitleRequestState.youtubeSecondaryCueLoadedTrack =
      remoteSubtitleRequestState.youtubeSecondaryTrackKey;
    refreshSubtitle(true);
  });

  function requestYouTubeSubtitleTracks() {
    remoteSubtitleRequests.requestYouTubeTracks();
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
    return remoteSubtitleRequests.updateYouTubePrimaryTrackKey();
  }

  function requestYouTubePrimarySubtitleCues() {
    if (!state.pipUi || !state.subtitlessOn) return;
    remoteSubtitleRequests.requestYouTubePrimaryCues();
  }

  function requestYouTubeSecondarySubtitleCues() {
    remoteSubtitleRequests.requestYouTubeSecondaryCues();
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_NETFLIX_SUBTITLE_TRACKS" ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !==
        remoteSubtitleRequestState.netflixTrackRequestId ||
      !Array.isArray(event.data.tracks)
    )
      return;
    const nextNetflixSubtitleTracks = event.data.tracks.filter(
      globalThis.PipCompanion.subtitleTrackValidation.isNetflixTrack,
    );
    if (nextNetflixSubtitleTracks.length > 0)
      remoteSubtitleRequestState.netflixTracks = nextNetflixSubtitleTracks;
    const selectedTrack = remoteSubtitleRequestState.netflixTracks.find(
      (track) => track.selected,
    );
    const selectedTrackKey = selectedTrack?.key ?? "";
    const temporarySecondaryTrackKey =
      remoteSubtitleRequestState.netflixSecondaryCuePendingTrack;
    const selectedIsSecondaryTrack =
      selectedTrackKey === remoteSubtitleRequestState.netflixSecondaryTrackKey;
    if (
      selectedTrackKey !== temporarySecondaryTrackKey &&
      !selectedIsSecondaryTrack
    )
      remoteSubtitleRequestState.netflixPrimaryTrackKey = selectedTrackKey;
    if (
      !temporarySecondaryTrackKey &&
      !selectedIsSecondaryTrack &&
      (remoteSubtitleRequestState.netflixSecondaryTrackKey ===
        remoteSubtitleRequestState.netflixPrimaryTrackKey ||
        !remoteSubtitleRequestState.netflixTracks.some(
          (track) =>
            track.key === remoteSubtitleRequestState.netflixSecondaryTrackKey,
        ))
    ) {
      remoteSubtitleRequestState.netflixSecondaryTrackKey = "";
      remoteSubtitleRequestState.netflixSecondaryCues = null;
      remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack = "";
      remoteSubtitleRequestState.netflixSecondaryCuePendingTrack = "";
      remoteSubtitleRequestState.lastNetflixSecondaryCueRequest = 0;
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
    remoteSubtitleRequests.requestNetflixTracks(force);
  }

  function requestNetflixSecondarySubtitleCues() {
    remoteSubtitleRequests.requestNetflixSecondaryCues();
  }

  function isNetflixSecondaryTrackActive(): boolean {
    return remoteSubtitleRequests.isNetflixSecondaryActive();
  }

  window.addEventListener("message", (event: MessageEvent<unknown>) => {
    if (
      event.source !== window ||
      event.origin !== location.origin ||
      !globalThis.PipCompanion.util.isRecord(event.data) ||
      event.data.type !== "PIP_NETFLIX_SUBTITLE_CUES" ||
      typeof event.data.requestId !== "number" ||
      event.data.requestId !==
        remoteSubtitleRequestState.netflixSecondaryCueRequestId ||
      event.data.key !== remoteSubtitleRequestState.netflixSecondaryTrackKey ||
      !Array.isArray(event.data.cues)
    )
      return;
    remoteSubtitleRequestState.netflixSecondaryCuePendingTrack = "";
    const cues = event.data.cues.flatMap((cue) => {
      const parsed = globalThis.PipCompanion.subtitleCueData.parseTimedCue(cue);
      return parsed ? [parsed] : [];
    });
    if (event.data.restored !== true) {
      remoteSubtitleRequestState.netflixSecondaryCues = null;
      remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack = "";
      remoteSubtitleRequestState.lastNetflixSecondaryCueRequest = 0;
      requestNetflixSubtitleTracks(true);
      if (
        remoteSubtitleRequestState.netflixSecondaryCueRetryCount < 3 &&
        remoteSubtitleRequestState.netflixSecondaryCueRetryTimer === null
      ) {
        remoteSubtitleRequestState.netflixSecondaryCueRetryCount++;
        remoteSubtitleRequestState.netflixSecondaryCueRetryTimer =
          window.setTimeout(() => {
            remoteSubtitleRequestState.netflixSecondaryCueRetryTimer = null;
            requestNetflixSecondarySubtitleCues();
          }, 150);
      } else if (remoteSubtitleRequestState.netflixSecondaryCueRetryCount >= 3)
        showSecondarySubtitleFailure();
    } else {
      remoteSubtitleRequestState.netflixSecondaryCues = cues;
      remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack =
        remoteSubtitleRequestState.netflixSecondaryTrackKey;
      remoteSubtitleRequestState.netflixSecondaryCueRetryCount = 0;
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
    return globalThis.PipCompanion.subtitleCueData.getActiveLines(
      cues,
      currentTime,
    );
  }

  function syncYouTubePrimarySubtitleTimeline(): boolean {
    if (!IS_YOUTUBE || !state.pipUi || !state.subtitlessOn) return false;
    const track = remoteSubtitleRequestState.youtubeTracks.find(
      (item) => item.selected,
    );
    const key = updateYouTubePrimarySubtitleTrackKey();
    if (!key || !track?.canLoadCues) return false;
    if (remoteSubtitleRequestState.youtubePrimaryCueLoadedTrack !== key) {
      requestYouTubePrimarySubtitleCues();
      return false;
    }

    state.subtitleObserver?.disconnect();
    state.subtitleObserver = null;
    state.subtitleNode = null;
    state.subtitleExtract = null;
    const lines = getTimedSubtitleLines(
      remoteSubtitleRequestState.youtubePrimaryCues,
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
    if (IS_NETFLIX && remoteSubtitleRequestState.netflixTracks.length)
      return globalThis.PipCompanion.subtitleTrackOptions.netflixPrimary(
        remoteSubtitleRequestState.netflixTracks,
        remoteSubtitleRequestState.netflixPrimaryTrackKey,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
      );

    if (IS_YOUTUBE && remoteSubtitleRequestState.youtubeTracks.length)
      return globalThis.PipCompanion.subtitleTrackOptions.youtubePrimary(
        remoteSubtitleRequestState.youtubeTracks,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
      );

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
    const nativeOptions =
      globalThis.PipCompanion.subtitleTrackOptions.nativePrimary(
        tracks,
        selectedTrack,
        getNativeTrackId,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
      );
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
    if (IS_YOUTUBE)
      return globalThis.PipCompanion.subtitleTrackOptions.youtubeSecondary(
        remoteSubtitleRequestState.youtubeTracks,
        remoteSubtitleRequestState.youtubeSecondaryTrackKey,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
      );
    if (IS_NETFLIX)
      return globalThis.PipCompanion.subtitleTrackOptions.netflixSecondary(
        remoteSubtitleRequestState.netflixTracks,
        remoteSubtitleRequestState.netflixPrimaryTrackKey,
        remoteSubtitleRequestState.netflixSecondaryTrackKey,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
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
    const nativeTracks =
      globalThis.PipCompanion.subtitleTrackOptions.nativeSecondary(
        tracks,
        primaryTrack,
        nativeSecondaryTrack.getTrack(),
        getNativeTrackId,
        (index) => t("pipSubtitleTrackNumber", String(index + 1)),
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
      return remoteSubtitleRequestState.youtubeSecondaryTrackKey
        ? `youtube:${remoteSubtitleRequestState.youtubeSecondaryTrackKey}`
        : "";
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return `bilibili:${bilibiliSubtitles.secondaryKey}`;
    if (IS_NETFLIX && remoteSubtitleRequestState.netflixSecondaryTrackKey)
      return `netflix:${remoteSubtitleRequestState.netflixSecondaryTrackKey}`;
    const track = nativeSecondaryTrack.getTrack();
    return track ? getNativeTrackId(track) : "";
  }

  function selectSecondarySubtitleTrack(id: string) {
    if (IS_YOUTUBE && id.startsWith("youtube:")) {
      const key = id.slice("youtube:".length);
      if (
        !remoteSubtitleRequestState.youtubeTracks.some(
          (track) => track.key === key && !track.selected && track.canLoadCues,
        )
      )
        return;
      remoteSubtitleRequestState.youtubeSecondaryTrackKey = key;
      remoteSubtitleRequestState.youtubeSecondaryCues = null;
      remoteSubtitleRequestState.youtubeSecondaryCueLoadedTrack = "";
      remoteSubtitleRequestState.youtubeSecondaryCuePendingTrack = "";
      remoteSubtitleRequestState.youtubeSecondaryCueRequestId++;
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
        key === remoteSubtitleRequestState.netflixPrimaryTrackKey ||
        !remoteSubtitleRequestState.netflixTracks.some(
          (track) => track.key === key,
        )
      )
        return;
      remoteSubtitleRequestState.netflixSecondaryTrackKey = key;
      remoteSubtitleRequestState.netflixSecondaryCues = null;
      remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack = "";
      remoteSubtitleRequestState.netflixSecondaryCuePendingTrack = "";
      remoteSubtitleRequestState.lastNetflixSecondaryCueRequest = 0;
      remoteSubtitleRequestState.netflixSecondaryCueRequestId++;
      if (remoteSubtitleRequestState.netflixSecondaryCueRetryTimer !== null) {
        window.clearTimeout(
          remoteSubtitleRequestState.netflixSecondaryCueRetryTimer,
        );
        remoteSubtitleRequestState.netflixSecondaryCueRetryTimer = null;
      }
      remoteSubtitleRequestState.netflixSecondaryCueRetryCount = 0;
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

  const subtitleLanguagesMatch =
    globalThis.PipCompanion.subtitleLanguageTags.matchesSubtitleLanguages;

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
      if (
        !remoteSubtitleRequestState.netflixTracks.some(
          (track) => track.key === key,
        )
      )
        return;
      preserveSubtitleEnabledOverride();
      remoteSubtitleRequestState.netflixPrimaryTrackKey = key;
      if (remoteSubtitleRequestState.netflixSecondaryTrackKey === key) {
        remoteSubtitleRequestState.netflixSecondaryTrackKey = "";
        remoteSubtitleRequestState.netflixSecondaryCues = null;
        remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack = "";
        remoteSubtitleRequestState.netflixSecondaryCuePendingTrack = "";
        remoteSubtitleRequestState.lastNetflixSecondaryCueRequest = 0;
        remoteSubtitleRequestState.netflixSecondaryCueRequestId++;
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
      if (
        !remoteSubtitleRequestState.youtubeTracks.some(
          (track) => track.key === key,
        )
      )
        return;
      preserveSubtitleEnabledOverride();
      for (const track of remoteSubtitleRequestState.youtubeTracks)
        track.selected = track.key === key;
      if (remoteSubtitleRequestState.youtubeSecondaryTrackKey === key) {
        remoteSubtitleRequestState.youtubeSecondaryTrackKey = "";
        remoteSubtitleRequestState.youtubeSecondaryCues = null;
        remoteSubtitleRequestState.youtubeSecondaryCueLoadedTrack = "";
        remoteSubtitleRequestState.youtubeSecondaryCuePendingTrack = "";
        remoteSubtitleRequestState.youtubeSecondaryCueRequestId++;
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
    nativeSubtitleModes.disableAllExcept(nativeSecondaryTrack.getTrack());
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
    remoteSubtitleRequests.reset();
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
    return globalThis.PipCompanion.genericSubtitleOverlayDetection.findNode(
      document,
      getComputedStyle,
      window.innerHeight,
    );
  }

  function extractOverlayLines(node: HTMLElement | null) {
    return node
      ? globalThis.PipCompanion.subtitleCueData.extractOverlayLines(
          node.innerText || "",
        )
      : [];
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
      const key = remoteSubtitleRequestState.youtubeSecondaryTrackKey;
      if (!key) return [];
      if (remoteSubtitleRequestState.youtubeSecondaryCueLoadedTrack !== key) {
        requestYouTubeSecondarySubtitleCues();
        return [];
      }
      const currentTime = state.sourceVideo?.currentTime ?? 0;
      return getTimedSubtitleLines(
        remoteSubtitleRequestState.youtubeSecondaryCues,
        currentTime,
      );
    }
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey) {
      return getTimedSubtitleLines(
        bilibiliSubtitles.secondaryCues,
        state.sourceVideo?.currentTime ?? 0,
      );
    }
    if (IS_NETFLIX && remoteSubtitleRequestState.netflixSecondaryTrackKey) {
      if (
        remoteSubtitleRequestState.netflixSecondaryCueLoadedTrack !==
        remoteSubtitleRequestState.netflixSecondaryTrackKey
      ) {
        requestNetflixSecondarySubtitleCues();
        return [];
      }
      return getTimedSubtitleLines(
        remoteSubtitleRequestState.netflixSecondaryCues,
        state.sourceVideo?.currentTime ?? 0,
      );
    }
    return nativeSecondaryTrack.getLines(state.sourceVideo?.currentTime ?? 0);
  }

  function getPreferNativeSecondaryTrackLanguage(): string {
    if (IS_YOUTUBE)
      return (
        remoteSubtitleRequestState.youtubeTracks.find(
          (track) =>
            track.key === remoteSubtitleRequestState.youtubeSecondaryTrackKey,
        )?.language ?? ""
      );
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return (
        bilibiliSubtitles.tracks.find(
          (track) => track.key === bilibiliSubtitles.secondaryKey,
        )?.language ?? ""
      );
    if (IS_NETFLIX && remoteSubtitleRequestState.netflixSecondaryTrackKey)
      return (
        remoteSubtitleRequestState.netflixTracks.find(
          (track) =>
            track.key === remoteSubtitleRequestState.netflixSecondaryTrackKey,
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

    if (IS_YOUTUBE)
      return Boolean(remoteSubtitleRequestState.youtubeSecondaryTrackKey);
    if (IS_BILIBILI && bilibiliSubtitles.secondaryKey)
      return bilibiliSubtitles.tracks.some(
        (track) => track.key === bilibiliSubtitles.secondaryKey,
      );
    if (IS_NETFLIX)
      return remoteSubtitleRequestState.netflixTracks.some(
        (track) =>
          track.key === remoteSubtitleRequestState.netflixSecondaryTrackKey,
      );
    return nativeSecondaryTrack.hasTrack();
  }

  function suppressNativeSubtitles() {
    if (IS_HAHOW || state.subtitleNode || !state.videoStash) return;
    nativeSubtitleModes.suppress();
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
    nativeSubtitleModes.restore();
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

  function observeSubtitleSize(subtitle: HTMLElement) {
    subtitleFitController.observe(subtitle);
  }

  function scheduleSubtitleFit(subtitle: HTMLElement) {
    subtitleFitController.schedule(subtitle);
  }

  function stopSubtitleClockSync() {
    subtitleClock.stop();
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
    subtitleClock.ensure();
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

    const lines = globalThis.PipCompanion.subtitleCueData.deduplicateLines(
      state.subtitleLines,
    );

    const displayLines = subtitleTranslation.getRenderedSubtitleLines(lines);
    if (!displayLines.length) {
      if (!subtitle.hidden) subtitle.replaceChildren();
      subtitle.hidden = true;
      renderedSubtitleSignature = null;
      renderedSubtitleElement = null;
      return;
    }

    const signature =
      globalThis.PipCompanion.subtitleCueData.getRenderedSignature(
        displayLines,
        state.subtitleStyle,
        state.secondarySubtitleStyle,
        state.subtitleLayout,
      );
    if (
      signature === renderedSubtitleSignature &&
      renderedSubtitleElement === subtitle &&
      !subtitle.hidden &&
      subtitle.children.length > 0
    )
      return;
    renderedSubtitleSignature = signature;
    renderedSubtitleElement = subtitle;

    if (
      !globalThis.PipCompanion.subtitleRendering.render(
        subtitle,
        displayLines,
        state.subtitleStyle,
        state.secondarySubtitleStyle,
        state.subtitleLayout,
      )
    ) {
      renderedSubtitleSignature = null;
      renderedSubtitleElement = null;
      return;
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
