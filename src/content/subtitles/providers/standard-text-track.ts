"use strict";

const standardTextTrackProvider: StandardTextTrackProvider = (() => {
  function getTracks(video: HTMLVideoElement | null): TextTrack[] {
    return Array.from(video?.textTracks ?? []).filter(
      (track) => track.kind === "subtitles" || track.kind === "captions",
    );
  }

  function getSelectedTrack(
    video: HTMLVideoElement | null,
    preferred: TextTrack | null,
  ): TextTrack | null {
    const tracks = getTracks(video);
    if (preferred && tracks.includes(preferred)) return preferred;
    return (
      tracks.find((track) => track.mode === "showing") ??
      tracks.find((track) => track.mode === "hidden") ??
      null
    );
  }

  function getCueText(cue: TextTrackCue): string {
    const text = (cue as TextTrackCue & { text?: unknown }).text;
    return typeof text === "string"
      ? text.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, "")
      : "";
  }

  function cueLines(cues: Iterable<TextTrackCue>): SubtitleLine[] {
    const lines: SubtitleLine[] = [];
    for (const cue of cues) {
      const text = getCueText(cue).replace(/\r?\n/g, " ").trim();
      if (!text) continue;
      lines.push({
        segments: [{ text }],
        ...(Number.isFinite(cue.startTime) ? { from: cue.startTime } : {}),
        ...(Number.isFinite(cue.endTime) ? { to: cue.endTime } : {}),
      });
    }
    return lines;
  }

  function getLines(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): SubtitleLine[] {
    const tracks = selected ? [selected] : getTracks(video);
    return tracks
      .filter((track) => track.mode === "showing" || track.mode === "hidden")
      .flatMap((track) => cueLines(track.activeCues ?? []));
  }

  function getActiveLines(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    currentTime: number,
  ): SubtitleLine[] {
    if (!getTracks(video).includes(selected)) return [];
    const activeCues = Array.from(selected.activeCues ?? []).filter(
      (cue) => cue.startTime <= currentTime && currentTime < cue.endTime,
    );
    if (activeCues.length) return cueLines(activeCues);
    const currentCues = Array.from(selected.cues ?? []).filter(
      (cue) =>
        cue.startTime <= currentTime &&
        currentTime < cue.endTime &&
        cue.endTime > cue.startTime,
    );
    return cueLines(currentCues);
  }

  function getTimedCues(
    video: HTMLVideoElement | null,
    selected: TextTrack | null,
  ): TimedSubtitleCue[] {
    if (!selected || !getTracks(video).includes(selected)) return [];
    return Array.from(selected.cues ?? []).flatMap((cue) => {
      const content = getCueText(cue).trim();
      return content &&
        Number.isFinite(cue.startTime) &&
        Number.isFinite(cue.endTime) &&
        cue.endTime > cue.startTime
        ? [{ from: cue.startTime, to: cue.endTime, content }]
        : [];
    });
  }

  function selectTrack(
    video: HTMLVideoElement | null,
    selected: TextTrack,
    beforeChange: (track: TextTrack) => void,
  ): boolean {
    const tracks = getTracks(video);
    if (!tracks.includes(selected)) return false;
    for (const track of tracks) {
      beforeChange(track);
      track.mode = track === selected ? "hidden" : "disabled";
    }
    return true;
  }

  return {
    getTracks,
    getSelectedTrack,
    getLines,
    getActiveLines,
    getTimedCues,
    selectTrack,
  };
})();

globalThis.PipCompanion.standardTextTrack = standardTextTrackProvider;
