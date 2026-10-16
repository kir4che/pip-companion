"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleFitting = {
  fit(subtitle: HTMLElement, minimumScale: number): void {
    if (!subtitle.isConnected || subtitle.hidden) return;
    const view = subtitle.ownerDocument.defaultView;
    if (!view) return;
    const subtitleStyle = view.getComputedStyle(subtitle);
    const availableWidth =
      subtitle.clientWidth -
      (Number.parseFloat(subtitleStyle.paddingLeft) || 0) -
      (Number.parseFloat(subtitleStyle.paddingRight) || 0);
    if (availableWidth <= 0) return;

    for (const pair of subtitle.querySelectorAll<HTMLElement>(
      ".subtitle-pair",
    )) {
      const lines = Array.from(pair.children).filter(
        (child): child is HTMLElement => child instanceof view.HTMLElement,
      );
      const fontSizes: number[] = [];
      let naturalWidth = 0;
      pair.classList.remove("subtitle-pair--wrapped");
      for (const line of lines) {
        line.classList.remove("subtitle-line--wrapped");
        line.style.removeProperty("--subtitle-fit-font-size");
        line.style.width = "max-content";
        line.style.maxWidth = "none";
        line.style.whiteSpace = "nowrap";
        naturalWidth = Math.max(
          naturalWidth,
          line.getBoundingClientRect().width,
        );
        const segment = line.querySelector<HTMLElement>(".subtitle-segment");
        fontSizes.push(
          segment
            ? Number.parseFloat(view.getComputedStyle(segment).fontSize)
            : 0,
        );
      }

      const { scale } = globalThis.PipCompanion.subtitleLineFit.calculate(
        naturalWidth,
        availableWidth,
        minimumScale,
      );
      lines.forEach((line, index) => {
        const fontSize = fontSizes[index] ?? 0;
        if (fontSize > 0)
          line.style.setProperty(
            "--subtitle-fit-font-size",
            `${fontSize * scale}px`,
          );
      });
      const scaledWidth = Math.max(
        0,
        ...lines.map((line) => line.getBoundingClientRect().width),
      );
      const { needsWrapping } =
        globalThis.PipCompanion.subtitleLineFit.calculate(
          scaledWidth,
          availableWidth,
          1,
        );
      pair.classList.toggle("subtitle-pair--wrapped", needsWrapping);
      for (const line of lines) {
        line.style.removeProperty("width");
        line.style.removeProperty("max-width");
        line.style.removeProperty("white-space");
        line.classList.toggle("subtitle-line--wrapped", needsWrapping);
      }
    }
  },
};
