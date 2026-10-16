"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.SubtitleTranslation = (() => {
  interface Options {
    getPreferences(): SubtitleTranslationPreferences;
    isSubtitlesEnabled(): boolean;
    isSubtitleTranslationSuspended(): boolean;
    isNativeSecondaryActive(): boolean;
    getNativeSecondaryLines(): SubtitleLine[];
    hasSupportedTrack(): boolean;
    prefersNativeSubtitle(targetLanguage: string): boolean;
    getPreferNativeSecondaryLines(
      targetLanguage: string,
    ): SubtitleLine[] | null;
    showFeedback(message: string): void;
    render(): void;
  }

  interface Runtime {
    onConfigChanged(previous: unknown, next: unknown): void;
    onPreferencesChanged(
      previous: SubtitleTranslationPreferences | null,
      next: SubtitleTranslationPreferences,
    ): void;
    onSubtitlesEnabledChanged(enabled: boolean): void;
    getRenderedSubtitleLines(
      sourceLines: SubtitleLine[],
    ): RenderedSubtitleLine[];
  }

  function withRole(
    lines: SubtitleLine[],
    role: RenderedSubtitleLine["role"],
  ): RenderedSubtitleLine[] {
    return lines.map((line, pairIndex) => ({ line, role, pairIndex }));
  }

  function withNativePairs(
    primaryLines: SubtitleLine[],
    secondaryLines: SubtitleLine[],
  ): RenderedSubtitleLine[] {
    return [
      ...primaryLines.map((line) => ({
        line,
        role: "primary" as const,
        pairIndex: 0,
      })),
      ...secondaryLines.map((line) => ({
        line,
        role: "secondary" as const,
        pairIndex: 0,
      })),
    ];
  }

  function uniqueRenderedLines(
    lines: RenderedSubtitleLine[],
  ): RenderedSubtitleLine[] {
    const seen = new Set<string>();
    return lines.filter(({ line, role }) => {
      const text = line.segments
        .map((segment) => segment.text)
        .join("")
        .replace(/\s+/g, " ")
        .trim()
        .normalize("NFC")
        .toLowerCase();
      const from = line.from ?? "";
      const to = line.to ?? "";
      const key = `${role}\u0000${from}\u0000${to}\u0000${text}`;
      if (!text || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function create(options: Options): Runtime {
    let generation = 0;
    let provider: SubtitleTranslationProvider = "microsoft";
    let failed = false;
    let inFlight = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let latestSignature = "";
    const cache = new Map<string, string>();

    const keyFor = (targetLanguage: string, text: string) =>
      `${provider}\u0000${targetLanguage}\u0000${text}`;

    const cancelQueued = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      latestSignature = "";
    };
    const invalidate = () => {
      generation++;
      cancelQueued();
    };
    const showFailure = () => {
      if (failed) return;
      failed = true;
      options.showFeedback(
        globalThis.PipCompanion.util.getMessage("pipTranslationRequestFailed"),
      );
    };
    const getCached = (key: string) => {
      const value = cache.get(key);
      if (value !== undefined) {
        cache.delete(key);
        cache.set(key, value);
      }
      return value;
    };
    const canTranslate = () => {
      const preferences = options.getPreferences();
      return (
        options.isSubtitlesEnabled() &&
        preferences.enabled &&
        !preferences.useNativeSecondaryTrack &&
        !options.isSubtitleTranslationSuspended()
      );
    };

    const request = (targetLanguage: string, texts: string[]) => {
      const signature = JSON.stringify([targetLanguage, texts]);
      if (signature !== latestSignature) {
        cancelQueued();
        latestSignature = signature;
      }
      if (failed || inFlight || timer !== null || !canTranslate()) return;
      let length = 0;
      const batch = Array.from(new Set(texts))
        .filter((text) => {
          if (
            !text ||
            text.length > 1000 ||
            text.includes("\u0000") ||
            cache.has(keyFor(targetLanguage, text)) ||
            length + text.length > 10000
          )
            return false;
          length += text.length;
          return true;
        })
        .slice(0, 20);
      if (!batch.length) return;
      const requestGeneration = generation;
      // 等待滾動字幕穩定。只保留目前可見的文字。
      timer = setTimeout(() => {
        timer = null;
        if (!canTranslate() || requestGeneration !== generation) return;
        inFlight = true;
        void chrome.runtime
          .sendMessage({
            type: "TRANSLATE_SUBTITLE_CUES",
            targetLanguage,
            texts: batch,
          } satisfies ExtensionMessage)
          .then((response: unknown) => {
            if (requestGeneration !== generation) return;
            if (
              !globalThis.PipCompanion.util.isRecord(response) ||
              response.ok !== true ||
              !Array.isArray(response.translations) ||
              response.translations.length !== batch.length ||
              !response.translations.every((text) => typeof text === "string")
            ) {
              // Busy 代表沒有實際送出上游請求；僅重試最新字幕。
              if (
                globalThis.PipCompanion.util.isRecord(response) &&
                ["busy", "disabled", "unavailable"].includes(
                  String(response.error),
                )
              )
                return;
              showFailure();
              return;
            }
            if (
              response.provider === "microsoft" ||
              response.provider === "google" ||
              response.provider === "deepl"
            )
              provider = response.provider;
            for (let index = 0; index < batch.length; index++)
              cache.set(
                keyFor(targetLanguage, batch[index]!),
                response.translations[index] as string,
              );
            trimMap(cache, 1000);
          })
          .catch(() => {
            if (requestGeneration === generation) showFailure();
          })
          .finally(() => {
            inFlight = false;
            options.render();
          });
      }, 300);
    };

    return {
      onConfigChanged(previous, next) {
        const activeConfig = (value: unknown) => {
          if (!globalThis.PipCompanion.util.isRecord(value)) return "";
          const provider = value.provider;
          return JSON.stringify([
            provider,
            value[`${provider}Key`],
            provider === "microsoft" ? value.microsoftRegion : "",
          ]);
        };
        for (const service of ["microsoft", "google", "deepl"] as const) {
          const credentials = (value: unknown) => {
            if (!globalThis.PipCompanion.util.isRecord(value)) return "";
            return JSON.stringify([
              value[`${service}Key`],
              service === "microsoft" ? value.microsoftRegion : "",
            ]);
          };
          if (credentials(previous) !== credentials(next))
            for (const key of cache.keys())
              if (key.startsWith(service + "\u0000")) cache.delete(key);
        }
        if (activeConfig(previous) === activeConfig(next)) return;
        invalidate();
        if (
          globalThis.PipCompanion.util.isRecord(next) &&
          (next.provider === "microsoft" ||
            next.provider === "google" ||
            next.provider === "deepl")
        )
          provider = next.provider;
        failed = false;
      },
      onPreferencesChanged(previous, next) {
        if (
          !previous ||
          previous.enabled !== next.enabled ||
          previous.targetLanguage !== next.targetLanguage ||
          previous.useNativeSecondaryTrack !== next.useNativeSecondaryTrack ||
          previous.preferNative !== next.preferNative
        )
          invalidate();
        if (previous && !previous.enabled && next.enabled) failed = false;
      },
      onSubtitlesEnabledChanged: (enabled) => {
        if (!enabled) invalidate();
      },
      getRenderedSubtitleLines(sourceLines) {
        if (!options.isSubtitlesEnabled()) {
          cancelQueued();
          return [];
        }
        const preferences = options.getPreferences();
        if (!preferences.enabled || options.isSubtitleTranslationSuspended()) {
          cancelQueued();
          return withRole(sourceLines, "primary");
        }
        if (preferences.useNativeSecondaryTrack) {
          cancelQueued();
          if (!options.isNativeSecondaryActive())
            return withRole(sourceLines, "primary");
          const secondaryLines = options.getNativeSecondaryLines();
          return uniqueRenderedLines(
            preferences.mode === "bilingual"
              ? withNativePairs(sourceLines, secondaryLines)
              : withRole(secondaryLines, "secondary"),
          );
        }

        if (!options.hasSupportedTrack()) {
          cancelQueued();
          return withRole(sourceLines, "primary");
        }
        if (preferences.preferNative) {
          if (options.prefersNativeSubtitle(preferences.targetLanguage)) {
            cancelQueued();
            return withRole(sourceLines, "primary");
          }
          // 原生軌有同語言字幕就直接拿來當第二字幕，不打付費翻譯 API。
          // 回傳 [] 表示軌已選定但 cue 還在載入；回傳 null 才走翻譯 API。
          const nativeSecondary = options.getPreferNativeSecondaryLines(
            preferences.targetLanguage,
          );
          if (nativeSecondary) {
            cancelQueued();
            return uniqueRenderedLines(
              preferences.mode === "bilingual"
                ? withNativePairs(sourceLines, nativeSecondary)
                : withRole(nativeSecondary, "secondary"),
            );
          }
        }

        const sourceTexts = sourceLines.map((line) =>
          line.segments
            .map((segment) => segment.text)
            .join("")
            .replace(/\s+/g, " ")
            .trim(),
        );
        request(preferences.targetLanguage, sourceTexts.filter(Boolean));
        const output: RenderedSubtitleLine[] = [];
        const translatedLines: RenderedSubtitleLine[] = [];
        for (let index = 0; index < sourceLines.length; index++) {
          const sourceLine = sourceLines[index]!;
          const text = sourceTexts[index]!;
          const translated = getCached(
            keyFor(preferences.targetLanguage, text),
          );
          if (preferences.mode === "bilingual") {
            output.push({
              line: sourceLine,
              role: "primary",
              pairIndex: 0,
            });
            if (translated)
              translatedLines.push({
                line: {
                  segments: [{ text: translated }],
                  ...(sourceLine.from !== undefined
                    ? { from: sourceLine.from }
                    : {}),
                  ...(sourceLine.to !== undefined ? { to: sourceLine.to } : {}),
                },
                role: "secondary",
                pairIndex: 0,
              });
          } else if (translated)
            output.push({
              line: {
                segments: [{ text: translated }],
                ...(sourceLine.from !== undefined
                  ? { from: sourceLine.from }
                  : {}),
                ...(sourceLine.to !== undefined ? { to: sourceLine.to } : {}),
              },
              role: "secondary",
              pairIndex: index,
            });
          else
            output.push({
              line: sourceLine,
              role: "primary",
              pairIndex: index,
            });
        }
        if (preferences.mode === "bilingual") output.push(...translatedLines);
        return uniqueRenderedLines(output);
      },
    };
  }

  function trimMap<T>(map: Map<string, T>, maxSize: number) {
    while (map.size > maxSize) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) return;
      map.delete(oldest);
    }
  }

  return { create };
})();
