"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.extraBilibiliForm = {
  parse(
    rawUrlValue: string,
    offsetValue: string,
    enabled: boolean,
    isValidUrl: (value: string) => boolean,
  ): ExtraBilibiliFormResult {
    const rawUrl = rawUrlValue.trim();
    let url = "";
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (!isValidUrl(parsed.href)) throw new Error("invalid URL");
        url = parsed.href;
      } catch {
        const currentOffset = Number(offsetValue);
        return {
          ok: false,
          errorField: "url",
          url: rawUrl,
          offsetSeconds:
            Number.isFinite(currentOffset) && Math.abs(currentOffset) <= 3600
              ? currentOffset
              : 0,
        };
      }
    }

    const offsetSeconds = Number(offsetValue);
    if (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 3600)
      return { ok: false, errorField: "offset", url, offsetSeconds: 0 };

    return {
      ok: true,
      source: { enabled: enabled && Boolean(url), url, offsetSeconds },
    };
  },
};
