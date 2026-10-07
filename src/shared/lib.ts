"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.util = (() => {
  const SHORTCUT_DEFAULTS: Record<ShortcutKey, Shortcut> = {
    launchShortcut: {
      code: "KeyP",
      ctrl: false,
      alt: true,
      shift: true,
      meta: false,
    },
    commentsShortcut: {
      code: "KeyC",
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    },
    screenshotShortcut: {
      code: "KeyP",
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    },
    danmakuShortcut: {
      code: "KeyD",
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    },
  };
  const SHORTCUT_KEYS: ShortcutKey[] = [
    "launchShortcut",
    "commentsShortcut",
    "screenshotShortcut",
    "danmakuShortcut",
  ];

  const pin = (label: string, code: string, shift = false) => ({
    label,
    shortcut: { code, ctrl: false, alt: false, shift, meta: false },
  });
  const FIXED_SHORTCUTS: { label: string; shortcut: Shortcut }[] = [
    pin("播放/暫停", "Space"),
    pin("字幕", "KeyC"),
    pin("靜音", "KeyM"),
    pin("逐格後退", "Comma"),
    pin("逐格前進", "Period"),
    pin("降低倍速", "Comma", true),
    pin("提高倍速", "Period", true),
    pin("快退 5 秒", "ArrowLeft"),
    pin("快進 5 秒", "ArrowRight"),
    pin("音量 +10", "ArrowUp"),
    pin("音量 -10", "ArrowDown"),
  ];

  function normalizeShortcut(value: unknown, fallback: Shortcut): Shortcut {
    if (!value || typeof value !== "object") return { ...fallback };
    const shortcut = value as Partial<Shortcut>;
    return {
      code: typeof shortcut.code === "string" ? shortcut.code : fallback.code,
      ctrl: typeof shortcut.ctrl === "boolean" ? shortcut.ctrl : fallback.ctrl,
      alt: typeof shortcut.alt === "boolean" ? shortcut.alt : fallback.alt,
      shift:
        typeof shortcut.shift === "boolean" ? shortcut.shift : fallback.shift,
      meta: typeof shortcut.meta === "boolean" ? shortcut.meta : fallback.meta,
    };
  }

  function matchesShortcut(event: KeyboardEvent, shortcut: Shortcut) {
    return (
      event.code === shortcut.code &&
      event.ctrlKey === shortcut.ctrl &&
      event.altKey === shortcut.alt &&
      event.shiftKey === shortcut.shift &&
      event.metaKey === shortcut.meta
    );
  }

  function formatShortcut(value: Shortcut, forAria = false) {
    const mac = !forAria && navigator.platform.includes("Mac");
    const parts: string[] = [];
    if (value.ctrl) parts.push(mac ? "⌃" : "Ctrl");
    if (value.alt) parts.push(mac ? "⌥" : "Alt");
    if (value.shift) parts.push(mac ? "⇧" : "Shift");
    if (value.meta) parts.push(mac ? "⌘" : "Meta");
    const key = value.code.startsWith("Key")
      ? value.code.slice(3)
      : value.code.startsWith("Digit")
        ? value.code.slice(5)
        : value.code === "Space"
          ? "Space"
          : value.code;
    parts.push(key);
    return parts.join(mac ? "" : "+");
  }

  function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const total = Math.floor(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const remainder = total % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`
      : `${minutes}:${String(remainder).padStart(2, "0")}`;
  }

  function parseTime(input: string): number | null {
    const text = input.trim();
    if (!text) return null;
    const parts = text.split(":");
    if (parts.length > 3 || !parts.every((part) => /^\d{1,5}$/.test(part)))
      return null;
    const nums = parts.map(Number);
    const seconds = nums.pop() ?? 0;
    const minutes = nums.pop() ?? 0;
    const hours = nums.pop() ?? 0;
    if (parts.length >= 2 && seconds > 59) return null;
    if (parts.length === 3 && minutes > 59) return null;
    return hours * 3600 + minutes * 60 + seconds;
  }

  return {
    SHORTCUT_DEFAULTS,
    SHORTCUT_KEYS,
    FIXED_SHORTCUTS,
    normalizeShortcut,
    matchesShortcut,
    formatShortcut,
    formatTime,
    parseTime,
  };
})();
