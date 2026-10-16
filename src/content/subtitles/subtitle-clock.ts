"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleClock = {
  create(options) {
    let timer: number | null = null;

    const stop = () => {
      if (timer === null) return;
      window.clearInterval(timer);
      timer = null;
    };

    return {
      ensure() {
        if (timer !== null) return;
        timer = window.setInterval(() => {
          if (!options.isActive()) {
            stop();
            return;
          }
          options.sync();
        }, 50);
      },
      stop,
    };
  },
};
