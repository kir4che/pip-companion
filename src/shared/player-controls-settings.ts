"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.playerControlsSettings = (() => {
  const STORAGE_KEY = "playerControls";

  const CONTROL_IDS: readonly PlayerControlId[] = [
    "danmaku-send",
    "play",
    "next",
    "time",
    "progress",
    "volume",
    "speed",
    "translation",
    "playlist",
    "danmaku-search",
  ] as const;

  const DEFAULT_CONTROLS_CONFIG: readonly PlayerControlItemConfig[] = [
    { id: "danmaku-send", visible: true },
    { id: "play", visible: true },
    { id: "next", visible: true },
    { id: "time", visible: true },
    { id: "progress", visible: true },
    { id: "volume", visible: true },
    { id: "speed", visible: true },
    { id: "translation", visible: true },
    { id: "playlist", visible: true },
    { id: "danmaku-search", visible: true },
  ];

  const ID_SET = new Set<string>(CONTROL_IDS);

  const ITEM_NAME_KEYS: Record<PlayerControlId, string> = {
    play: "optionsPlayerControlsItemPlay",
    "danmaku-send": "optionsPlayerControlsItemDanmakuSend",
    next: "optionsPlayerControlsItemNext",
    time: "optionsPlayerControlsItemTime",
    progress: "optionsPlayerControlsItemProgress",
    volume: "optionsPlayerControlsItemVolume",
    speed: "optionsPlayerControlsItemSpeed",
    translation: "optionsPlayerControlsItemTranslation",
    playlist: "optionsPlayerControlsItemPlaylist",
    "danmaku-search": "optionsPlayerControlsItemDanmakuSearch",
  };

  function getItemName(
    id: PlayerControlId,
    t: (key: string, substitutions?: string | string[]) => string,
  ): string {
    const key = ITEM_NAME_KEYS[id];
    return key ? t(key) : id;
  }

  function normalize(raw: unknown): PlayerControlItemConfig[] {
    const result: PlayerControlItemConfig[] = [];
    const seen = new Set<string>();

    if (Array.isArray(raw)) {
      for (const item of raw) {
        if (!item || typeof item !== "object") continue;
        const candidateId = (item as { id?: unknown }).id;
        if (
          typeof candidateId === "string" &&
          ID_SET.has(candidateId) &&
          !seen.has(candidateId)
        ) {
          const visible = (item as { visible?: unknown }).visible !== false;
          seen.add(candidateId);
          result.push({
            id: candidateId as PlayerControlId,
            visible,
          });
        }
      }
    }

    for (const def of DEFAULT_CONTROLS_CONFIG)
      if (!seen.has(def.id)) {
        result.push({ id: def.id, visible: def.visible });
        seen.add(def.id);
      }

    return result;
  }

  return {
    STORAGE_KEY,
    CONTROL_IDS,
    DEFAULT_CONTROLS_CONFIG,
    normalize,
    getItemName,
  };
})();
