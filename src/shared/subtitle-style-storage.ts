"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleStyleStorage = {
  normalize(
    stored: unknown,
    defaults: SubtitleStyleSettings,
  ): { style: SubtitleStyleSettings; changed: boolean } {
    const settings = globalThis.PipCompanion.subtitleSettings;
    return settings.scrubOrphanedStyleFields(
      stored,
      settings.normalize(stored, defaults),
    );
  },
};
