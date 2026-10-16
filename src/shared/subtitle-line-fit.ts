"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleLineFit = {
  calculate(
    naturalWidth: number,
    availableWidth: number,
    minimumScale: number,
  ): { scale: number; needsWrapping: boolean } {
    const scale =
      naturalWidth > availableWidth
        ? Math.max(minimumScale, availableWidth / naturalWidth)
        : 1;
    return {
      scale,
      needsWrapping: naturalWidth * scale > availableWidth + 1,
    };
  },
};
