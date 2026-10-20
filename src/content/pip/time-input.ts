"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.pipTimeInput = {
  create(options) {
    const { input, eventScope } = options;
    let focusText = "";

    const setValue = (text: string) => {
      input.value = text;
      input.size = Math.max(4, text.length);
    };
    const render = () => {
      const video = options.getVideo();
      setValue(options.formatTime(video?.currentTime ?? 0));
    };
    const commit = (): boolean => {
      if (input.value.trim() === focusText) return true;
      const video = options.getVideo();
      const seconds = options.parseTime(input.value);
      if (!video || seconds === null) {
        options.showInvalid();
        return false;
      }
      const duration = video.duration;
      const target =
        Number.isFinite(duration) && duration > 0
          ? Math.max(0, Math.min(duration, seconds))
          : Math.max(0, seconds);
      options.seek(video, target);
      const text = options.formatTime(target);
      focusText = text;
      setValue(text);
      return true;
    };

    eventScope.listen(input, "click", () => input.select());
    eventScope.listen(input, "focus", () => {
      render();
      focusText = input.value;
      input.select();
    });
    eventScope.listen(input, "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && commit()) input.blur();
      else if (e.key === "Escape") {
        render();
        focusText = input.value;
        input.blur();
      }
    });
    eventScope.listen(input, "blur", () => {
      if (!commit()) {
        render();
        focusText = input.value;
      }
    });

    return { render };
  },
};
