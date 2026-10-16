"use strict";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTrackValidation = {
  isYouTubeTrack(value: unknown): value is YouTubeSubtitleTrack {
    return (
      isRecord(value) &&
      typeof value.key === "string" &&
      typeof value.label === "string" &&
      typeof value.language === "string" &&
      typeof value.selected === "boolean" &&
      typeof value.canLoadCues === "boolean"
    );
  },
  isNetflixTrack(value: unknown): value is NetflixSubtitleTrack {
    return (
      isRecord(value) &&
      typeof value.key === "string" &&
      typeof value.index === "number" &&
      Number.isInteger(value.index) &&
      value.index >= 0 &&
      typeof value.label === "string" &&
      typeof value.language === "string" &&
      typeof value.selected === "boolean"
    );
  },
};
