"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);

globalThis.PipCompanion.subtitleStyleStore = {
  create({ storage, settings, t, showStatus, onChange }) {
    const targets: SubtitleStyleTarget[] = ["primary", "secondary"];
    const styles: Record<SubtitleStyleTarget, SubtitleStyleSettings> = {
      primary: { ...settings.DEFAULTS },
      secondary: { ...settings.SECONDARY_DEFAULTS },
    };
    const revisions: Record<SubtitleStyleTarget, number> = {
      primary: 0,
      secondary: 0,
    };
    const dirty: Record<SubtitleStyleTarget, boolean> = {
      primary: false,
      secondary: false,
    };
    const saveQueues: Record<SubtitleStyleTarget, Promise<void>> = {
      primary: Promise.resolve(),
      secondary: Promise.resolve(),
    };
    const saveTimers: Partial<
      Record<SubtitleStyleTarget, ReturnType<typeof setTimeout>>
    > = {};
    let layout = { ...settings.LAYOUT_DEFAULTS };
    let layoutRevision = 0;
    let layoutDirty = false;
    let layoutSaveQueue: Promise<void> = Promise.resolve();
    let layoutSaveTimer: ReturnType<typeof setTimeout> | undefined;

    function storageKey(target: SubtitleStyleTarget) {
      return target === "primary"
        ? settings.STORAGE_KEY
        : settings.SECONDARY_STORAGE_KEY;
    }

    function defaults(target: SubtitleStyleTarget) {
      return target === "primary"
        ? settings.DEFAULTS
        : settings.SECONDARY_DEFAULTS;
    }

    function updateStyle(target: SubtitleStyleTarget, value: unknown) {
      styles[target] = settings.normalize(value, defaults(target));
      revisions[target]++;
      dirty[target] = true;
      onChange();
    }

    function updateLayout(value: unknown) {
      layout = settings.normalizeLayout(value);
      layoutRevision++;
      layoutDirty = true;
      onChange();
    }

    async function saveStyleNow(target: SubtitleStyleTarget) {
      const style = { ...styles[target] };
      const revision = revisions[target];
      const save = saveQueues[target].then(() =>
        storage.set({ [storageKey(target)]: style }),
      );
      saveQueues[target] = save.catch(() => {});
      try {
        await save;
        if (revision === revisions[target]) dirty[target] = false;
        showStatus("");
      } catch {
        showStatus(t("popupCannotSaveSubtitle"), true);
      }
    }

    function saveStyle(target: SubtitleStyleTarget, immediate = false) {
      const timer = saveTimers[target];
      if (timer) clearTimeout(timer);
      if (!immediate) {
        saveTimers[target] = setTimeout(() => {
          delete saveTimers[target];
          void saveStyleNow(target);
        }, 120);
        return;
      }
      delete saveTimers[target];
      void saveStyleNow(target);
    }

    async function saveLayoutNow() {
      const value = { ...layout };
      const revision = layoutRevision;
      const save = layoutSaveQueue.then(() =>
        storage.set({ [settings.LAYOUT_STORAGE_KEY]: value }),
      );
      layoutSaveQueue = save.catch(() => {});
      try {
        await save;
        if (revision === layoutRevision) layoutDirty = false;
        showStatus("");
      } catch {
        showStatus(t("popupCannotSaveSubtitle"), true);
      }
    }

    function saveLayout(immediate = false) {
      if (layoutSaveTimer) clearTimeout(layoutSaveTimer);
      if (!immediate) {
        layoutSaveTimer = setTimeout(() => {
          layoutSaveTimer = undefined;
          void saveLayoutNow();
        }, 120);
        return;
      }
      layoutSaveTimer = undefined;
      void saveLayoutNow();
    }

    async function loadStyles() {
      const snapshot = { ...revisions };
      try {
        const stored = await storage.get([
          settings.STORAGE_KEY,
          settings.SECONDARY_STORAGE_KEY,
        ]);
        for (const target of targets) {
          if (snapshot[target] !== revisions[target]) continue;
          const scrubbed =
            globalThis.PipCompanion.subtitleStyleStorage.normalize(
              stored[storageKey(target)],
              defaults(target),
            );
          styles[target] = scrubbed.style;
          if (scrubbed.changed)
            void storage.set({ [storageKey(target)]: scrubbed.style });
        }
      } catch {
        for (const target of targets) {
          if (snapshot[target] === revisions[target])
            styles[target] = { ...defaults(target) };
        }
      }
    }

    async function loadLayout() {
      const revision = layoutRevision;
      try {
        const stored = await storage.get([
          settings.LAYOUT_STORAGE_KEY,
          settings.STORAGE_KEY,
        ]);
        if (revision === layoutRevision)
          layout = settings.normalizeLayout(
            stored[settings.LAYOUT_STORAGE_KEY] ?? stored[settings.STORAGE_KEY],
          );
      } catch {
        if (revision === layoutRevision)
          layout = { ...settings.LAYOUT_DEFAULTS };
      }
    }

    function handleStorageChange(changes: {
      [key: string]: chrome.storage.StorageChange;
    }) {
      for (const target of targets) {
        const change = changes[storageKey(target)];
        if (!change || dirty[target]) continue;
        styles[target] = settings.normalize(change.newValue, defaults(target));
        revisions[target]++;
        onChange();
      }
      const layoutChange = changes[settings.LAYOUT_STORAGE_KEY];
      if (layoutChange && !layoutDirty) {
        layout = settings.normalizeLayout(layoutChange.newValue);
        layoutRevision++;
        onChange();
      }
    }

    return {
      get styles() {
        return styles;
      },
      get layout() {
        return layout;
      },
      updateStyle,
      updateLayout,
      saveStyle,
      saveLayout,
      loadStyles,
      loadLayout,
      handleStorageChange,
    };
  },
} satisfies SubtitleStyleStoreApi;
