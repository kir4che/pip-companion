"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.translationLanguageOptions = {
  nativeTracks(
    tracks: SubtitleTrackOption[],
    selectedTrack: string,
    noTracksLabel: string,
    chooseTrackLabel: string,
  ): TranslationLanguageOptionData[] {
    if (!tracks.length)
      return [
        {
          value: "",
          label: noTracksLabel,
          disabled: true,
          selected: true,
        },
      ];
    const options: TranslationLanguageOptionData[] = [];
    if (!selectedTrack)
      options.push({
        value: "",
        label: chooseTrackLabel,
        disabled: true,
        selected: true,
      });
    for (const track of tracks)
      options.push({
        value: track.id,
        label: track.label,
        selected: track.id === selectedTrack,
      });
    return options;
  },
  translationLanguages(
    languages: SubtitleTranslationLanguageOption[],
    selectedLanguage: string,
    getLanguageLabel: (code: string) => string,
  ): TranslationLanguageOptionData[] {
    const options = languages.map(({ code, label }) => {
      const localizedLabel = getLanguageLabel(code);
      return {
        value: code,
        label: localizedLabel === code ? label : localizedLabel,
      };
    });
    if (
      selectedLanguage &&
      !options.some((option) => option.value === selectedLanguage)
    )
      options.push({
        value: selectedLanguage,
        label: getLanguageLabel(selectedLanguage),
      });
    return options;
  },
};
