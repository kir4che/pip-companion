"use strict";

globalThis.PipCompanion.popupSubtitleStyleOptions = {
  create({ storage, settings, t, showStatus }) {
    type SubtitleVariant = "primary" | "secondary";
    type SubtitleNumericKey =
      "fontWeight" | "lineHeightScale" | "fontSizeScale" | "edgeIntensity";
    const variants: SubtitleVariant[] = ["primary", "secondary"];
    let activeVariant: SubtitleVariant = "primary";
    const store = globalThis.PipCompanion.subtitleStyleStore.create({
      storage,
      settings,
      t,
      showStatus,
      onChange: render,
    });

    function queryElement(
      variant: SubtitleVariant,
      suffix: string,
    ): HTMLInputElement | HTMLSelectElement | HTMLOutputElement {
      return document.querySelector(`#${variant}-subtitle-${suffix}`) as
        HTMLInputElement | HTMLSelectElement | HTMLOutputElement;
    }

    function numericControls(variant: SubtitleVariant) {
      const controls: [SubtitleNumericKey, string][] = [
        ["fontSizeScale", "size"],
        ["fontWeight", "font-weight"],
        ["lineHeightScale", "line-height"],
        ["edgeIntensity", "edge-intensity"],
      ];
      return controls.map(([key, suffix]) => ({
        key,
        input: queryElement(variant, suffix) as HTMLInputElement,
        output: queryElement(variant, `${suffix}-value`) as HTMLOutputElement,
      }));
    }

    function render() {
      globalThis.PipCompanion.popupSubtitleStyleRendering.render({
        document,
        variants,
        styles: store.styles,
        layout: store.layout,
        subtitleSettings: settings,
      });
    }

    function setControlsDisabled(disabled: boolean) {
      for (const variant of variants) {
        for (const control of numericControls(variant))
          control.input.disabled = disabled;
        for (const suffix of [
          "font-family",
          "text-color",
          "edge-style",
          "edge-color",
        ])
          (
            queryElement(variant, suffix) as
              HTMLInputElement | HTMLSelectElement
          ).disabled = disabled;
      }
      for (const id of [
        "subtitle-layout-background-color",
        "subtitle-layout-background-opacity",
        "subtitle-layout-pair-gap",
        "subtitle-layout-letter-spacing",
        "subtitle-layout-position",
        "subtitle-layout-reset",
        "subtitle-style-reset-current",
      ])
        (
          document.querySelector(`#${id}`) as
            HTMLInputElement | HTMLButtonElement
        ).disabled = disabled;
    }

    async function load() {
      await Promise.all([store.loadStyles(), store.loadLayout()]);
      setControlsDisabled(false);
      render();
    }

    function bindVariantControls(variant: SubtitleVariant) {
      for (const control of numericControls(variant)) {
        control.input.addEventListener("input", () => {
          store.updateStyle(variant, {
            ...store.styles[variant],
            [control.key]: Number(control.input.value),
          });
          store.saveStyle(variant);
        });
        control.input.addEventListener("change", () =>
          store.saveStyle(variant, true),
        );
      }
      for (const [suffix, key] of [
        ["font-family", "fontFamily"],
        ["text-color", "textColor"],
        ["edge-style", "edgeStyle"],
        ["edge-color", "edgeColor"],
      ] as const) {
        const input = queryElement(variant, suffix) as
          HTMLInputElement | HTMLSelectElement;
        input.addEventListener("input", () => {
          store.updateStyle(variant, {
            ...store.styles[variant],
            [key]: input.value,
          });
          store.saveStyle(variant);
        });
        input.addEventListener("change", () => store.saveStyle(variant, true));
      }
    }

    for (const variant of variants) bindVariantControls(variant);
    for (const tab of ["primary", "secondary"] as const) {
      const tabElement = document.querySelector(
        `[data-subtitle-tab="${tab}"]`,
      ) as HTMLButtonElement;
      tabElement.addEventListener("click", () => {
        activeVariant = tab;
        for (const candidate of ["primary", "secondary"] as const) {
          const candidateTab = document.querySelector(
            `[data-subtitle-tab="${candidate}"]`,
          ) as HTMLButtonElement;
          const candidatePanel = document.querySelector(
            `[data-subtitle-panel="${candidate}"]`,
          ) as HTMLElement;
          const active = candidate === activeVariant;
          candidateTab.classList.toggle("is-active", active);
          candidateTab.setAttribute("aria-selected", String(active));
          candidatePanel.hidden = !active;
        }
      });
    }

    const layoutInputs = [
      [
        document.querySelector(
          "#subtitle-layout-background-color",
        ) as HTMLInputElement,
        "backgroundColor",
      ],
      [
        document.querySelector(
          "#subtitle-layout-background-opacity",
        ) as HTMLInputElement,
        "backgroundOpacity",
      ],
      [
        document.querySelector("#subtitle-layout-pair-gap") as HTMLInputElement,
        "pairGap",
      ],
      [
        document.querySelector(
          "#subtitle-layout-letter-spacing",
        ) as HTMLInputElement,
        "letterSpacing",
      ],
      [
        document.querySelector("#subtitle-layout-position") as HTMLInputElement,
        "bottomOffset",
      ],
    ] as const;
    for (const [input, key] of layoutInputs) {
      input.addEventListener("input", () => {
        store.updateLayout({
          ...store.layout,
          [key]: key === "backgroundColor" ? input.value : Number(input.value),
        });
        store.saveLayout();
      });
      input.addEventListener("change", () => store.saveLayout(true));
    }

    (
      document.querySelector(
        "#subtitle-style-reset-current",
      ) as HTMLButtonElement
    ).addEventListener("click", () => {
      store.updateStyle(
        activeVariant,
        activeVariant === "primary"
          ? settings.DEFAULTS
          : settings.SECONDARY_DEFAULTS,
      );
      store.saveStyle(activeVariant, true);
    });
    (
      document.querySelector("#subtitle-layout-reset") as HTMLButtonElement
    ).addEventListener("click", () => {
      store.updateLayout({ ...settings.LAYOUT_DEFAULTS });
      store.saveLayout(true);
    });

    return {
      render,
      setControlsDisabled,
      load,
      handleStorageChange: store.handleStorageChange,
    };
  },
} satisfies PopupSubtitleStyleOptionsApi;
