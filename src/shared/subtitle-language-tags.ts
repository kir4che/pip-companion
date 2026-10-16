"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleLanguageTags = (() => {
  const normalize = (code: string) =>
    code.trim().replace(/_/g, "-").toLowerCase();

  const normalizeSubtitleLanguage = (language: string) => {
    const normalized = normalize(language);
    if (/^zh-(?:hant|tw|hk|mo)(?:-|$)/.test(normalized)) return "zh-hant";
    if (/^zh-(?:hans|cn|sg)(?:-|$)/.test(normalized)) return "zh-hans";
    return normalized.split("-")[0] ?? normalized;
  };

  return {
    normalize,
    normalizeSubtitleLanguage,
    matchesSubtitleLanguages(left: string, right: string) {
      return Boolean(
        left &&
        right &&
        normalizeSubtitleLanguage(left) === normalizeSubtitleLanguage(right),
      );
    },
    matches(left: string, right: string) {
      const a = normalize(left);
      const b = normalize(right);
      return (
        Boolean(a && b) &&
        (a === b || a.startsWith(`${b}-`) || b.startsWith(`${a}-`))
      );
    },
    isValid(code: string) {
      return (
        code.length > 0 &&
        code.length <= 35 &&
        /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(code)
      );
    },
  };
})();
