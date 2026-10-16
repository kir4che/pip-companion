"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTrackOptions = {
  nativePrimary(
    tracks: TextTrack[],
    selectedTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.map((track, index) => ({
      id: getId(track),
      index,
      label: track.label.trim() || track.language.trim() || getLabel(index),
      language: track.language,
      selected: track === selectedTrack,
    }));
  },
  nativeSecondary(
    tracks: TextTrack[],
    primaryTrack: TextTrack | null,
    secondaryTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.flatMap((track, index) =>
      track === primaryTrack
        ? []
        : [
            {
              id: getId(track),
              index,
              label:
                track.label.trim() || track.language.trim() || getLabel(index),
              language: track.language,
              selected: track === secondaryTrack,
            },
          ],
    );
  },
  youtubePrimary(
    tracks: YouTubeSubtitleTrack[],
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.map((track, index) => ({
      id: `youtube:${track.key}`,
      index,
      label: track.label || getLabel(index),
      language: track.language,
      selected: track.selected,
    }));
  },
  netflixPrimary(
    tracks: NetflixSubtitleTrack[],
    selectedKey: string,
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.map((track) => ({
      id: `netflix:${track.key}`,
      index: track.index,
      label: track.label || getLabel(track.index),
      language: track.language,
      selected: track.key === selectedKey,
    }));
  },
  youtubeSecondary(
    tracks: YouTubeSubtitleTrack[],
    secondaryKey: string,
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    const primaryKey = tracks.find((track) => track.selected)?.key;
    return tracks.flatMap((track, index) =>
      track.key === primaryKey || !track.canLoadCues
        ? []
        : [
            {
              id: `youtube:${track.key}`,
              index,
              label: track.label || getLabel(index),
              language: track.language,
              selected: track.key === secondaryKey,
            },
          ],
    );
  },
  netflixSecondary(
    tracks: NetflixSubtitleTrack[],
    primaryKey: string,
    secondaryKey: string,
    getLabel: (index: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.flatMap((track) =>
      track.key === primaryKey
        ? []
        : [
            {
              id: `netflix:${track.key}`,
              index: track.index,
              label: track.label || getLabel(track.index),
              language: track.language,
              selected: track.key === secondaryKey,
            },
          ],
    );
  },
};
