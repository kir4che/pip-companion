"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleStyleRendering = {
  render(options) {
    const {
      activeTarget,
      styles,
      styleControls,
      fontFamily,
      textColor,
      edgeStyle,
      edgeColor,
      edgeIntensityRow,
      styleButtons,
      styleLoaded,
      subtitlePreview,
      subtitlePreviewPrimary,
      subtitlePreviewSecondary,
      layout,
      pairGap,
      pairGapValue,
      letterSpacing,
      letterSpacingValue,
      backgroundColor,
      backgroundOpacity,
      backgroundOpacityValue,
      position,
      positionValue,
      subtitleSettings,
    } = options;
    const style = styles[activeTarget];
    for (const control of styleControls) {
      const value = style[control.key];
      control.input.value = String(value);
      control.output.value =
        control.key === "edgeIntensity" || control.key === "fontWeight"
          ? String(value)
          : `${value}%`;
    }
    fontFamily.value = style.fontFamily;
    textColor.value = style.textColor;
    edgeStyle.value = style.edgeStyle;
    edgeColor.value = style.edgeColor;
    edgeColor.disabled = !styleLoaded || style.edgeStyle === "none";
    const edgeEnabled = style.edgeStyle !== "none";
    const outlineControl = styleControls.find(
      (control) => control.key === "edgeIntensity",
    );
    if (outlineControl)
      outlineControl.input.disabled = !styleLoaded || !edgeEnabled;
    edgeIntensityRow.hidden = !edgeEnabled;
    for (const target of ["primary", "secondary"] as const)
      styleButtons[target].setAttribute(
        "aria-pressed",
        String(target === activeTarget),
      );
    subtitleSettings.apply(subtitlePreview, styles.primary);
    subtitleSettings.apply(subtitlePreviewPrimary, styles.primary);
    subtitleSettings.apply(subtitlePreviewSecondary, styles.secondary);
    pairGap.value = String(layout.pairGap);
    pairGapValue.value = `${(layout.pairGap / 100).toFixed(2)}em`;
    letterSpacing.value = String(layout.letterSpacing);
    letterSpacingValue.value = `${(layout.letterSpacing / 100).toFixed(2)}em`;
    backgroundColor.value = layout.backgroundColor;
    backgroundOpacity.value = String(layout.backgroundOpacity);
    backgroundOpacityValue.value = `${layout.backgroundOpacity}%`;
    position.value = String(layout.bottomOffset);
    positionValue.value = `${layout.bottomOffset}%`;
    subtitleSettings.applyLayout(subtitlePreview, layout);
  },
};
