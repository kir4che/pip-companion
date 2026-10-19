"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuJump = (() => {
  const JUMP_PATTERN = /(?:空降|跳[傘伞])[^\d]{0,6}?(\d{1,3}:\d{2}(?::\d{2})?)/;

  function parseJumpSeconds(text?: string | null): number | null {
    const match = JUMP_PATTERN.exec((text || "").replace(/：/g, ":"));
    if (!match?.[1]) return null;
    return globalThis.PipCompanion.util.parseTime(match[1]);
  }

  return { parseJumpSeconds };
})();
