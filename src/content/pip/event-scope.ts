"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.PipEventScope = {
  create(win) {
    const listeners: {
      target: EventTarget;
      type: string;
      listener: EventListenerOrEventListenerObject;
      options: boolean | AddEventListenerOptions | undefined;
    }[] = [];
    const timers = new Set<number>();

    return {
      listen(target, type, listener, options) {
        target.addEventListener(type, listener, options);
        listeners.push({ target, type, listener, options });
      },
      setTimeout(handler, timeout) {
        const timer = win.setTimeout(() => {
          timers.delete(timer);
          handler();
        }, timeout);
        timers.add(timer);
        return timer;
      },
      clearTimeout(timer) {
        win.clearTimeout(timer);
        timers.delete(timer);
      },
      dispose() {
        for (const { target, type, listener, options } of listeners)
          target.removeEventListener(type, listener, options);
        for (const timer of timers) win.clearTimeout(timer);
        listeners.length = 0;
        timers.clear();
      },
    };
  },
};
