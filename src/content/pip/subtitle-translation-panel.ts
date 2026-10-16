"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.subtitleTranslationPanel = {
  create(doc: Document, t: (key: string) => string) {
    const translationButton = doc.createElement("button");
    translationButton.type = "button";
    translationButton.className = "translation-button";
    translationButton.hidden = true;
    translationButton.setAttribute("aria-expanded", "false");
    translationButton.setAttribute("aria-haspopup", "true");
    const translationIcon = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "svg",
    );
    translationIcon.setAttribute("viewBox", "0 0 24 24");
    translationIcon.setAttribute("aria-hidden", "true");
    const translationPath = doc.createElementNS(
      "http://www.w3.org/2000/svg",
      "path",
    );
    translationPath.setAttribute(
      "d",
      "M21 4H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm-11 7H8.5v-1H7v4h1.5v-1H10v1c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2zm9 0h-1.5v-1H16v4h1.5v-1H19v1c0 .55-.45 1-1 1h-3c-.55 0-1-.45-1-1V9c0-.55.45-1 1-1h3c.55 0 1 .45 1 1v2z",
    );
    translationIcon.append(translationPath);
    translationButton.append(translationIcon);

    const translationPanel = doc.createElement("section");
    translationPanel.id = "pip-subtitle-translation-panel";
    translationPanel.className = "subtitle-translation-panel";
    translationPanel.hidden = true;
    translationPanel.setAttribute("aria-label", t("pipTranslationSettings"));
    translationButton.setAttribute("aria-controls", translationPanel.id);

    const subtitlePrimaryRow = doc.createElement("label");
    subtitlePrimaryRow.className = "subtitle-translation-row";
    const subtitlePrimaryText = doc.createElement("span");
    subtitlePrimaryText.textContent = t("pipSubtitleTrack");
    const subtitlePrimaryTrack = doc.createElement("select");
    subtitlePrimaryTrack.setAttribute("aria-label", t("pipSubtitleTrack"));
    subtitlePrimaryRow.append(subtitlePrimaryText, subtitlePrimaryTrack);

    const translationServiceRow = doc.createElement("label");
    translationServiceRow.className = "subtitle-translation-row";
    const translationServiceText = doc.createElement("span");
    const translationServiceLabel = doc.createTextNode(
      t("pipTranslationSource"),
    );
    const translationServiceHintIcon = doc.createElement("span");
    translationServiceHintIcon.className = "subtitle-translation-hint-icon";
    translationServiceHintIcon.textContent = "?";
    translationServiceHintIcon.setAttribute(
      "data-tip",
      t("pipTranslationSourceHelp"),
    );
    translationServiceHintIcon.tabIndex = 0;
    translationServiceHintIcon.setAttribute("role", "img");
    translationServiceHintIcon.setAttribute(
      "aria-label",
      t("pipTranslationSourceHelp"),
    );
    const translationServiceHintTooltip = doc.createElement("div");
    translationServiceHintTooltip.id = "pip-subtitle-translation-hint";
    translationServiceHintTooltip.className =
      "subtitle-translation-hint-tooltip";
    translationServiceHintTooltip.setAttribute("role", "tooltip");
    translationServiceHintTooltip.hidden = true;
    translationServiceHintTooltip.textContent = t("pipTranslationSourceHelp");
    translationServiceHintIcon.setAttribute(
      "aria-describedby",
      translationServiceHintTooltip.id,
    );
    translationServiceText.append(
      translationServiceLabel,
      translationServiceHintIcon,
    );
    const translationService = doc.createElement("select");
    translationService.setAttribute("aria-label", t("pipTranslationSource"));
    const nativeSubtitleOption = doc.createElement("option");
    nativeSubtitleOption.value = "none";
    nativeSubtitleOption.textContent = t("pipTranslationNoService");
    translationService.append(nativeSubtitleOption);
    const translationProviders: {
      provider: SubtitleTranslationProvider;
      label: string;
    }[] = [
      { provider: "microsoft", label: "Microsoft Translator" },
      { provider: "google", label: "Google Cloud Translation" },
      { provider: "deepl", label: "DeepL API" },
    ];
    for (const { provider, label } of translationProviders) {
      const option = doc.createElement("option");
      option.value = provider;
      option.textContent = label;
      option.disabled = true;
      translationService.append(option);
    }
    translationServiceRow.append(translationServiceText, translationService);

    const translationEnabledRow = doc.createElement("label");
    translationEnabledRow.className = "subtitle-translation-row";
    const translationEnabledText = doc.createElement("span");
    translationEnabledText.textContent = t("pipTranslationEnable");
    const translationEnabled = doc.createElement("input");
    translationEnabled.type = "checkbox";
    translationEnabled.className = "subtitle-translation-toggle";
    translationEnabled.setAttribute("role", "switch");
    translationEnabled.setAttribute("aria-label", t("pipTranslationEnable"));
    translationEnabledRow.append(translationEnabledText, translationEnabled);

    const subtitlesEnabledRow = doc.createElement("label");
    subtitlesEnabledRow.className = "subtitle-translation-row";
    const subtitlesEnabledText = doc.createElement("span");
    subtitlesEnabledText.textContent = t("pipSubtitlesToggle");
    const subtitlesEnabled = doc.createElement("input");
    subtitlesEnabled.type = "checkbox";
    subtitlesEnabled.className = "subtitle-translation-toggle";
    subtitlesEnabled.setAttribute("role", "switch");
    subtitlesEnabled.setAttribute("aria-label", t("pipSubtitlesToggle"));
    subtitlesEnabledRow.append(subtitlesEnabledText, subtitlesEnabled);

    const translationModeRow = doc.createElement("label");
    translationModeRow.className = "subtitle-translation-row";
    const translationModeText = doc.createElement("span");
    translationModeText.textContent = t("pipTranslationDisplayMode");
    const translationMode = doc.createElement("select");
    translationMode.setAttribute("aria-label", t("pipTranslationDisplayMode"));
    for (const [value, key] of [
      ["bilingual", "pipTranslationBilingual"],
      ["translation-only", "pipTranslationOnly"],
    ] as const) {
      const option = doc.createElement("option");
      option.value = value;
      option.textContent = t(key);
      translationMode.append(option);
    }
    translationModeRow.append(translationModeText, translationMode);

    const translationLanguageRow = doc.createElement("label");
    translationLanguageRow.className = "subtitle-translation-row";
    const translationLanguageText = doc.createElement("span");
    translationLanguageText.textContent = t("pipTranslationLanguage");
    const translationLanguage = doc.createElement("select");
    translationLanguage.setAttribute("aria-label", t("pipTranslationLanguage"));
    const subtitleTranslationLanguages =
      globalThis.PipCompanion.subtitleTranslationSettings.LANGUAGES.map(
        (code) => ({
          code,
          label:
            globalThis.PipCompanion.subtitleTranslationSettings.getLanguageLabel(
              code,
            ),
        }),
      );
    for (const language of subtitleTranslationLanguages) {
      const option = doc.createElement("option");
      option.value = language.code;
      option.textContent = language.label;
      translationLanguage.append(option);
    }
    translationLanguageRow.append(translationLanguageText, translationLanguage);

    const preferNativeRow = doc.createElement("label");
    preferNativeRow.className = "subtitle-translation-row";
    const preferNativeText = doc.createElement("span");
    preferNativeText.textContent = t("pipTranslationPreferNative");
    const preferNative = doc.createElement("input");
    preferNative.type = "checkbox";
    preferNative.setAttribute("aria-label", t("pipTranslationPreferNative"));
    preferNativeRow.append(preferNativeText, preferNative);

    translationPanel.append(
      subtitlesEnabledRow,
      subtitlePrimaryRow,
      translationEnabledRow,
      translationServiceRow,
      translationLanguageRow,
      translationModeRow,
      preferNativeRow,
    );
    return {
      translationButton,
      translationPanel,
      subtitlePrimaryRow,
      translationLanguageRow,
      translationModeRow,
      subtitlePrimaryText,
      subtitlePrimaryTrack,
      translationServiceLabel,
      translationServiceHintIcon,
      translationServiceHintTooltip,
      translationService,
      nativeSubtitleOption,
      translationEnabledText,
      translationEnabled,
      subtitlesEnabledText,
      subtitlesEnabled,
      translationModeText,
      translationMode,
      translationLanguageText,
      translationLanguage,
      subtitleTranslationLanguages,
      preferNativeRow,
      preferNativeText,
      preferNative,
    };
  },
};
