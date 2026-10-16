"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.shortcutInput = {
  fromKeyboard(
    event: KeyboardEvent,
    key: ShortcutKey,
    platform: string,
    hasMetaModifier: (event: KeyboardEvent) => boolean,
  ): ShortcutInputResult {
    if (event.key === "Escape") return { type: "cancel" };
    if (key === "pipResizeShortcut")
      return {
        type: "status",
        message: "popupResizeNeedsModifier",
        error: true,
      };

    const isMetaKey =
      event.key === "Meta" ||
      event.key === "OS" ||
      event.code === "MetaLeft" ||
      event.code === "MetaRight";
    const meta = hasMetaModifier(event);
    if (platform.includes("Win") && (meta || isMetaKey))
      return { type: "status", message: "popupWinKeyUnsupported", error: true };
    if (["Control", "Alt", "Shift"].includes(event.key))
      return { type: "ignore" };
    if (isMetaKey)
      return {
        type: "status",
        message: "popupModifierKey",
        parameter: platform.includes("Mac") ? "Command" : "Meta",
      };
    if (event.code === "Unidentified")
      return { type: "status", message: "popupUnrecognizedKey", error: true };

    const isNavigationKey = [
      "Tab",
      "Enter",
      "Backspace",
      "Delete",
      "CapsLock",
    ].includes(event.key);
    const allowedEnter =
      event.key === "Enter" && key === "pipDanmakuInputShortcut";
    if (
      !event.ctrlKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.shiftKey &&
      isNavigationKey &&
      !allowedEnter
    )
      return { type: "status", message: "popupNavigationKey", error: true };

    return {
      type: "shortcut",
      shortcut: {
        code: event.code,
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta,
      },
    };
  },
  fromWheel(event: WheelEvent, platform: string): ShortcutInputResult {
    const meta = event.metaKey || event.getModifierState("Meta");
    if (platform.includes("Win") && meta)
      return { type: "status", message: "popupWinKeyUnsupported", error: true };
    if (!event.ctrlKey && !event.altKey && !event.shiftKey && !meta)
      return {
        type: "status",
        message: "popupResizeNeedsModifier",
        error: true,
      };
    return {
      type: "shortcut",
      shortcut: {
        code: "Wheel",
        ctrl: event.ctrlKey,
        alt: event.altKey,
        shift: event.shiftKey,
        meta,
      },
    };
  },
};
