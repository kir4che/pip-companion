"use strict";

function isSubtitleTranslationConfigRecord(
  value: unknown,
): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTranslationConfig = {
  normalize(value: unknown): SubtitleTranslationConfig {
    const config = isSubtitleTranslationConfigRecord(value) ? value : {};
    return {
      provider:
        config.provider === "google" || config.provider === "deepl"
          ? config.provider
          : "microsoft",
      microsoftKey:
        typeof config.microsoftKey === "string" &&
        config.microsoftKey.length <= 4096
          ? config.microsoftKey
          : "",
      microsoftRegion:
        typeof config.microsoftRegion === "string" &&
        config.microsoftRegion.length <= 100
          ? config.microsoftRegion
          : "",
      googleKey:
        typeof config.googleKey === "string" && config.googleKey.length <= 4096
          ? config.googleKey
          : "",
      deeplKey:
        typeof config.deeplKey === "string" && config.deeplKey.length <= 4096
          ? config.deeplKey
          : "",
    };
  },
  maskApiKey(key: string): string {
    return key ? "••••••••" : "";
  },
  getProviderApiKey(
    config: SubtitleTranslationConfig,
    provider: SubtitleTranslationProvider,
  ): string {
    return provider === "google"
      ? config.googleKey
      : provider === "deepl"
        ? config.deeplKey
        : config.microsoftKey;
  },
  getProviderOrigins(
    provider: SubtitleTranslationProvider,
    key: string,
  ): string[] {
    if (provider === "microsoft")
      return ["https://api.cognitive.microsofttranslator.com/*"];
    if (provider === "google") return ["https://translation.googleapis.com/*"];
    return [
      key.trim().toLowerCase().endsWith(":fx")
        ? "https://api-free.deepl.com/*"
        : "https://api.deepl.com/*",
    ];
  },
};
