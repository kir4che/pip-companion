"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.NativeSecondarySubtitleTrack = (() => {
  interface Options {
    rememberMode(track: TextTrack): void;
    onChange(): void;
  }

  interface Controller {
    setVideo(video: HTMLVideoElement | null): void;
    getTrack(): TextTrack | null;
    hasTrack(): boolean;
    select(track: TextTrack, primary: TextTrack | null): boolean;
    activate(): void;
    clear(disable?: boolean): void;
    getLines(currentTime: number): SubtitleLine[];
  }

  function create(options: Options): Controller {
    let video: HTMLVideoElement | null = null;
    let track: TextTrack | null = null;
    let lastSignature: string | null = null;

    const getTracks = () =>
      globalThis.PipCompanion.standardTextTrack.getTracks(video);

    const getTrack = () => {
      if (track && !getTracks().includes(track)) clear();
      return track;
    };

    const getLines = (currentTime: number) => {
      const selected = getTrack();
      if (!selected) return [];
      return globalThis.PipCompanion.standardTextTrack.getActiveLines(
        video,
        selected,
        currentTime,
      );
    };

    const sync = () => {
      if (!getTrack()) return;
      const currentTime = video?.currentTime ?? 0;
      const lines = getLines(currentTime);
      const signature = lines
        .map((line) => line.segments.map((segment) => segment.text).join(""))
        .join("\u0000");
      if (signature === lastSignature) return;
      lastSignature = signature;
      options.onChange();
    };

    const onCueChange = () => sync();

    const setVideo = (nextVideo: HTMLVideoElement | null) => {
      if (video === nextVideo) return;
      video?.removeEventListener("timeupdate", sync);
      video?.removeEventListener("seeked", sync);
      track?.removeEventListener("cuechange", onCueChange);
      video = nextVideo;
      track = null;
      lastSignature = null;
      video?.addEventListener("timeupdate", sync);
      video?.addEventListener("seeked", sync);
    };

    const clear = (disable = false) => {
      const previous = track;
      track = null;
      lastSignature = null;
      previous?.removeEventListener("cuechange", onCueChange);
      if (disable && previous && previous.mode !== "disabled") {
        options.rememberMode(previous);
        previous.mode = "disabled";
      }
    };

    const activate = () => {
      const selected = getTrack();
      if (!selected || selected.mode === "hidden") return;
      options.rememberMode(selected);
      selected.mode = "hidden";
      sync();
    };

    return {
      setVideo,
      getTrack,
      hasTrack: () => Boolean(getTrack()),
      select(selected, primary) {
        if (!getTracks().includes(selected) || selected === primary)
          return false;
        const previous = getTrack();
        if (previous !== selected) {
          clear(previous !== primary);
          track = selected;
          selected.addEventListener("cuechange", onCueChange);
          lastSignature = null;
        }
        options.rememberMode(selected);
        selected.mode = "hidden";
        sync();
        return true;
      },
      activate,
      clear,
      getLines,
    };
  }

  return { create };
})();
