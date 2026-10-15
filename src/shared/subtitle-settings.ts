"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleSettings = (() => {
  const STORAGE_KEY = "subtitleStyle";
  const SECONDARY_STORAGE_KEY = "secondarySubtitleStyle";
  const LAYOUT_STORAGE_KEY = "subtitleLayout";
  const FONT_FAMILIES = globalThis.PipCompanion.danmakuSettings.FONT_FAMILIES;
  const DEFAULTS: SubtitleStyleSettings = {
    fontFamily: "default",
    fontWeight: 400,
    lineHeightScale: 100,
    fontSizeScale: 100,
    textColor: "#ffffff",
    backgroundColor: "#303234",
    backgroundOpacity: 80,
    edgeStyle: "shadow",
    edgeColor: "#000000",
    edgeIntensity: 1,
    bottomOffset: 10,
  };
  const SECONDARY_DEFAULTS: SubtitleStyleSettings = {
    ...DEFAULTS,
    fontWeight: 400,
    fontSizeScale: 90,
    textColor: "#ffb80f",
  };
  const LAYOUT_DEFAULTS: SubtitleLayoutSettings = {
    backgroundColor: DEFAULTS.backgroundColor,
    backgroundOpacity: 50,
    bottomOffset: DEFAULTS.bottomOffset,
    pairGap: 35,
    letterSpacing: 0,
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
    if (!match) return [0, 0, 0];
    const [, red, green, blue] = match;
    if (!red || !green || !blue) return [0, 0, 0];
    return [parseInt(red, 16), parseInt(green, 16), parseInt(blue, 16)];
  }

  function rgba(color: RGB, alpha: number): string {
    return `rgba(${color.join(", ")}, ${alpha})`;
  }

  function isSubtitleFontFamily(value: unknown): value is SubtitleFontFamily {
    return typeof value === "string" && Object.hasOwn(FONT_FAMILIES, value);
  }

  function normalize(
    value: unknown,
    defaults: SubtitleStyleSettings = DEFAULTS,
  ): SubtitleStyleSettings {
    const settings = globalThis.PipCompanion.util.isRecord(value) ? value : {};
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
    const storedFontFamily = settings.fontFamily;
    const fontFamilyValue =
      storedFontFamily === "system"
        ? "default"
        : storedFontFamily === "newSong"
          ? "song"
          : storedFontFamily;
    const fontFamily = isSubtitleFontFamily(fontFamilyValue)
      ? fontFamilyValue
      : defaults.fontFamily;
    const storedEdgeStyle = settings.edgeStyle;
    const edgeStyleValue =
      storedEdgeStyle === "outline-shadow" ? "outline" : storedEdgeStyle;
    const edgeStyle =
      EDGE_STYLES.find((style) => style === edgeStyleValue) ??
      defaults.edgeStyle;
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
        defaults.fontWeight,
      ),
      lineHeightScale: clamp(
        settings.lineHeightScale,
        100,
        200,
        5,
        defaults.lineHeightScale,
      ),
      fontSizeScale: clamp(
        settings.fontSizeScale,
        50,
        200,
        5,
        defaults.fontSizeScale,
      ),
      textColor: color(settings.textColor, defaults.textColor),
      backgroundColor: color(
        settings.backgroundColor,
        defaults.backgroundColor,
      ),
      backgroundOpacity: clamp(
        settings.backgroundOpacity,
        0,
        100,
        5,
        defaults.backgroundOpacity,
      ),
      edgeStyle,
      edgeColor: color(settings.edgeColor, defaults.edgeColor),
      edgeIntensity: clamp(
        settings.edgeIntensity ?? settings.outlineWidth,
        0.5,
        3,
        0.5,
        defaults.edgeIntensity,
      ),
      bottomOffset: clamp(
        settings.bottomOffset,
        0,
        100,
        1,
        defaults.bottomOffset,
      ),
    };
  }

  // 舊版個別字幕樣式曾存背景與位置，現已改吃共用版面；讀到殘留值就地清掉。
  function scrubOrphanedStyleFields(
    stored: unknown,
    normalized: SubtitleStyleSettings,
  ): { style: SubtitleStyleSettings; changed: boolean } {
    const record = globalThis.PipCompanion.util.isRecord(stored)
      ? stored
      : null;
    const changed =
      record !== null &&
      (record.backgroundColor !== DEFAULTS.backgroundColor ||
        record.backgroundOpacity !== DEFAULTS.backgroundOpacity ||
        record.bottomOffset !== DEFAULTS.bottomOffset);
    if (!changed) return { style: normalized, changed: false };
    return {
      style: {
        ...normalized,
        backgroundColor: DEFAULTS.backgroundColor,
        backgroundOpacity: DEFAULTS.backgroundOpacity,
        bottomOffset: DEFAULTS.bottomOffset,
      },
      changed: true,
    };
  }

  function normalizeLayout(value: unknown): SubtitleLayoutSettings {
    const settings = globalThis.PipCompanion.util.isRecord(value) ? value : {};
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
    const color = (input: unknown, fallback: string) =>
      typeof input === "string" && /^#[\da-f]{6}$/i.test(input)
        ? input.toLowerCase()
        : fallback;
    return {
      backgroundColor: color(
        settings.backgroundColor,
        LAYOUT_DEFAULTS.backgroundColor,
      ),
      backgroundOpacity: clamp(
        settings.backgroundOpacity,
        0,
        100,
        5,
        LAYOUT_DEFAULTS.backgroundOpacity,
      ),
      bottomOffset: clamp(
        settings.bottomOffset,
        0,
        100,
        1,
        LAYOUT_DEFAULTS.bottomOffset,
      ),
      pairGap: clamp(settings.pairGap, 0, 100, 1, LAYOUT_DEFAULTS.pairGap),
      letterSpacing: clamp(
        settings.letterSpacing,
        0,
        30,
        1,
        LAYOUT_DEFAULTS.letterSpacing,
      ),
    };
  }

  function applyLayout(element: HTMLElement, settings: SubtitleLayoutSettings) {
    element.style.setProperty(
      "--subtitle-background",
      rgba(
        colorChannels(settings.backgroundColor),
        settings.backgroundOpacity / 100,
      ),
    );
    element.style.setProperty(
      "--subtitle-bottom-offset",
      `${settings.bottomOffset}%`,
    );
    element.style.setProperty(
      "--subtitle-pair-gap",
      `${settings.pairGap / 100}em`,
    );
    element.style.setProperty(
      "--subtitle-letter-spacing",
      `${settings.letterSpacing / 100}em`,
    );
  }

  function apply(element: HTMLElement, settings: SubtitleStyleSettings) {
    const hasOutline = settings.edgeStyle === "outline";
    const intensity = settings.edgeIntensity;
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
    const [red, green, blue] = edgeRgb;
    const lightEdgeRgb: RGB = [
      red + Math.round((255 - red) * 0.65),
      green + Math.round((255 - green) * 0.65),
      blue + Math.round((255 - blue) * 0.65),
    ];
    const darkEdgeRgb: RGB = [
      Math.round(red * 0.55),
      Math.round(green * 0.55),
      Math.round(blue * 0.55),
    ];
    let textShadow = "none";
    switch (settings.edgeStyle) {
      case "outline": {
        const width = "var(--subtitle-outline-width)";
        const negativeWidth = `calc(0px - ${width})`;
        textShadow = [
          `${negativeWidth} ${negativeWidth} 0 var(--subtitle-outline-color)`,
          `0 ${negativeWidth} 0 var(--subtitle-outline-color)`,
          `${width} ${negativeWidth} 0 var(--subtitle-outline-color)`,
          `${negativeWidth} 0 0 var(--subtitle-outline-color)`,
          `${width} 0 0 var(--subtitle-outline-color)`,
          `${negativeWidth} ${width} 0 var(--subtitle-outline-color)`,
          `0 ${width} 0 var(--subtitle-outline-color)`,
          `${width} ${width} 0 var(--subtitle-outline-color)`,
        ].join(", ");
        break;
      }
      case "raised":
        textShadow = `${-intensity}px ${-intensity}px ${intensity}px ${rgba(lightEdgeRgb, 0.65)}, ${intensity}px ${intensity}px ${intensity}px ${rgba(darkEdgeRgb, 0.95)}`;
        break;
      case "depressed":
        textShadow = `${intensity}px ${intensity}px ${intensity}px ${rgba(lightEdgeRgb, 0.55)}, ${-intensity}px ${-intensity}px ${intensity}px ${rgba(darkEdgeRgb, 0.95)}`;
        break;
      case "shadow":
        textShadow = `0 ${intensity}px ${intensity * 2}px ${rgba(edgeRgb, 0.95)}, 0 ${intensity * 2}px ${intensity * 5}px ${rgba(edgeRgb, 0.7)}`;
        break;
    }
    element.style.setProperty("--subtitle-text-shadow", textShadow);
    element.style.setProperty(
      "--subtitle-outline-width",
      hasOutline ? `${intensity}px` : "0px",
    );
    element.style.setProperty("--subtitle-outline-color", settings.edgeColor);
    element.style.setProperty(
      "--subtitle-bottom-offset",
      `${settings.bottomOffset}%`,
    );
  }

  return {
    STORAGE_KEY,
    SECONDARY_STORAGE_KEY,
    LAYOUT_STORAGE_KEY,
    FONT_FAMILIES,
    DEFAULTS,
    SECONDARY_DEFAULTS,
    LAYOUT_DEFAULTS,
    normalize,
    normalizeLayout,
    scrubOrphanedStyleFields,
    applyLayout,
    apply,
  };
})();
