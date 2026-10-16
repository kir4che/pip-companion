"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.pipProgressMath = {
  ratioAt(clientX: number, left: number, width: number): number | null {
    if (width <= 0) return null;
    return Math.max(0, Math.min(1, (clientX - left) / width));
  },
  timeAt(ratio: number, duration: number): number {
    return duration * ratio;
  },
  valueAt(ratio: number, max: number): number {
    return Math.round(ratio * max);
  },
};
