"use strict";

globalThis.PipCompanion.optionsSubtitleStyleOptions = {
  create({ storage, settings, t, showStatus }) {
    const subtitleFontFamily = document.querySelector(
      "#subtitle-font-family",
    ) as HTMLSelectElement;
    const subtitleTextColor = document.querySelector(
      "#subtitle-text-color",
    ) as HTMLInputElement;
    const subtitleBackgroundColor = document.querySelector(
      "#subtitle-background-color",
    ) as HTMLInputElement;
    const subtitleBackgroundOpacity = document.querySelector(
      "#subtitle-background-opacity",
    ) as HTMLInputElement;
    const subtitleBackgroundOpacityValue = document.querySelector(
      "#subtitle-background-opacity-value",
    ) as HTMLOutputElement;
    const subtitleEdgeStyle = document.querySelector(
      "#subtitle-edge-style",
    ) as HTMLSelectElement;
    const subtitleEdgeColor = document.querySelector(
      "#subtitle-edge-color",
    ) as HTMLInputElement;
    const subtitleOutlineWidthRow = document.querySelector(
      "#subtitle-edge-intensity-row",
    ) as HTMLElement;
    const subtitlePosition = document.querySelector(
      "#subtitle-position",
    ) as HTMLInputElement;
    const subtitlePositionValue = document.querySelector(
      "#subtitle-position-value",
    ) as HTMLOutputElement;
    const subtitlePreview = document.querySelector(
      "#subtitle-preview",
    ) as HTMLElement;
    const subtitlePreviewPrimary = document.querySelector(
      "#subtitle-preview-primary",
    ) as HTMLElement;
    const subtitlePreviewSecondary = document.querySelector(
      "#subtitle-preview-secondary",
    ) as HTMLElement;
    const subtitlePairGap = document.querySelector(
      "#subtitle-pair-gap",
    ) as HTMLInputElement;
    const subtitlePairGapValue = document.querySelector(
      "#subtitle-pair-gap-value",
    ) as HTMLOutputElement;
    const subtitleLetterSpacing = document.querySelector(
      "#subtitle-letter-spacing",
    ) as HTMLInputElement;
    const subtitleLetterSpacingValue = document.querySelector(
      "#subtitle-letter-spacing-value",
    ) as HTMLOutputElement;

    const subtitleStyleTargets: SubtitleStyleTarget[] = [
      "primary",
      "secondary",
    ];
    const subtitleStyleDefaults: Record<
      SubtitleStyleTarget,
      SubtitleStyleSettings
    > = {
      primary: settings.DEFAULTS,
      secondary: settings.SECONDARY_DEFAULTS,
    };
    const subtitleStyleButtons: Record<SubtitleStyleTarget, HTMLButtonElement> =
      {
        primary: document.querySelector(
          "#subtitle-style-primary",
        ) as HTMLButtonElement,
        secondary: document.querySelector(
          "#subtitle-style-secondary",
        ) as HTMLButtonElement,
      };

    const subtitleStyleControls = [
      {
        key: "fontWeight",
        input: document.querySelector(
          "#subtitle-font-weight",
        ) as HTMLInputElement,
        output: document.querySelector(
          "#subtitle-font-weight-value",
        ) as HTMLOutputElement,
      },
      {
        key: "lineHeightScale",
        input: document.querySelector(
          "#subtitle-line-height",
        ) as HTMLInputElement,
        output: document.querySelector(
          "#subtitle-line-height-value",
        ) as HTMLOutputElement,
      },
      {
        key: "fontSizeScale",
        input: document.querySelector("#subtitle-size") as HTMLInputElement,
        output: document.querySelector(
          "#subtitle-size-value",
        ) as HTMLOutputElement,
      },
      {
        key: "edgeIntensity",
        input: document.querySelector(
          "#subtitle-edge-intensity",
        ) as HTMLInputElement,
        output: document.querySelector(
          "#subtitle-edge-intensity-value",
        ) as HTMLOutputElement,
      },
    ] as const;
    const subtitleStyleReset = document.querySelector(
      "#subtitle-style-reset",
    ) as HTMLButtonElement;
    const subtitleLayoutReset = document.querySelector(
      "#subtitle-layout-reset",
    ) as HTMLButtonElement;

    let activeSubtitleStyleTarget: SubtitleStyleTarget = "primary";
    let subtitleStyleControlsLoaded = false;
    let subtitleLayoutLoaded = false;
    const store = globalThis.PipCompanion.subtitleStyleStore.create({
      storage,
      settings,
      t,
      showStatus,
      onChange: renderSubtitleStyle,
    });

    function setSubtitleStyleControlsDisabled() {
      const styleDisabled = !subtitleStyleControlsLoaded;
      const layoutDisabled = !subtitleLayoutLoaded;
      subtitleFontFamily.disabled = styleDisabled;
      subtitleTextColor.disabled = styleDisabled;
      subtitleEdgeStyle.disabled = styleDisabled;
      subtitleEdgeColor.disabled = styleDisabled;
      subtitleBackgroundColor.disabled = layoutDisabled;
      subtitleBackgroundOpacity.disabled = layoutDisabled;
      subtitlePairGap.disabled = layoutDisabled;
      subtitleLetterSpacing.disabled = layoutDisabled;
      subtitlePosition.disabled = layoutDisabled;
      subtitleLayoutReset.disabled = layoutDisabled;
      for (const control of subtitleStyleControls)
        control.input.disabled = styleDisabled;
      subtitleStyleReset.disabled = styleDisabled;
      for (const button of Object.values(subtitleStyleButtons))
        button.disabled = styleDisabled;
    }

    function renderSubtitleStyle() {
      globalThis.PipCompanion.subtitleStyleRendering.render({
        activeTarget: activeSubtitleStyleTarget,
        styles: store.styles,
        styleControls: subtitleStyleControls,
        fontFamily: subtitleFontFamily,
        textColor: subtitleTextColor,
        edgeStyle: subtitleEdgeStyle,
        edgeColor: subtitleEdgeColor,
        edgeIntensityRow: subtitleOutlineWidthRow,
        styleButtons: subtitleStyleButtons,
        styleLoaded: subtitleStyleControlsLoaded,
        subtitlePreview,
        subtitlePreviewPrimary,
        subtitlePreviewSecondary,
        layout: store.layout,
        pairGap: subtitlePairGap,
        pairGapValue: subtitlePairGapValue,
        letterSpacing: subtitleLetterSpacing,
        letterSpacingValue: subtitleLetterSpacingValue,
        backgroundColor: subtitleBackgroundColor,
        backgroundOpacity: subtitleBackgroundOpacity,
        backgroundOpacityValue: subtitleBackgroundOpacityValue,
        position: subtitlePosition,
        positionValue: subtitlePositionValue,
        subtitleSettings: settings,
      });
    }

    function load() {
      void store.loadStyles().then(() => {
        subtitleStyleControlsLoaded = true;
        setSubtitleStyleControlsDisabled();
        renderSubtitleStyle();
      });
      void store.loadLayout().then(() => {
        subtitleLayoutLoaded = true;
        setSubtitleStyleControlsDisabled();
        renderSubtitleStyle();
      });
    }

    for (const control of subtitleStyleControls) {
      control.input.addEventListener("input", () => {
        const target = activeSubtitleStyleTarget;
        store.updateStyle(target, {
          ...store.styles[target],
          [control.key]: Number(control.input.value),
        });
        store.saveStyle(target);
      });
      control.input.addEventListener("change", () =>
        store.saveStyle(activeSubtitleStyleTarget, true),
      );
    }

    for (const [input, key] of [
      [subtitleBackgroundColor, "backgroundColor"],
      [subtitleBackgroundOpacity, "backgroundOpacity"],
      [subtitlePairGap, "pairGap"],
      [subtitleLetterSpacing, "letterSpacing"],
      [subtitlePosition, "bottomOffset"],
    ] as const) {
      input.addEventListener("input", () => {
        store.updateLayout({
          ...store.layout,
          [key]: key === "backgroundColor" ? input.value : Number(input.value),
        });
        store.saveLayout();
      });
      input.addEventListener("change", () => store.saveLayout(true));
    }

    for (const target of subtitleStyleTargets)
      subtitleStyleButtons[target].addEventListener("click", () => {
        activeSubtitleStyleTarget = target;
        renderSubtitleStyle();
      });

    subtitleFontFamily.addEventListener("change", () => {
      const target = activeSubtitleStyleTarget;
      store.updateStyle(target, {
        ...store.styles[target],
        fontFamily: subtitleFontFamily.value,
      });
      store.saveStyle(target, true);
    });
    subtitleEdgeStyle.addEventListener("change", () => {
      const target = activeSubtitleStyleTarget;
      store.updateStyle(target, {
        ...store.styles[target],
        edgeStyle: subtitleEdgeStyle.value,
      });
      store.saveStyle(target, true);
    });
    for (const [input, key] of [
      [subtitleTextColor, "textColor"],
      [subtitleEdgeColor, "edgeColor"],
    ] as const) {
      input.addEventListener("input", () => {
        const target = activeSubtitleStyleTarget;
        store.updateStyle(target, {
          ...store.styles[target],
          [key]: input.value,
        });
        store.saveStyle(target);
      });
      input.addEventListener("change", () =>
        store.saveStyle(activeSubtitleStyleTarget, true),
      );
    }
    subtitleStyleReset.addEventListener("click", () => {
      const target = activeSubtitleStyleTarget;
      store.updateStyle(target, subtitleStyleDefaults[target]);
      store.saveStyle(target, true);
    });
    subtitleLayoutReset.addEventListener("click", () => {
      store.updateLayout({ ...settings.LAYOUT_DEFAULTS });
      store.saveLayout(true);
    });

    return {
      render: renderSubtitleStyle,
      setControlsDisabled: setSubtitleStyleControlsDisabled,
      load,
      handleStorageChange: store.handleStorageChange,
    };
  },
} satisfies OptionsSubtitleStyleOptionsApi;
