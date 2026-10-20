"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuBlocklist = (() => {
  const STORAGE_KEY = "danmakuBlocklist";
  const MAX_BLOCKLIST_ITEMS = 50;
  const MAX_PATTERN_LENGTH = 100;
  const WHITESPACE_REGEX = /[\s\u3000\u200B-\u200D\uFEFF]+/g;

  function normalize(raw: unknown): string[] {
    if (!Array.isArray(raw)) return [];
    const result: string[] = [];
    const seen = new Set<string>();

    for (const item of raw) {
      if (typeof item !== "string") continue;
      const trimmed = item.trim();
      if (!trimmed || trimmed.length > MAX_PATTERN_LENGTH) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(trimmed);
      if (result.length >= MAX_BLOCKLIST_ITEMS) break;
    }
    return result;
  }

  function compileRule(rule: string): ((text: string) => boolean) | null {
    const trimmed = rule.trim();
    if (!trimmed) return null;

    const regexMatch = /^\/(.+)\/([dgimsuy]*)$/i.exec(trimmed);
    if (regexMatch && regexMatch[1]) {
      try {
        const flags = (regexMatch[2] || "").toLowerCase().replace(/[gy]/g, "");
        const reg = new RegExp(regexMatch[1], flags);
        return (text: string) => {
          reg.lastIndex = 0;
          return reg.test(text);
        };
      } catch {
        // 若正則語法不合法，以正則內容降級為普通關鍵字比對。
        const fallbackKeyword = regexMatch[1].toLowerCase();
        const fallbackStripped = fallbackKeyword.replace(WHITESPACE_REGEX, "");
        return (text: string) => {
          const lowerText = text.toLowerCase();
          if (lowerText.includes(fallbackKeyword)) return true;
          if (
            fallbackStripped &&
            lowerText.replace(WHITESPACE_REGEX, "").includes(fallbackStripped)
          )
            return true;
          return false;
        };
      }
    }

    const lowerKeyword = trimmed.toLowerCase();
    const strippedKeyword = lowerKeyword.replace(WHITESPACE_REGEX, "");

    return (text: string) => {
      const lowerText = text.toLowerCase();
      if (lowerText.includes(lowerKeyword)) return true;
      if (
        strippedKeyword &&
        lowerText.replace(WHITESPACE_REGEX, "").includes(strippedKeyword)
      )
        return true;
      return false;
    };
  }

  function createFilter(
    rules: readonly string[],
  ): (text?: string | null) => boolean {
    const compiled = rules
      .map(compileRule)
      .filter((fn): fn is (text: string) => boolean => fn !== null);

    if (compiled.length === 0) return () => false;

    return (text?: string | null) => {
      if (typeof text !== "string" || !text) return false;
      return compiled.some((fn) => fn(text));
    };
  }

  return {
    STORAGE_KEY,
    MAX_BLOCKLIST_ITEMS,
    MAX_PATTERN_LENGTH,
    normalize,
    compileRule,
    createFilter,
  };
})();
