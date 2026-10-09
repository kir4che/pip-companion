"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.captionSettings = (() => {
  const STORAGE_KEY = "captionStyle";
  const FONT_FAMILIES = globalThis.PipCompanion.danmakuSettings.FONT_FAMILIES;
  const DEFAULTS: CaptionStyleSettings = {
    fontFamily: "default",
    fontWeight: 400,
    lineHeightScale: 100,
    fontSizeScale: 100,
    textColor: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 75,
    edgeStyle: "none",
    edgeColor: "#000000",
    outlineWidth: 1,
    bottomOffset: 10,
  };
  const EDGE_STYLES = [
    "none",
    "shadow",
    "raised",
    "depressed",
    "outline",
  ] as const;

  type RGB = [number, number, number];

  function colorChannels(hex: string): RGB {
    const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
    return match
      ? [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)]
      : [0, 0, 0];
  }

  function rgba(color: RGB, alpha: number): string {
    return `rgba(${color.join(", ")}, ${alpha})`;
  }

  function normalize(value: unknown): CaptionStyleSettings {
    const settings =
      value && typeof value === "object"
        ? (value as Partial<CaptionStyleSettings>)
        : {};
    const clamp = (
      input: unknown,
      min: number,
      max: number,
      step: number,
      fallback: number,
    ) => {
      if (typeof input !== "number" || !Number.isFinite(input)) return fallback;
      const bounded = Math.max(min, Math.min(max, input));
      return min + Math.round((bounded - min) / step) * step;
    };
    const storedFontFamily = (settings as Record<string, unknown>).fontFamily;
    const fontFamilyValue =
      storedFontFamily === "system"
        ? "default"
        : storedFontFamily === "newSong"
          ? "song"
          : storedFontFamily;
    const fontFamily =
      typeof fontFamilyValue === "string" &&
      Object.hasOwn(FONT_FAMILIES, fontFamilyValue)
        ? (fontFamilyValue as DanmakuFontFamily)
        : DEFAULTS.fontFamily;
    const storedEdgeStyle = (settings as Record<string, unknown>).edgeStyle;
    const edgeStyleValue =
      storedEdgeStyle === "outline-shadow" ? "outline" : storedEdgeStyle;
    const edgeStyle = EDGE_STYLES.includes(
      edgeStyleValue as (typeof EDGE_STYLES)[number],
    )
      ? (edgeStyleValue as CaptionStyleSettings["edgeStyle"])
      : DEFAULTS.edgeStyle;
    const color = (input: unknown, fallback: string) =>
      typeof input === "string" && /^#[\da-f]{6}$/i.test(input)
        ? input.toLowerCase()
        : fallback;

    return {
      fontFamily,
      fontWeight: clamp(
        settings.fontWeight,
        100,
        900,
        100,
        DEFAULTS.fontWeight,
      ),
      lineHeightScale: clamp(
        settings.lineHeightScale,
        100,
        200,
        5,
        DEFAULTS.lineHeightScale,
      ),
      fontSizeScale: clamp(
        settings.fontSizeScale,
        50,
        200,
        5,
        DEFAULTS.fontSizeScale,
      ),
      textColor: color(settings.textColor, DEFAULTS.textColor),
      backgroundColor: color(
        settings.backgroundColor,
        DEFAULTS.backgroundColor,
      ),
      backgroundOpacity: clamp(
        settings.backgroundOpacity,
        0,
        100,
        5,
        DEFAULTS.backgroundOpacity,
      ),
      edgeStyle,
      edgeColor: color(settings.edgeColor, DEFAULTS.edgeColor),
      outlineWidth: clamp(
        settings.outlineWidth,
        0.5,
        3,
        0.5,
        DEFAULTS.outlineWidth,
      ),
      bottomOffset: clamp(
        settings.bottomOffset,
        0,
        100,
        1,
        DEFAULTS.bottomOffset,
      ),
    };
  }

  function apply(element: HTMLElement, settings: CaptionStyleSettings) {
    const hasOutline = settings.edgeStyle === "outline";
    element.style.setProperty(
      "--subtitle-font-family",
      FONT_FAMILIES[settings.fontFamily],
    );
    element.style.setProperty(
      "--subtitle-font-size",
      `${(4.8 * settings.fontSizeScale) / 100}cqh`,
    );
    element.style.setProperty(
      "--subtitle-font-weight",
      String(settings.fontWeight),
    );
    element.style.setProperty(
      "--subtitle-line-height",
      String(settings.lineHeightScale / 100),
    );
    element.style.setProperty("--subtitle-text-color", settings.textColor);
    element.style.setProperty(
      "--subtitle-background",
      rgba(
        colorChannels(settings.backgroundColor),
        settings.backgroundOpacity / 100,
      ),
    );
    const edgeRgb = colorChannels(settings.edgeColor);
    const lightEdgeRgb = edgeRgb.map((channel) =>
      Math.round(channel + (255 - channel) * 0.65),
    ) as RGB;
    const darkEdgeRgb = edgeRgb.map((channel) =>
      Math.round(channel * 0.55),
    ) as RGB;
    let textShadow = "none";
    switch (settings.edgeStyle) {
      case "raised":
        textShadow = `-1px -1px 1px ${rgba(lightEdgeRgb, 0.65)}, 1px 1px 1px ${rgba(darkEdgeRgb, 0.95)}`;
        break;
      case "depressed":
        textShadow = `1px 1px 1px ${rgba(lightEdgeRgb, 0.55)}, -1px -1px 1px ${rgba(darkEdgeRgb, 0.95)}`;
        break;
      case "shadow":
        textShadow = `0 1px 2px ${rgba(edgeRgb, 0.95)}, 0 1px 5px ${rgba(edgeRgb, 0.7)}`;
        break;
    }
    element.style.setProperty("--subtitle-text-shadow", textShadow);
    element.style.setProperty(
      "--subtitle-outline-width",
      hasOutline ? `${settings.outlineWidth}px` : "0px",
    );
    element.style.setProperty("--subtitle-outline-color", settings.edgeColor);
    element.style.setProperty(
      "--subtitle-bottom-offset",
      `${settings.bottomOffset}%`,
    );
  }

  return { STORAGE_KEY, FONT_FAMILIES, DEFAULTS, normalize, apply };
})();
