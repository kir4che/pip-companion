"use strict";

globalThis.PipCompanion.settingsNavigation = {
  create(doc: Document) {
    const menuView = doc.querySelector("#menu-view") as HTMLElement;
    const danmakuSettingsView = doc.querySelector(
      "#danmaku-settings-view",
    ) as HTMLElement;
    const danmakuSettingsOpen = doc.querySelector(
      "#danmaku-settings-open",
    ) as HTMLButtonElement;
    const danmakuSettingsBack = doc.querySelector(
      "#danmaku-settings-back",
    ) as HTMLButtonElement;
    const extraDanmakuSettingsView = doc.querySelector(
      "#extra-danmaku-settings-view",
    ) as HTMLElement;
    const extraDanmakuOpen = doc.querySelector(
      "#extra-danmaku-open",
    ) as HTMLButtonElement;
    const extraDanmakuBack = doc.querySelector(
      "#extra-danmaku-back",
    ) as HTMLButtonElement;
    const subtitleSettingsView = doc.querySelector(
      "#subtitle-settings-view",
    ) as HTMLElement;
    const subtitleSettingsOpen = doc.querySelector(
      "#subtitle-settings-open",
    ) as HTMLButtonElement;
    const subtitleSettingsBack = doc.querySelector(
      "#subtitle-settings-back",
    ) as HTMLButtonElement;
    let activeSettingsView: "danmaku" | "subtitle" | "extra" = "danmaku";

    function setView(view: "menu" | "danmaku" | "subtitle" | "extra") {
      menuView.hidden = view !== "menu";
      danmakuSettingsView.hidden = view !== "danmaku";
      extraDanmakuSettingsView.hidden = view !== "extra";
      subtitleSettingsView.hidden = view !== "subtitle";
      if (view !== "menu") activeSettingsView = view;
      const focusTarget =
        view === "menu"
          ? activeSettingsView === "danmaku"
            ? danmakuSettingsOpen
            : activeSettingsView === "subtitle"
              ? subtitleSettingsOpen
              : extraDanmakuOpen
          : view === "danmaku"
            ? danmakuSettingsBack
            : view === "subtitle"
              ? subtitleSettingsBack
              : extraDanmakuBack;
      focusTarget.focus();
    }

    danmakuSettingsOpen.addEventListener("click", () => setView("danmaku"));
    danmakuSettingsBack.addEventListener("click", () => setView("menu"));
    extraDanmakuOpen.addEventListener("click", () => setView("extra"));
    extraDanmakuBack.addEventListener("click", () => setView("menu"));
    subtitleSettingsOpen.addEventListener("click", () => setView("subtitle"));
    subtitleSettingsBack.addEventListener("click", () => setView("menu"));

    return { setView };
  },
} satisfies PopupSettingsNavigationApi;
