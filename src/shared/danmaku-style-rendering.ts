"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuStyleRendering = {
  render(style, controls, fontFamily, speedOptions) {
    for (const control of controls) {
      const value = style[control.key];
      const speedIndex = speedOptions.findIndex(
        ({ value: speed }) => speed === value,
      );
      const label =
        control.key === "speedScale"
          ? (speedOptions[speedIndex]?.label ?? "")
          : control.key === "fontWeight"
            ? String(value)
            : control.key === "maxFontSize"
              ? `${value}px`
              : `${value}%`;
      control.input.value =
        control.key === "speedScale" ? String(speedIndex) : String(value);
      control.output.value = label;
      if (control.key === "speedScale")
        control.input.setAttribute("aria-valuetext", label);
    }
    fontFamily.value = style.fontFamily;
  },
};
