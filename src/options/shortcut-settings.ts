"use strict";

globalThis.PipCompanion.optionsShortcutSettings = {
  create({ storage, util, shortcutInput, t, showStatus }) {
    const shortcuts = new Map<ShortcutKey, Shortcut>();
    for (const key of util.SHORTCUT_KEYS) {
      shortcuts.set(key, { ...util.SHORTCUT_DEFAULTS[key] });
    }

    const shortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
    for (const key of util.SHORTCUT_KEYS) {
      const button = document.querySelector<HTMLButtonElement>(
        `[data-shortcut="${key}"]`,
      );
      if (button) shortcutButtons.set(key, button);
    }

    let recordingKey: ShortcutKey | null = null;

    function renderShortcut(key: ShortcutKey) {
      const button = shortcutButtons.get(key);
      if (!button) return;
      const value = shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key];
      button.textContent =
        recordingKey === key
          ? t(
              key === "pipResizeShortcut"
                ? "popupRecordingResizeShortcut"
                : "popupRecordingShortcut",
            )
          : util.formatShortcut(value, false, true);
      button.setAttribute(
        "aria-label",
        `${shortcutName(key)}: ${button.textContent}`,
      );
    }

    function renderShortcuts() {
      for (const key of util.SHORTCUT_KEYS) renderShortcut(key);
    }

    async function loadShortcuts() {
      try {
        const stored = await storage.get(util.SHORTCUT_DEFAULTS);
        const normalized =
          globalThis.PipCompanion.shortcutSettings.normalizeAll(
            stored,
            util.SHORTCUT_KEYS,
            util.SHORTCUT_DEFAULTS,
          );
        for (const key of util.SHORTCUT_KEYS)
          shortcuts.set(key, normalized[key]);
      } catch {
        // 預設值已就位
      } finally {
        for (const button of shortcutButtons.values()) button.disabled = false;
        for (const button of clearShortcutButtons.values())
          button.disabled = false;
        for (const button of resetShortcutButtons.values())
          button.disabled = false;
      }
      renderShortcuts();
      renderShortcutActionButtons();
    }

    const sameShortcut = globalThis.PipCompanion.shortcutSettings.same;

    function shortcutName(key: ShortcutKey) {
      return (
        shortcutButtons
          .get(key)
          ?.closest(".shortcut-item")
          ?.querySelector(".shortcut-name")?.textContent ??
        t("popupOtherShortcut")
      );
    }

    const clearShortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
    const resetShortcutButtons = new Map<ShortcutKey, HTMLButtonElement>();
    for (const [key, shortcutButton] of shortcutButtons) {
      const actions = document.createElement("div");
      actions.className = "shortcut-actions";
      shortcutButton.before(actions);
      actions.append(shortcutButton);

      const clearButton = document.createElement("button");
      clearButton.className = "shortcut-clear-btn";
      clearButton.type = "button";
      clearButton.disabled = true;
      clearButton.title = t("popupClearShortcut");
      clearButton.setAttribute("data-clear-shortcut", key);
      const clearIcon = document.createElement("img");
      clearIcon.src = chrome.runtime.getURL("assets/clear-icon.svg");
      clearIcon.alt = "";
      clearButton.append(clearIcon);
      clearButton.addEventListener(
        "click",
        () =>
          void saveShortcut(key, {
            code: "",
            ctrl: false,
            alt: false,
            shift: false,
            meta: false,
          }),
      );
      actions.append(clearButton);
      clearShortcutButtons.set(key, clearButton);

      const resetButton = document.createElement("button");
      resetButton.className = "shortcut-reset-btn";
      resetButton.type = "button";
      resetButton.disabled = true;
      resetButton.title = t("popupResetShortcut");
      resetButton.setAttribute("data-reset-shortcut", key);
      const icon = document.createElement("img");
      icon.src = chrome.runtime.getURL("assets/reload-icon.svg");
      icon.alt = "";
      resetButton.append(icon);
      resetButton.addEventListener("click", () => {
        const shortcut = { ...util.SHORTCUT_DEFAULTS[key] };
        const conflict = findConflict(shortcut, key);
        if (conflict) {
          showStatus(t("popupShortcutConflict", conflict), true);
          return;
        }
        void saveShortcut(key, shortcut);
      });
      actions.append(resetButton);
      resetShortcutButtons.set(key, resetButton);
    }

    function renderShortcutActionButtons() {
      for (const [key, button] of resetShortcutButtons) {
        const shortcut = shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key];
        const name = shortcutName(key);
        const resetLabel = t("popupResetShortcut");
        button.title = resetLabel;
        button.setAttribute("aria-label", `${resetLabel}: ${name}`);
        button.hidden = sameShortcut(shortcut, util.SHORTCUT_DEFAULTS[key]);

        const clearButton = clearShortcutButtons.get(key);
        if (clearButton) {
          const clearLabel = t("popupClearShortcut");
          clearButton.title = clearLabel;
          clearButton.setAttribute("aria-label", `${clearLabel}: ${name}`);
          clearButton.hidden = shortcut.code === "";
        }
      }
    }

    renderShortcutActionButtons();

    function findConflict(shortcut: Shortcut, self: ShortcutKey) {
      if (shortcut.code === "") return null;
      const other = util.SHORTCUT_KEYS.find(
        (key) =>
          key !== self &&
          sameShortcut(
            shortcuts.get(key) ?? util.SHORTCUT_DEFAULTS[key],
            shortcut,
          ),
      );
      return other ? shortcutName(other) : null;
    }

    async function saveShortcut(key: ShortcutKey, shortcut: Shortcut) {
      const conflict = findConflict(shortcut, key);
      if (conflict) {
        recordingKey = key;
        renderShortcuts();
        showStatus(t("popupShortcutConflict", conflict), true);
        return;
      }

      recordingKey = null;
      renderShortcut(key);
      try {
        await storage.set({ [key]: shortcut });
        shortcuts.set(key, shortcut);
        renderShortcut(key);
        renderShortcutActionButtons();
        showStatus("");
      } catch {
        showStatus(t("popupCannotSaveShortcut"), true);
      }
    }

    for (const key of util.SHORTCUT_KEYS) {
      shortcutButtons.get(key)?.addEventListener("click", () => {
        recordingKey = key;
        renderShortcuts();
      });
    }

    document.addEventListener(
      "keydown",
      async (e) => {
        if (!recordingKey) return;
        e.preventDefault();
        e.stopPropagation();

        const key = recordingKey;
        const result = shortcutInput.fromKeyboard(
          e,
          key,
          navigator.platform,
          util.hasMetaModifier,
        );
        if (result.type === "cancel") {
          recordingKey = null;
          renderShortcuts();
          showStatus("");
        } else if (result.type === "status") {
          showStatus(
            result.parameter
              ? t(result.message, result.parameter)
              : t(result.message),
            result.error,
          );
        } else if (result.type === "shortcut")
          void saveShortcut(key, result.shortcut);
      },
      true,
    );

    document.addEventListener(
      "wheel",
      (e) => {
        if (recordingKey !== "pipResizeShortcut") return;
        e.preventDefault();
        e.stopPropagation();
        const result = shortcutInput.fromWheel(e, navigator.platform);
        if (result.type === "status")
          showStatus(t(result.message), result.error);
        else if (result.type === "shortcut")
          void saveShortcut(recordingKey, result.shortcut);
      },
      { capture: true, passive: false },
    );

    function handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }) {
      for (const key of util.SHORTCUT_KEYS) {
        if (changes[key]) {
          shortcuts.set(
            key,
            util.normalizeShortcut(
              changes[key].newValue,
              util.SHORTCUT_DEFAULTS[key],
            ),
          );
        }
      }
      renderShortcuts();
      renderShortcutActionButtons();
    }

    return {
      render() {
        renderShortcuts();
        renderShortcutActionButtons();
      },
      load: loadShortcuts,
      handleStorageChange,
    };
  },
} satisfies OptionsShortcutSettingsApi;
