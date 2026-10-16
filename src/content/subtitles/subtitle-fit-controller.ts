"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleFitController = {
  create(options) {
    let observedElement: HTMLElement | null = null;
    let observedSubtitle: HTMLElement | null = null;
    let observer: ResizeObserver | null = null;
    let frame: number | null = null;
    let pendingSubtitle: HTMLElement | null = null;

    const schedule = (subtitle: HTMLElement) => {
      pendingSubtitle = subtitle;
      if (frame !== null) return;
      const view = subtitle.ownerDocument.defaultView;
      if (!view) return;
      const run = () => {
        frame = null;
        const pending = pendingSubtitle;
        pendingSubtitle = null;
        if (pending) options.fit(pending);
      };
      frame = view.requestAnimationFrame
        ? view.requestAnimationFrame(run)
        : view.setTimeout(run, 0);
    };

    return {
      observe(subtitle: HTMLElement) {
        const target = subtitle.parentElement;
        if (target === observedElement && subtitle === observedSubtitle) return;
        observer?.disconnect();
        observer = null;
        observedElement = target;
        observedSubtitle = subtitle;
        const ResizeObserverClass =
          subtitle.ownerDocument.defaultView?.ResizeObserver;
        if (!target || !ResizeObserverClass) return;
        observer = new ResizeObserverClass(() => schedule(subtitle));
        observer.observe(target);
      },
      schedule,
    };
  },
};
