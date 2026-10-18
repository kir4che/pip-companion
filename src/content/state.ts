"use strict";

/* eslint-disable @typescript-eslint/no-unused-vars */

const contentSiteUtils = globalThis.PipCompanion.site;
const IS_YOUTUBE = contentSiteUtils.isYouTubeHost(location.hostname);
const IS_BILIBILI = contentSiteUtils.isBilibiliHost(location.hostname);
const IS_TWITCH = contentSiteUtils.isTwitchHost(location.hostname);
const IS_BAHAMUT = contentSiteUtils.isBahamutHost(location.hostname);

const {
  SHORTCUT_DEFAULTS,
  SHORTCUT_KEYS,
  DEFAULT_SEEK_SECONDS,
  normalizeSeekSeconds,
  normalizeShortcut,
  matchesShortcut,
} = globalThis.PipCompanion.util;
const subtitleSettings = globalThis.PipCompanion.subtitleSettings;
const subtitleTranslationSettings =
  globalThis.PipCompanion.subtitleTranslationSettings;

const state: State = {
  shortcuts: { ...SHORTCUT_DEFAULTS },
  commentsEnabled: true,
  screenshotEnabled: true,
  danmakuEnabled: true,
  thumbnailPreviewEnabled: true,
  followPlaybackPip: true,
  pauseOnPipClose: true,
  seekSeconds: DEFAULT_SEEK_SECONDS,
  lastNonOneRate: 1.25,
  sourceVideo: null,
  sourceAbort: null,
  videoStash: null,
  nativeSubtitleTracks: null,
  youtubeSubtitlesInitiallyEnabled: null,
  pipSession: { phase: "closed" },
  get pipWindow() {
    const session = this.pipSession;
    return session.phase === "waiting" ||
      (session.phase === "active" && "window" in session)
      ? session.window
      : null;
  },
  get pipUi() {
    const session = this.pipSession;
    return session.phase === "active" && "ui" in session ? session.ui : null;
  },
  globalPipOpen: false,
  globalPipSourcePlaying: true,
  pipHandoffPending: false,
  subtitleNode: null,
  subtitleExtract: null,
  subtitleObserver: null,
  subtitleLines: [],
  subtitleStyle: { ...subtitleSettings.DEFAULTS },
  secondarySubtitleStyle: { ...subtitleSettings.SECONDARY_DEFAULTS },
  subtitleLayout: { ...subtitleSettings.LAYOUT_DEFAULTS },
  subtitleTranslationPreferences: {
    ...subtitleTranslationSettings.DEFAULT_PREFERENCES,
  },
  subtitlessOn: false,
  feedbackTimer: 0,
  lastDeepScan: 0,
  deepVideoCache: null,
  lastSubtitleScan: 0,
  pageToastEl: null,
  pageToastTimer: 0,
  nextControlCacheAt: 0,
  nextControlCache: null,
  nextClickTimer: 0,
  nextClickPending: false,
  nextVideoRequested: false,
  nextPlaybackState: null,
  nextVideoSourceKey: "",
  scanTimer: 0,
};
