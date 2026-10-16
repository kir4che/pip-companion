"use strict";

function isExtraSourceRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.extraBilibiliSourceConfig = {
  parse(value) {
    if (
      !isExtraSourceRecord(value) ||
      typeof value.enabled !== "boolean" ||
      typeof value.url !== "string" ||
      value.url.length > 2048 ||
      typeof value.offsetSeconds !== "number" ||
      !Number.isFinite(value.offsetSeconds) ||
      Math.abs(value.offsetSeconds) > 3600
    )
      return null;
    return {
      enabled: value.enabled,
      url: value.url,
      offsetSeconds: value.offsetSeconds,
    };
  },
  hasSettings(source) {
    return Boolean(
      source && (source.enabled || source.url || source.offsetSeconds !== 0),
    );
  },
  resolve(live, stored) {
    if (!this.hasSettings(live) && stored)
      return { restore: { ...stored, enabled: false }, persist: null };
    return {
      restore: null,
      persist: this.hasSettings(live) ? live : null,
    };
  },
  storageKey(tabId) {
    return `extraBilibiliSource:${tabId}`;
  },
};
