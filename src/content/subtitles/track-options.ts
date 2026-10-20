"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTrackOptions = {
  nativePrimary(
    tracks: TextTrack[],
    selectedTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.map((track, i) => ({
      id: getId(track),
      index: i,
      label: track.label.trim() || track.language.trim() || getLabel(i),
      language: track.language,
      selected: track === selectedTrack,
    }));
  },
  nativeSecondary(
    tracks: TextTrack[],
    primaryTrack: TextTrack | null,
    secondaryTrack: TextTrack | null,
    getId: (track: TextTrack) => string,
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.flatMap((track, i) =>
      track === primaryTrack
        ? []
        : [
            {
              id: getId(track),
              index: i,
              label: track.label.trim() || track.language.trim() || getLabel(i),
              language: track.language,
              selected: track === secondaryTrack,
            },
          ],
    );
  },
  youtubePrimary(
    tracks: YouTubeSubtitleTrack[],
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[] {
    return tracks.map((track, i) => ({
      id: `youtube:${track.key}`,
      index: i,
      label: track.label || getLabel(i),
      language: track.language,
      selected: track.selected,
    }));
  },
  netflixPrimary(
    tracks: NetflixSubtitleTrack[],
    selectedKey: string,
    getLabel: (i: number) => string,
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
    getLabel: (i: number) => string,
  ): SubtitleTrackOption[] {
    const primaryKey = tracks.find((track) => track.selected)?.key;
    return tracks.flatMap((track, i) =>
      track.key === primaryKey || !track.canLoadCues
        ? []
        : [
            {
              id: `youtube:${track.key}`,
              index: i,
              label: track.label || getLabel(i),
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
    getLabel: (i: number) => string,
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
