"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuSettings = (() => {
  const STORAGE_KEY = "danmakuStyle";
  const FONT_FAMILIES: Record<DanmakuFontFamily, string> = {
    default: "system-ui, sans-serif",
    sansSerif: "sans-serif",
    serif: "serif",
    monospace: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
    arial: "Arial, sans-serif",
    notoSansTC: '"Noto Sans TC", "Noto Sans CJK TC", sans-serif',
    microsoftJhengHei:
      '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", sans-serif',
    song: '"Songti TC", "Songti SC", PMingLiU, MingLiU, SimSun, "Noto Serif CJK TC", serif',
    fangSong:
      'FangSong, "FangSong_GB2312", STFangsong, "Noto Serif CJK TC", serif',
    kai: '"DFKai-SB", BiauKai, KaiTi, "Noto Serif CJK TC", serif',
  };
  const SPEED_OPTIONS = [
    { value: 50, label: "超慢" },
    { value: 75, label: "較慢" },
    { value: 100, label: "適中" },
    { value: 150, label: "較快" },
    { value: 200, label: "超快" },
  ] as const;
  const DEFAULTS: DanmakuStyleSettings = {
    fontFamily: "default",
    fontSizeScale: 120,
    maxFontSize: 40,
    opacity: 85,
    speedScale: 100,
    fontWeight: 500,
    displayArea: 50,
  };

  function isDanmakuFontFamily(value: unknown): value is DanmakuFontFamily {
    return typeof value === "string" && Object.hasOwn(FONT_FAMILIES, value);
  }

  function normalize(value: unknown): DanmakuStyleSettings {
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
    const fontFamily = isDanmakuFontFamily(fontFamilyValue)
      ? fontFamilyValue
      : DEFAULTS.fontFamily;
    const requestedSpeedScale = settings.speedScale;
    const speedScale =
      typeof requestedSpeedScale === "number" &&
      Number.isFinite(requestedSpeedScale)
        ? SPEED_OPTIONS.reduce<number>(
            (nearest, { value: level }) =>
              Math.abs(level - requestedSpeedScale) <
              Math.abs(nearest - requestedSpeedScale)
                ? level
                : nearest,
            SPEED_OPTIONS[0].value,
          )
        : DEFAULTS.speedScale;
    return {
      fontFamily,
      fontSizeScale: clamp(
        settings.fontSizeScale,
        50,
        400,
        5,
        DEFAULTS.fontSizeScale,
      ),
      maxFontSize: clamp(settings.maxFontSize, 16, 96, 1, DEFAULTS.maxFontSize),
      opacity: clamp(settings.opacity, 10, 100, 5, DEFAULTS.opacity),
      speedScale,
      fontWeight: clamp(
        settings.fontWeight,
        400,
        900,
        100,
        DEFAULTS.fontWeight,
      ),
      displayArea: clamp(
        settings.displayArea,
        10,
        100,
        1,
        DEFAULTS.displayArea,
      ),
    };
  }

  return { STORAGE_KEY, FONT_FAMILIES, SPEED_OPTIONS, DEFAULTS, normalize };
})();
