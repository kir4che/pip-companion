"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.shortcutInput = {
  fromKeyboard(
    e: KeyboardEvent,
    key: ShortcutKey,
    platform: string,
    hasMetaModifier: (e: KeyboardEvent) => boolean,
  ): ShortcutInputResult {
    if (e.key === "Escape") return { type: "cancel" };
    if (key === "pipResizeShortcut")
      return {
        type: "status",
        message: "popupResizeNeedsModifier",
        error: true,
      };

    const isMetaKey =
      e.key === "Meta" ||
      e.key === "OS" ||
      e.code === "MetaLeft" ||
      e.code === "MetaRight";
    const meta = hasMetaModifier(e);
    if (platform.includes("Win") && (meta || isMetaKey))
      return { type: "status", message: "popupWinKeyUnsupported", error: true };
    if (["Control", "Alt", "Shift"].includes(e.key)) return { type: "ignore" };
    if (isMetaKey)
      return {
        type: "status",
        message: "popupModifierKey",
        parameter: platform.includes("Mac") ? "Command" : "Meta",
      };
    if (e.code === "Unidentified")
      return { type: "status", message: "popupUnrecognizedKey", error: true };

    const isNavigationKey = [
      "Tab",
      "Enter",
      "Backspace",
      "Delete",
      "CapsLock",
    ].includes(e.key);
    const allowedEnter = e.key === "Enter" && key === "pipDanmakuInputShortcut";
    if (
      !e.ctrlKey &&
      !e.altKey &&
      !e.metaKey &&
      !e.shiftKey &&
      isNavigationKey &&
      !allowedEnter
    )
      return { type: "status", message: "popupNavigationKey", error: true };

    return {
      type: "shortcut",
      shortcut: {
        code: e.code,
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta,
      },
    };
  },
  fromWheel(e: WheelEvent, platform: string): ShortcutInputResult {
    const meta = e.metaKey || e.getModifierState("Meta");
    if (platform.includes("Win") && meta)
      return { type: "status", message: "popupWinKeyUnsupported", error: true };
    if (!e.ctrlKey && !e.altKey && !e.shiftKey && !meta)
      return {
        type: "status",
        message: "popupResizeNeedsModifier",
        error: true,
      };
    return {
      type: "shortcut",
      shortcut: {
        code: "Wheel",
        ctrl: e.ctrlKey,
        alt: e.altKey,
        shift: e.shiftKey,
        meta,
      },
    };
  },
};
