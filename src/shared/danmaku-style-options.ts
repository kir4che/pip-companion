"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuStyleOptions = {
  create({ storage, settings, t, showStatus }) {
    const danmakuFontFamily = document.querySelector(
      "#danmaku-font-family",
    ) as HTMLSelectElement;
    const danmakuStyleControls = [
      {
        key: "fontSizeScale",
        input: document.querySelector("#danmaku-size") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-size-value",
        ) as HTMLOutputElement,
      },
      {
        key: "maxFontSize",
        input: document.querySelector("#danmaku-max-size") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-max-size-value",
        ) as HTMLOutputElement,
      },
      {
        key: "opacity",
        input: document.querySelector("#danmaku-opacity") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-opacity-value",
        ) as HTMLOutputElement,
      },
      {
        key: "speedScale",
        input: document.querySelector("#danmaku-speed") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-speed-value",
        ) as HTMLOutputElement,
      },
      {
        key: "fontWeight",
        input: document.querySelector("#danmaku-weight") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-weight-value",
        ) as HTMLOutputElement,
      },
      {
        key: "displayArea",
        input: document.querySelector("#danmaku-area") as HTMLInputElement,
        output: document.querySelector(
          "#danmaku-area-value",
        ) as HTMLOutputElement,
      },
    ] as const;
    const danmakuStyleReset = document.querySelector(
      "#danmaku-style-reset",
    ) as HTMLButtonElement;

    let danmakuStyle = { ...settings.DEFAULTS };
    let danmakuStyleRevision = 0;
    let danmakuStyleDirty = false;
    let danmakuStyleSaveQueue: Promise<void> = Promise.resolve();
    let danmakuStyleSaveTimer: ReturnType<typeof setTimeout> | undefined;

    function setDanmakuStyleControlsDisabled(disabled: boolean) {
      danmakuFontFamily.disabled = disabled;
      for (const control of danmakuStyleControls)
        control.input.disabled = disabled;
      danmakuStyleReset.disabled = disabled;
    }

    function renderDanmakuStyle() {
      globalThis.PipCompanion.danmakuStyleRendering.render(
        danmakuStyle,
        danmakuStyleControls,
        danmakuFontFamily,
        settings.SPEED_OPTIONS,
      );
    }

    function updateDanmakuStyle(value: unknown) {
      danmakuStyle = settings.normalize(value);
      danmakuStyleRevision++;
      danmakuStyleDirty = true;
      renderDanmakuStyle();
    }

    async function saveDanmakuStyle() {
      const style = { ...danmakuStyle };
      const revision = danmakuStyleRevision;
      const save = danmakuStyleSaveQueue.then(() =>
        storage.set({
          [settings.STORAGE_KEY]: style,
        }),
      );
      danmakuStyleSaveQueue = save.catch(() => {});
      try {
        await save;
        if (revision === danmakuStyleRevision) danmakuStyleDirty = false;
        showStatus("");
      } catch {
        showStatus(t("popupCannotSaveDanmaku"), true);
      }
    }

    function scheduleDanmakuStyleSave() {
      if (danmakuStyleSaveTimer) clearTimeout(danmakuStyleSaveTimer);
      danmakuStyleSaveTimer = setTimeout(() => {
        danmakuStyleSaveTimer = undefined;
        void saveDanmakuStyle();
      }, 120);
    }

    async function loadDanmakuStyle() {
      const revision = danmakuStyleRevision;
      let style: typeof danmakuStyle;
      try {
        const stored = await storage.get(settings.STORAGE_KEY);
        style = settings.normalize(stored[settings.STORAGE_KEY]);
      } catch {
        style = { ...settings.DEFAULTS };
      }
      if (revision === danmakuStyleRevision) {
        danmakuStyle = style;
        renderDanmakuStyle();
      }
      setDanmakuStyleControlsDisabled(false);
    }

    danmakuFontFamily.addEventListener("change", () => {
      updateDanmakuStyle({
        ...danmakuStyle,
        fontFamily: danmakuFontFamily.value,
      });
      void saveDanmakuStyle();
    });

    function getDanmakuStyleControlValue(
      control: (typeof danmakuStyleControls)[number],
    ) {
      const value = Number(control.input.value);
      return control.key === "speedScale"
        ? settings.SPEED_OPTIONS[value]?.value
        : value;
    }

    for (const control of danmakuStyleControls) {
      control.input.addEventListener("input", () => {
        updateDanmakuStyle({
          ...danmakuStyle,
          [control.key]: getDanmakuStyleControlValue(control),
        });
        scheduleDanmakuStyleSave();
      });
      control.input.addEventListener("change", () => {
        if (danmakuStyleSaveTimer) clearTimeout(danmakuStyleSaveTimer);
        danmakuStyleSaveTimer = undefined;
        void saveDanmakuStyle();
      });
    }

    danmakuStyleReset.addEventListener("click", () => {
      updateDanmakuStyle(settings.DEFAULTS);
      void saveDanmakuStyle();
    });

    function handleStorageChange(
      change: chrome.storage.StorageChange | undefined,
    ) {
      if (!change || danmakuStyleDirty) return;
      danmakuStyle = settings.normalize(change.newValue);
      danmakuStyleRevision++;
      renderDanmakuStyle();
    }

    return {
      render: renderDanmakuStyle,
      setControlsDisabled: setDanmakuStyleControlsDisabled,
      load: loadDanmakuStyle,
      handleStorageChange,
    };
  },
} satisfies DanmakuStyleOptionsApi;
