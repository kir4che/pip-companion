"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTranslationSettings = (() => {
  const PREFERENCES_KEY = "subtitleTranslationPreferences";
  const CONFIG_KEY = "subtitleTranslationConfig";
  const LANGUAGES = [
    "ar",
    "bg",
    "bn",
    "ca",
    "cs",
    "da",
    "de",
    "el",
    "en",
    "es",
    "et",
    "fa",
    "fi",
    "fr",
    "he",
    "hi",
    "hr",
    "hu",
    "id",
    "it",
    "ja",
    "ko",
    "lt",
    "lv",
    "ms",
    "nl",
    "no",
    "pl",
    "pt",
    "ro",
    "ru",
    "sk",
    "sl",
    "sr",
    "sv",
    "ta",
    "th",
    "tr",
    "uk",
    "ur",
    "vi",
    "zh-Hans",
    "zh-Hant",
  ] as const;
  const DEFAULT_PREFERENCES: SubtitleTranslationPreferences = {
    enabled: false,
    mode: "translation-only",
    targetLanguage: "zh-Hant",
    preferNative: true,
    useNativeSecondaryTrack: false,
  };

  function normalizeLanguage(value: unknown): SubtitleTranslationLanguage {
    return typeof value === "string" &&
      value.length <= 35 &&
      /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
      ? value
      : DEFAULT_PREFERENCES.targetLanguage;
  }

  function normalizePreferences(
    value: unknown,
  ): SubtitleTranslationPreferences {
    const settings = globalThis.PipCompanion.util.isRecord(value) ? value : {};
    return {
      enabled: settings.enabled === true,
      mode: settings.mode === "bilingual" ? "bilingual" : "translation-only",
      targetLanguage: normalizeLanguage(settings.targetLanguage),
      preferNative: settings.preferNative !== false,
      useNativeSecondaryTrack: settings.useNativeSecondaryTrack === true,
    };
  }

  function getLanguageLabel(code: SubtitleTranslationLanguage): string {
    try {
      return (
        new Intl.DisplayNames(
          [globalThis.PipCompanion.util.getHtmlLanguage()],
          { type: "language" },
        ).of(code) ?? code
      );
    } catch {
      return code;
    }
  }

  return {
    PREFERENCES_KEY,
    CONFIG_KEY,
    LANGUAGES,
    DEFAULT_PREFERENCES,
    normalizePreferences,
    getLanguageLabel,
  };
})();
