"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.shortcutSettings = {
  normalizeAll(
    stored: Record<string, unknown>,
    keys: ShortcutKey[],
    defaults: Record<ShortcutKey, Shortcut>,
  ): Record<ShortcutKey, Shortcut> {
    const shortcuts = {} as Record<ShortcutKey, Shortcut>;
    for (const key of keys)
      shortcuts[key] = globalThis.PipCompanion.util.normalizeShortcut(
        stored[key],
        defaults[key],
      );
    return shortcuts;
  },
  same(a: Shortcut, b: Shortcut): boolean {
    return (
      a.code === b.code &&
      a.ctrl === b.ctrl &&
      a.alt === b.alt &&
      a.shift === b.shift &&
      a.meta === b.meta
    );
  },
};
