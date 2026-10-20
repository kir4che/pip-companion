"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.nativeSubtitleModes = {
  create(options) {
    const remember = (track: TextTrack) => {
      const changedTracks = options.getChangedTracks() ?? new Map();
      if (!changedTracks.has(track)) changedTracks.set(track, track.mode);
      options.setChangedTracks(changedTracks);
    };

    return {
      suppress() {
        for (const track of options.getTracks()) {
          if (
            track.kind === "metadata" ||
            track.kind === "chapters" ||
            track.mode !== "showing"
          )
            continue;
          remember(track);
          track.mode = "hidden";
        }
      },
      disableAllExcept(excludedTrack: TextTrack | null) {
        for (const track of options.getTracks()) {
          if (!["subtitles", "captions"].includes(String(track.kind))) continue;
          remember(track);
          if (track !== excludedTrack) track.mode = "disabled";
        }
      },
      restore() {
        for (const [track, mode] of options.getChangedTracks() ?? []) {
          if (track.mode !== mode) track.mode = mode;
        }
        options.setChangedTracks(null);
        options.resetSelection();

        const button = options.getYouTubeSubtitleButton();
        const initiallyEnabled = options.getInitiallyEnabled();
        if (
          button &&
          initiallyEnabled !== null &&
          (button.getAttribute("aria-pressed") === "true") !== initiallyEnabled
        )
          button.click();
        options.clearInitiallyEnabled();
      },
    };
  },
};
