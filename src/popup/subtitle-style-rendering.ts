"use strict";

function queryPopupSubtitleElement(
  document: Document,
  variant: "primary" | "secondary",
  suffix: string,
): HTMLInputElement | HTMLSelectElement | HTMLOutputElement {
  return document.querySelector(`#${variant}-subtitle-${suffix}`) as
    HTMLInputElement | HTMLSelectElement | HTMLOutputElement;
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.popupSubtitleStyleRendering = {
  render({ document, variants, styles, layout, subtitleSettings }) {
    const subtitlePreview = document.querySelector(
      "#subtitle-preview",
    ) as HTMLElement;
    const subtitlePreviewSegments = {
      primary: document.querySelector(
        "#subtitle-preview-primary",
      ) as HTMLElement,
      secondary: document.querySelector(
        "#subtitle-preview-secondary",
      ) as HTMLElement,
    };

    for (const variant of variants) {
      const style = styles[variant];
      const fontFamily = queryPopupSubtitleElement(
        document,
        variant,
        "font-family",
      ) as HTMLSelectElement;
      const textColor = queryPopupSubtitleElement(
        document,
        variant,
        "text-color",
      ) as HTMLInputElement;
      const edgeStyle = queryPopupSubtitleElement(
        document,
        variant,
        "edge-style",
      ) as HTMLSelectElement;
      const edgeColor = queryPopupSubtitleElement(
        document,
        variant,
        "edge-color",
      ) as HTMLInputElement;
      const controls = [
        ["fontSizeScale", "size"],
        ["fontWeight", "font-weight"],
        ["lineHeightScale", "line-height"],
        ["edgeIntensity", "edge-intensity"],
      ] as const;
      for (const [key, suffix] of controls) {
        const input = queryPopupSubtitleElement(
          document,
          variant,
          suffix,
        ) as HTMLInputElement;
        const output = queryPopupSubtitleElement(
          document,
          variant,
          `${suffix}-value`,
        ) as HTMLOutputElement;
        const value = style[key];
        input.value = String(value);
        output.value =
          key === "edgeIntensity" || key === "fontWeight"
            ? String(value)
            : `${value}%`;
      }
      fontFamily.value = style.fontFamily;
      textColor.value = style.textColor;
      edgeStyle.value = style.edgeStyle;
      edgeColor.value = style.edgeColor;
      edgeColor.disabled = style.edgeStyle === "none";
      const edgeEnabled = style.edgeStyle !== "none";
      const edgeIntensityControl = queryPopupSubtitleElement(
        document,
        variant,
        "edge-intensity",
      ) as HTMLInputElement;
      edgeIntensityControl.disabled = !edgeEnabled;
      const edgeIntensityRow = document.querySelector(
        `[data-subtitle-edge-intensity-row="${variant}"]`,
      ) as HTMLElement;
      edgeIntensityRow.hidden = !edgeEnabled;
    }

    const backgroundColor = document.querySelector(
      "#subtitle-layout-background-color",
    ) as HTMLInputElement;
    const backgroundOpacity = document.querySelector(
      "#subtitle-layout-background-opacity",
    ) as HTMLInputElement;
    const backgroundOpacityValue = document.querySelector(
      "#subtitle-layout-background-opacity-value",
    ) as HTMLOutputElement;
    const pairGap = document.querySelector(
      "#subtitle-layout-pair-gap",
    ) as HTMLInputElement;
    const pairGapValue = document.querySelector(
      "#subtitle-layout-pair-gap-value",
    ) as HTMLOutputElement;
    const letterSpacing = document.querySelector(
      "#subtitle-layout-letter-spacing",
    ) as HTMLInputElement;
    const letterSpacingValue = document.querySelector(
      "#subtitle-layout-letter-spacing-value",
    ) as HTMLOutputElement;
    const position = document.querySelector(
      "#subtitle-layout-position",
    ) as HTMLInputElement;
    const positionValue = document.querySelector(
      "#subtitle-layout-position-value",
    ) as HTMLOutputElement;
    backgroundColor.value = layout.backgroundColor;
    backgroundOpacity.value = String(layout.backgroundOpacity);
    backgroundOpacityValue.value = `${layout.backgroundOpacity}%`;
    pairGap.value = String(layout.pairGap);
    pairGapValue.value = `${(layout.pairGap / 100).toFixed(2)}em`;
    letterSpacing.value = String(layout.letterSpacing);
    letterSpacingValue.value = `${(layout.letterSpacing / 100).toFixed(2)}em`;
    position.value = String(layout.bottomOffset);
    positionValue.value = `${layout.bottomOffset}%`;

    subtitleSettings.applyLayout(subtitlePreview, layout);
    for (const variant of variants)
      subtitleSettings.apply(subtitlePreviewSegments[variant], styles[variant]);
  },
};
