"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.pipRangeControls = {
  create(options) {
    options.eventScope.listen(options.volumeSlider, "input", () =>
      options.setVolume(
        Number(options.volumeSlider.value),
        Number(options.volumeSlider.value) > 0,
      ),
    );
    options.eventScope.listen(options.speedSlider, "input", () => {
      const video = options.getVideo();
      if (!video) return;
      options.cancelNextPlaybackRestore();
      video.playbackRate = Number(options.speedSlider.value);
      options.update();
      options.showSpeedFeedback();
    });
    const releaseRangeFocus = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      (e.currentTarget as HTMLInputElement).blur();
    };
    for (const slider of [options.volumeSlider, options.speedSlider]) {
      options.eventScope.listen(slider, "pointerup", releaseRangeFocus);
      options.eventScope.listen(slider, "pointercancel", releaseRangeFocus);
      options.eventScope.listen(
        slider,
        "lostpointercapture",
        releaseRangeFocus,
      );
    }
  },
};
