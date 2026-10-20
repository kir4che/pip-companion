"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.PipUI = (() => {
  const t = globalThis.PipCompanion.util.getMessage;

  function create(win: Window, actions: PipUiActions, video: HTMLVideoElement) {
    const doc = win.document;
    const eventScope = globalThis.PipCompanion.PipEventScope.create(win);
    const seekVideo = (
      videoSource: HTMLVideoElement,
      targetSeconds: number,
    ) => {
      globalThis.PipCompanion.ContentDanmakuJump?.clearDanmaku?.();
      if (globalThis.PipCompanion.site.isNetflixHost(location.hostname)) {
        window.postMessage(
          { type: "PIP_NETFLIX_SEEK", targetSeconds },
          location.origin,
        );
        return;
      }
      videoSource.currentTime = targetSeconds;
    };
    doc.documentElement.lang = globalThis.PipCompanion.util.getHtmlLanguage();

    const style = doc.createElement("style");
    style.textContent = globalThis.PipCompanion.PipStyles.get().join("\n");

    const app = doc.createElement("main");
    app.className = "app";
    const screen = doc.createElement("div");
    screen.className = "screen";
    const subtitle = doc.createElement("div");
    subtitle.className = "subtitle";
    const feedback = doc.createElement("div");
    feedback.className = "feedback";
    feedback.setAttribute("role", "status");
    feedback.setAttribute("aria-live", "polite");
    feedback.hidden = true;
    const miniProgress = doc.createElement("div");
    miniProgress.className = "mini-progress";
    miniProgress.setAttribute("role", "progressbar");
    miniProgress.setAttribute("aria-label", t("pipProgress"));
    miniProgress.setAttribute("aria-valuemin", "0");
    miniProgress.setAttribute("aria-valuemax", "100");
    miniProgress.setAttribute("aria-valuenow", "0");
    const miniProgressFill = doc.createElement("span");
    miniProgressFill.className = "mini-progress-fill";
    miniProgress.append(miniProgressFill);

    const controls = doc.createElement("div");
    controls.className = "controls";
    const timeTooltip = doc.createElement("div");
    timeTooltip.className = "time-tooltip";
    timeTooltip.hidden = true;
    timeTooltip.setAttribute("aria-hidden", "true");
    const timeTooltipThumb = doc.createElement("div");
    timeTooltipThumb.className = "time-tooltip-thumb";
    const timeTooltipText = doc.createElement("span");
    timeTooltipText.className = "time-tooltip-text";
    timeTooltip.append(timeTooltipThumb, timeTooltipText);

    const clearTimeTooltipThumb = () => {
      timeTooltip.classList.remove("has-thumb");
      timeTooltipThumb.style.display = "none";
      timeTooltipThumb.style.backgroundImage = "none";
    };

    const makeButton = (action: string, label: string, ariaLabel: string) => {
      const button = doc.createElement("button");
      button.type = "button";
      button.dataset.action = action;
      button.textContent = label;
      button.setAttribute("aria-label", ariaLabel);
      return button;
    };

    const {
      toggle: danmakuSendToggle,
      panel: danmakuSendPanel,
      input: danmakuSendInput,
      count: danmakuSendCount,
      submit: danmakuSendSubmit,
      status: danmakuSendStatus,
    } = globalThis.PipCompanion.danmakuInputPanel.create(doc, t, {
      canSend: actions.canSendDanmaku,
      makeButton,
    });

    const danmakuSearch = globalThis.PipCompanion.danmakuSearchPanel.create(
      doc,
      t,
      {
        makeButton,
        onSeek: (seconds) => {
          const videoSource = actions.getVideo();
          if (videoSource) seekVideo(videoSource, seconds);
          actions.seekDanmakuJump?.(seconds);
        },
        getMessages: actions.getDanmakuMessages,
        loadAllMessages: actions.loadAllDanmakuMessages,
        supportsHeatPeaks: () => actions.supportsDanmakuHeatPeaks?.() ?? false,
        getDuration: () => actions.getVideo()?.duration,
        shortcutHint: globalThis.PipCompanion.util.formatShortcut(
          actions.getShortcut("pipDanmakuSearchShortcut"),
        ),
      },
    );
    const {
      toggle: danmakuSearchToggle,
      panel: danmakuSearchPanel,
      input: danmakuSearchInput,
    } = danmakuSearch;

    const playButton = makeButton("play", "▶", t("pipPlayVideo"));
    const nextButton = makeButton("next", "", t("pipNextEpisode"));
    nextButton.hidden = true;
    const playlistButton = makeButton("playlist", "", t("pipPlaylist"));
    playlistButton.className = "playlist-button";
    playlistButton.hidden = true;
    playlistButton.setAttribute("aria-expanded", "false");
    const icons = globalThis.PipCompanion?.icons;
    if (icons)
      playlistButton.append(
        icons.createSvg(doc, { path: icons.PLAYLIST_PATH }),
      );
    const {
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
      subtitleTranslationLanguages: initialSubtitleTranslationLanguages,
      preferNativeRow,
      preferNativeText,
      preferNative,
    } = globalThis.PipCompanion.subtitleTranslationPanel.create(doc, t);
    let subtitleTranslationLanguages = initialSubtitleTranslationLanguages;
    const blurActiveElementWithin = (container: Element) => {
      const activeElement = doc.activeElement;
      if (
        activeElement &&
        container.contains(activeElement) &&
        "blur" in activeElement &&
        typeof activeElement.blur === "function"
      )
        activeElement.blur();
    };
    const playlistPanel = doc.createElement("section");
    playlistPanel.id = "pip-playlist-panel";
    playlistPanel.className = "playlist-panel";
    playlistButton.setAttribute("aria-controls", playlistPanel.id);
    playlistPanel.hidden = true;
    playlistPanel.setAttribute("aria-label", t("pipPlaylist"));
    if (icons)
      nextButton.append(icons.createSvg(doc, { path: icons.NEXT_PATH }));

    const playbackControls = globalThis.PipCompanion.playbackControls.create(
      doc,
      t,
      makeButton,
      actions.volumeIconPath,
    );
    const {
      speedButton,
      timeGroup,
      timeCurrent,
      timeDuration,
      progress,
      progressMax,
      volumeControl,
      volumeButton,
      volumePath,
      volumeValue,
      volumeSlider,
      speedControl,
      speedSlider,
    } = playbackControls;

    const controlElements: Record<PlayerControlId, HTMLElement> = {
      "danmaku-send": danmakuSendToggle,
      play: playButton,
      next: nextButton,
      time: timeGroup,
      progress,
      volume: volumeControl,
      speed: speedControl,
      translation: translationButton,
      playlist: playlistButton,
      "danmaku-search": danmakuSearchToggle,
    };

    const playerControlsSettings =
      globalThis.PipCompanion?.playerControlsSettings;

    const applyControlsLayout = (customConfig?: PlayerControlItemConfig[]) => {
      const config =
        customConfig ||
        playerControlsSettings?.DEFAULT_CONTROLS_CONFIG ||
        (Object.keys(controlElements).map((id) => ({
          id: id as PlayerControlId,
          visible: true,
        })) as PlayerControlItemConfig[]);

      const elementsToAppend: HTMLElement[] = [];
      for (const item of config) {
        const el = controlElements[item.id];
        if (el) {
          if (!item.visible) el.dataset.controlHidden = "true";
          else delete el.dataset.controlHidden;
          elementsToAppend.push(el);
        }
      }
      controls.replaceChildren(timeTooltip, ...elementsToAppend);
    };

    const applyThemeColor = (customColor?: string) => {
      const color =
        customColor || playerControlsSettings?.DEFAULT_THEME_COLOR || "#ff3333";
      screen.style?.setProperty?.("--pip-accent", color);
      doc.documentElement?.style?.setProperty?.("--pip-accent", color);
      progress.style?.setProperty?.("accent-color", color);
      volumeSlider.style?.setProperty?.("accent-color", color);
      speedSlider.style?.setProperty?.("accent-color", color);
    };

    if (globalThis.chrome?.storage?.local) {
      const storageKeys = [
        playerControlsSettings?.STORAGE_KEY,
        playerControlsSettings?.THEME_STORAGE_KEY,
      ].filter(Boolean) as string[];

      void globalThis.chrome.storage.local.get(storageKeys).then(
        (stored) => {
          const config = playerControlsSettings?.normalize(
            stored[playerControlsSettings.STORAGE_KEY],
          );
          applyControlsLayout(config);
          const color = playerControlsSettings?.normalizeThemeColor(
            stored[playerControlsSettings.THEME_STORAGE_KEY],
          );
          applyThemeColor(color);
        },
        () => {
          applyControlsLayout();
          applyThemeColor();
        },
      );
    } else {
      applyControlsLayout();
      applyThemeColor();
    }
    screen.append(
      subtitle,
      feedback,
      danmakuSendStatus,
      danmakuSendPanel,
      danmakuSearchPanel,
      playlistPanel,
      translationPanel,
      miniProgress,
      controls,
      translationServiceHintTooltip,
    );
    app.append(screen);
    doc.head.replaceChildren(style);
    doc.body.replaceChildren(app);
    const pipSelects = [
      subtitlePrimaryTrack,
      translationService,
      translationMode,
      translationLanguage,
    ];
    for (const select of pipSelects)
      globalThis.PipCompanion.customSelect.enhance(select);
    doc.title = t("pipTitle");

    const refreshShortcuts = () => {
      const format = (key: ShortcutKey) =>
        globalThis.PipCompanion.util.formatShortcut(
          actions.getShortcut(key),
          true,
        );
      const setAriaShortcuts = (el: HTMLElement, keys: ShortcutKey[]) => {
        const value = keys.map(format).filter(Boolean).join(" ");
        if (value) el.setAttribute("aria-keyshortcuts", value);
        else el.removeAttribute("aria-keyshortcuts");
      };
      setAriaShortcuts(playButton, ["pipPlayPauseShortcut"]);
      setAriaShortcuts(speedButton, [
        "pipPlaybackRateDownShortcut",
        "pipPlaybackRateUpShortcut",
      ]);
      setAriaShortcuts(volumeButton, ["pipMuteShortcut"]);
      setAriaShortcuts(danmakuSearchToggle, ["pipDanmakuSearchShortcut"]);
    };
    refreshShortcuts();

    const refreshSubtitleTracks = () => {
      const tracks = actions.getSubtitleTracks();
      if (actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack)
        refreshSubtitleTranslationPreferences();
      const hasSubtitleSource = actions.hasSubtitleSource();
      translationButton.hidden = !hasSubtitleSource;
      if (translationButton.hidden) {
        translationPanel.hidden = true;
        translationButton.setAttribute("aria-expanded", "false");
      }
      subtitlePrimaryRow.hidden = tracks.length === 0;
      subtitlePrimaryTrack.disabled = tracks.length < 2;
      if (subtitlePrimaryRow.hidden) {
        subtitlePrimaryTrack.replaceChildren();
        subtitlePrimaryTrack.dataset.signature = "";
        return;
      }
      const signature = [t("pipSubtitleTrackChoose")]
        .concat(
          tracks.map((track) => `${track.id}:${track.label}:${track.selected}`),
        )
        .join("|");
      if (subtitlePrimaryTrack.dataset.signature === signature) return;
      subtitlePrimaryTrack.dataset.signature = signature;
      subtitlePrimaryTrack.replaceChildren();
      if (tracks.length > 1 && !tracks.some((track) => track.selected)) {
        const placeholder = doc.createElement("option");
        placeholder.value = "";
        placeholder.textContent = t("pipSubtitleTrackChoose");
        placeholder.selected = true;
        subtitlePrimaryTrack.append(placeholder);
      }
      for (const track of tracks) {
        const option = doc.createElement("option");
        option.value = track.id;
        option.textContent = track.label;
        option.selected = track.selected || tracks.length === 1;
        subtitlePrimaryTrack.append(option);
      }
    };
    eventScope.listen(subtitlePrimaryTrack, "change", () => {
      if (!subtitlePrimaryTrack.value) return;
      actions.selectSubtitleTrack(subtitlePrimaryTrack.value);
    });
    let hasNativeSecondaryTracks = false;
    const refreshTranslationLanguageOptions = () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      translationLanguage.replaceChildren();
      let selectedValue = preferences.targetLanguage;
      let optionData: TranslationLanguageOptionData[];
      if (preferences.useNativeSecondaryTrack) {
        const tracks = actions.getSecondarySubtitleTracks();
        selectedValue = actions.getSelectedSecondarySubtitleTrack();
        hasNativeSecondaryTracks = tracks.length > 0;
        optionData =
          globalThis.PipCompanion.translationLanguageOptions.nativeTracks(
            tracks,
            selectedValue,
            t("pipTranslationNoSecondaryTracks"),
            t("pipTranslationChooseSecondaryTrack"),
          );
      } else {
        hasNativeSecondaryTracks = false;
        optionData =
          globalThis.PipCompanion.translationLanguageOptions.translationLanguages(
            subtitleTranslationLanguages,
            selectedValue,
            (code) =>
              globalThis.PipCompanion.subtitleTranslationSettings.getLanguageLabel(
                code,
              ),
          );
      }
      for (const data of optionData) {
        const option = doc.createElement("option");
        option.value = data.value;
        option.textContent = data.label;
        option.disabled = data.disabled === true;
        option.selected = data.selected === true;
        translationLanguage.append(option);
      }
      translationLanguage.value = selectedValue;
    };
    let translationServicesRequestId = 0;
    let activeTranslationServiceConfigured = false;
    const refreshSubtitleTranslationServices = () => {
      const requestId = ++translationServicesRequestId;
      if (!actions.getSubtitlesEnabled()) {
        translationService.disabled = true;
        return;
      }
      void actions.getSubtitleTranslationServices().then((result) => {
        if (requestId !== translationServicesRequestId) return;
        if (result) {
          activeTranslationServiceConfigured = false;
          for (const option of Array.from(translationService.options)) {
            if (option.value === "none") {
              option.disabled = false;
              continue;
            }
            const service = result.services.find(
              (item) => item.provider === option.value,
            );
            option.disabled = service?.configured !== true;
            if (result.provider === option.value)
              activeTranslationServiceConfigured = service?.configured === true;
          }
          translationService.value = actions.getSubtitleTranslationPreferences()
            .useNativeSecondaryTrack
            ? "none"
            : result.provider;
        }
        translationService.disabled = false;
        refreshSubtitleTranslationPreferences();
      });
    };
    const refreshSubtitleTranslationPreferences = () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      const subtitlesEnabledValue = actions.getSubtitlesEnabled();
      if (!subtitlesEnabledValue) {
        translationServicesRequestId++;
        translationLanguageRequestId++;
        activeTranslationServiceConfigured = false;
        translationService.disabled = true;
      }
      refreshTranslationLanguageOptions();
      const canUseSelectedSource = preferences.useNativeSecondaryTrack
        ? hasNativeSecondaryTracks
        : activeTranslationServiceConfigured;
      translationEnabled.checked =
        preferences.enabled && !actions.isSubtitleTranslationSuspended();
      subtitlesEnabled.checked = subtitlesEnabledValue;
      translationMode.value = preferences.mode;
      if (!preferences.useNativeSecondaryTrack)
        translationLanguage.value = preferences.targetLanguage;
      preferNative.checked = preferences.preferNative;
      translationServiceLabel.textContent = t("pipTranslationSource");
      translationMode.options[0]!.textContent = t(
        preferences.useNativeSecondaryTrack
          ? "pipTranslationOriginalAndSecondary"
          : "pipTranslationBilingual",
      );
      translationMode.options[1]!.textContent = t(
        preferences.useNativeSecondaryTrack
          ? "pipTranslationSecondaryOnly"
          : "pipTranslationOnly",
      );
      translationLanguageText.textContent = t("pipTranslationLanguage");
      preferNativeRow.hidden = preferences.useNativeSecondaryTrack;
      translationLanguageRow.hidden = false;
      translationModeRow.hidden = false;
      translationEnabled.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      subtitlesEnabled.disabled = false;
      translationMode.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      translationLanguage.disabled =
        !subtitlesEnabledValue || !canUseSelectedSource;
      preferNative.disabled =
        !subtitlesEnabledValue ||
        preferences.useNativeSecondaryTrack ||
        !canUseSelectedSource;
      translationButton.setAttribute(
        "aria-pressed",
        String(
          preferences.enabled && !actions.isSubtitleTranslationSuspended(),
        ),
      );
    };
    const positionTranslationServiceHintTooltip = () => {
      if (translationServiceHintTooltip.hidden) return;
      const iconRect = translationServiceHintIcon.getBoundingClientRect();
      const screenRect = screen.getBoundingClientRect();
      const margin = 8;
      const gap = 6;
      const maxLeft =
        screen.clientWidth - translationServiceHintTooltip.offsetWidth - margin;
      let left = iconRect.left - screenRect.left;
      let top = iconRect.bottom - screenRect.top + gap;
      if (
        top + translationServiceHintTooltip.offsetHeight >
        screen.clientHeight - margin
      )
        top =
          iconRect.top -
          screenRect.top -
          translationServiceHintTooltip.offsetHeight -
          gap;
      left = Math.max(margin, Math.min(left, maxLeft));
      top = Math.max(margin, top);
      translationServiceHintTooltip.style.left = `${left}px`;
      translationServiceHintTooltip.style.top = `${top}px`;
    };
    const showTranslationServiceHintTooltip = () => {
      translationServiceHintTooltip.hidden = false;
      positionTranslationServiceHintTooltip();
    };
    const hideTranslationServiceHintTooltip = () => {
      translationServiceHintTooltip.hidden = true;
    };
    eventScope.listen(
      translationServiceHintIcon,
      "pointerenter",
      showTranslationServiceHintTooltip,
    );
    eventScope.listen(
      translationServiceHintIcon,
      "pointerleave",
      hideTranslationServiceHintTooltip,
    );
    eventScope.listen(
      translationServiceHintIcon,
      "focus",
      showTranslationServiceHintTooltip,
    );
    eventScope.listen(
      translationServiceHintIcon,
      "blur",
      hideTranslationServiceHintTooltip,
    );
    eventScope.listen(
      translationPanel,
      "scroll",
      positionTranslationServiceHintTooltip,
    );
    eventScope.listen(win, "resize", positionTranslationServiceHintTooltip);
    const saveSubtitleTranslationPreferences = (
      patch: Partial<SubtitleTranslationPreferences>,
    ) =>
      actions.setSubtitleTranslationPreferences({
        ...actions.getSubtitleTranslationPreferences(),
        ...patch,
      });
    let translationLanguageRequestId = 0;
    const refreshAvailableTranslationLanguages = () => {
      const requestId = ++translationLanguageRequestId;
      if (
        !actions.getSubtitlesEnabled() ||
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
      )
        return;
      void actions.getSubtitleTranslationLanguages().then((languages) => {
        if (requestId !== translationLanguageRequestId) return;
        if (!languages.length) return;
        subtitleTranslationLanguages = languages;
        refreshTranslationLanguageOptions();
      });
    };
    eventScope.listen(translationService, "change", () => {
      if (translationService.value === "none") {
        const preferences = actions.getSubtitleTranslationPreferences();
        saveSubtitleTranslationPreferences({ useNativeSecondaryTrack: true });
        // 切到原生時，沿用目標語言自動挑軌；沒有相符軌就不動，不硬選。
        const match = actions
          .getSecondarySubtitleTracks()
          .find((track) =>
            globalThis.PipCompanion.subtitleLanguageTags.matches(
              track.language ?? "",
              preferences.targetLanguage,
            ),
          );
        if (match && match.id !== actions.getSelectedSecondarySubtitleTrack())
          actions.selectSecondarySubtitleTrack(match.id);
        refreshSubtitleTranslationPreferences();
        return;
      }
      const provider = translationService.value as SubtitleTranslationProvider;
      translationService.disabled = true;
      void actions.setSubtitleTranslationProvider(provider).then((saved) => {
        activeTranslationServiceConfigured = saved;
        if (!saved) actions.showFeedback(t("pipTranslationServiceUnavailable"));
        else {
          // 切到機器翻譯時，把已選原生軌的語言帶成目標語言，帶不過去才保留原值。
          const selectedSecondary = actions
            .getSecondarySubtitleTracks()
            .find(
              (track) =>
                track.id === actions.getSelectedSecondarySubtitleTrack(),
            );
          const carriedLanguage =
            selectedSecondary?.language &&
            globalThis.PipCompanion.subtitleLanguageTags.isValid(
              selectedSecondary.language,
            )
              ? selectedSecondary.language
              : actions.getSubtitleTranslationPreferences().targetLanguage;
          saveSubtitleTranslationPreferences({
            useNativeSecondaryTrack: false,
            targetLanguage: carriedLanguage,
          });
        }
        refreshSubtitleTranslationServices();
        if (saved && actions.getSubtitleTranslationPreferences().enabled)
          refreshAvailableTranslationLanguages();
      });
    });
    eventScope.listen(translationEnabled, "change", () => {
      const enabled = translationEnabled.checked;
      if (enabled) actions.resumeSubtitleTranslation();
      saveSubtitleTranslationPreferences({ enabled });
      if (
        enabled &&
        !actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
      )
        refreshAvailableTranslationLanguages();
    });
    eventScope.listen(subtitlesEnabled, "change", () => {
      actions.toggleSubtitles();
      refreshSubtitleTranslationPreferences();
      if (actions.getSubtitlesEnabled()) refreshSubtitleTranslationServices();
    });
    eventScope.listen(translationMode, "change", () =>
      saveSubtitleTranslationPreferences({
        mode:
          translationMode.value === "bilingual"
            ? "bilingual"
            : "translation-only",
      }),
    );
    eventScope.listen(translationLanguage, "change", () => {
      const preferences = actions.getSubtitleTranslationPreferences();
      if (preferences.useNativeSecondaryTrack) {
        if (
          !actions.getSelectedSecondarySubtitleTrack() &&
          preferences.mode !== "bilingual"
        )
          saveSubtitleTranslationPreferences({ mode: "bilingual" });
        actions.selectSecondarySubtitleTrack(translationLanguage.value);
      } else
        saveSubtitleTranslationPreferences({
          targetLanguage:
            translationLanguage.value as SubtitleTranslationLanguage,
        });
    });
    eventScope.listen(preferNative, "change", () =>
      saveSubtitleTranslationPreferences({
        preferNative: preferNative.checked,
      }),
    );
    const closeTranslationPanel = () => {
      blurActiveElementWithin(translationPanel);
      translationPanel.hidden = true;
      translationButton.setAttribute("aria-expanded", "false");
    };
    const isTranslationTarget = (target: EventTarget | null) =>
      target !== null &&
      (translationPanel.contains(target as Node) ||
        translationButton.contains(target as Node) ||
        [
          subtitlePrimaryTrack,
          translationService,
          translationMode,
          translationLanguage,
        ].some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(select, target),
        ));
    const isTranslationPanelFocusTarget = (target: EventTarget | null) =>
      target !== null &&
      (translationPanel.contains(target as Node) ||
        [
          subtitlePrimaryTrack,
          translationService,
          translationMode,
          translationLanguage,
        ].some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(select, target),
        ));
    eventScope.listen(translationButton, "click", (e) => {
      const open = translationPanel.hidden;
      translationPanel.hidden = !open;
      translationButton.setAttribute("aria-expanded", String(open));
      if (open) {
        danmakuSearch.close();
        refreshSubtitleTracks();
        refreshSubtitleTranslationServices();
        refreshSubtitleTranslationPreferences();
        if (e.detail === 0) translationEnabled.focus();
        const preferences = actions.getSubtitleTranslationPreferences();
        if (
          actions.getSubtitlesEnabled() &&
          preferences.enabled &&
          !preferences.useNativeSecondaryTrack
        )
          refreshAvailableTranslationLanguages();
      }
    });
    eventScope.listen(
      screen,
      "pointerdown",
      (e) => {
        if (!translationPanel.hidden && !isTranslationTarget(e.target))
          closeTranslationPanel();
      },
      { capture: true },
    );
    eventScope.listen(
      screen,
      "focusin",
      (e) => {
        if (!translationPanel.hidden && !isTranslationTarget(e.target))
          closeTranslationPanel();
      },
      { capture: true },
    );
    eventScope.listen(
      win,
      "keydown",
      (e) => {
        if (
          translationPanel.hidden ||
          e.key !== "Escape" ||
          globalThis.PipCompanion.customSelect.isOpenForTarget(e.target)
        )
          return;
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTranslationPanel();
        translationButton.focus();
      },
      { capture: true },
    );

    const refreshLocale = () => {
      doc.documentElement.lang = globalThis.PipCompanion.util.getHtmlLanguage();
      doc.title = t("pipTitle");
      miniProgress.setAttribute("aria-label", t("pipProgress"));
      const danmakuInputLabel = t(
        danmakuSendPanel.hidden
          ? "pipDanmakuInputOpen"
          : "pipDanmakuInputClose",
      );
      danmakuSendToggle.setAttribute("aria-label", danmakuInputLabel);
      danmakuSendToggle.title = danmakuInputLabel;
      danmakuSendInput.setAttribute("aria-label", t("pipChatMessage"));
      danmakuSendSubmit.textContent =
        danmakuCooldownUntil > Date.now()
          ? t(
              "pipCooldownSeconds",
              String(Math.ceil((danmakuCooldownUntil - Date.now()) / 1000)),
            )
          : t("pipSend");
      nextButton.setAttribute("aria-label", t("pipNextEpisode"));
      playlistButton.setAttribute("aria-label", t("pipPlaylist"));
      playlistPanel.setAttribute("aria-label", t("pipPlaylist"));
      speedButton.setAttribute(
        "aria-label",
        t("pipPlaybackSpeed", speedButton.textContent ?? "1×"),
      );
      timeCurrent.setAttribute("aria-label", t("pipCurrentTime"));
      progress.setAttribute("aria-label", t("pipProgress"));
      volumeButton.setAttribute("aria-label", t("pipVolumeControl"));
      volumeValue.setAttribute("aria-label", t("pipVolumeValue"));
      volumeSlider.setAttribute("aria-label", t("pipVolume"));
      speedSlider.setAttribute("aria-label", t("pipSpeed"));
      subtitlePrimaryText.textContent = t("pipSubtitleTrack");
      subtitlePrimaryTrack.setAttribute("aria-label", t("pipSubtitleTrack"));
      translationPanel.setAttribute("aria-label", t("pipTranslationSettings"));
      translationServiceLabel.textContent = t("pipTranslationSource");
      translationServiceHintIcon.setAttribute(
        "data-tip",
        t("pipTranslationSourceHelp"),
      );
      translationServiceHintTooltip.textContent = t("pipTranslationSourceHelp");
      translationServiceHintIcon.setAttribute(
        "aria-label",
        t("pipTranslationSourceHelp"),
      );
      translationService.setAttribute("aria-label", t("pipTranslationSource"));
      nativeSubtitleOption.textContent = t("pipTranslationNoService");
      translationEnabledText.textContent = t("pipTranslationEnable");
      translationEnabled.setAttribute("aria-label", t("pipTranslationEnable"));
      subtitlesEnabledText.textContent = t("pipSubtitlesToggle");
      subtitlesEnabled.setAttribute("aria-label", t("pipSubtitlesToggle"));
      translationModeText.textContent = t("pipTranslationDisplayMode");
      translationMode.setAttribute(
        "aria-label",
        t("pipTranslationDisplayMode"),
      );
      translationLanguageText.textContent = t("pipTranslationLanguage");
      translationLanguage.setAttribute(
        "aria-label",
        t("pipTranslationLanguage"),
      );
      translationMode.options[0]!.textContent = t(
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
          ? "pipTranslationOriginalAndSecondary"
          : "pipTranslationBilingual",
      );
      translationMode.options[1]!.textContent = t(
        actions.getSubtitleTranslationPreferences().useNativeSecondaryTrack
          ? "pipTranslationSecondaryOnly"
          : "pipTranslationOnly",
      );
      refreshTranslationLanguageOptions();
      preferNativeText.textContent = t("pipTranslationPreferNative");
      preferNative.setAttribute("aria-label", t("pipTranslationPreferNative"));
      translationButton.setAttribute("aria-label", t("pipTranslationSettings"));
      translationButton.title = t("pipTranslationSettings");
      refreshSubtitleTracks();
      refreshSubtitleTranslationPreferences();
      refreshSubtitleTranslationServices();
      actions.updatePlaybackUi();
    };

    const ui = {
      get video() {
        return video;
      },
      setVideo(nextVideo: HTMLVideoElement) {
        video = nextVideo;
      },
      screen,
      subtitle,
      feedback,
      volumeValue,
      volumeButton,
      volumePath,
      playButton,
      nextButton,
      playlistButton,
      playlistPanel,
      speedControl,
      speedButton,
      speedSlider,
      volumeSlider,
      progress,
      timeCurrent,
      timeDuration,
      miniProgress,
      miniProgressFill,
      timeTooltip,
      timeTooltipThumb,
      timeTooltipText,
      dispose: () => {
        eventScope.dispose();
        for (const select of pipSelects)
          globalThis.PipCompanion.customSelect.disposeForSelect(select);
      },
      refreshLocale,
      refreshShortcuts,
      refreshSubtitleTranslationPreferences,
      refreshSubtitleTranslationServices,
      applyControlsLayout,
      applyThemeColor,
      refreshSubtitleTranslationLanguages: () => {
        const preferences = actions.getSubtitleTranslationPreferences();
        if (
          !translationPanel.hidden &&
          preferences.enabled &&
          !preferences.useNativeSecondaryTrack
        )
          refreshAvailableTranslationLanguages();
        else {
          translationLanguageRequestId++;
          if (preferences.useNativeSecondaryTrack)
            refreshTranslationLanguageOptions();
        }
      },
      setDanmakuEnabled: (enabled: boolean) => setDanmakuEnabled(enabled),
      openDanmakuSearch: () => danmakuSearch.open(),
      toggleDanmakuSearch: () => danmakuSearch.togglePanel(),
      setDanmakuMessages: (messages: DanmakuData[], duration?: number) =>
        danmakuSearch.setMessages(messages, duration),
      setThumbnailPreviewEnabled: (enabled: boolean) => {
        if (!enabled) clearTimeTooltipThumb();
      },
      refreshSubtitleTracks,
    };

    const update = () => actions.updatePlaybackUi();
    const togglePlayback = () => {
      danmakuSearch.close();
      actions.togglePlayback();
    };
    let danmakuSendStatusTimer: number | undefined;
    const setDanmakuSendStatus = (msg: string | null) => {
      if (danmakuSendStatusTimer !== undefined) {
        eventScope.clearTimeout(danmakuSendStatusTimer);
        danmakuSendStatusTimer = undefined;
      }
      if (msg === null || danmakuSendPanel.hidden) {
        danmakuSendStatus.textContent = "";
        danmakuSendStatus.hidden = true;
        return;
      }
      danmakuSendStatus.textContent = msg;
      danmakuSendStatus.hidden = false;
      danmakuSendStatusTimer = eventScope.setTimeout(() => {
        danmakuSendStatusTimer = undefined;
        if (danmakuSendStatus.textContent === msg) setDanmakuSendStatus(null);
      }, 3000);
    };
    const setDanmakuSendPanelOpen = (open: boolean) => {
      danmakuSendPanel.hidden = !open;
      danmakuSendToggle.setAttribute("aria-expanded", String(open));
      const label = open ? t("pipDanmakuInputClose") : t("pipDanmakuInputOpen");
      danmakuSendToggle.setAttribute("aria-label", label);
      danmakuSendToggle.title = label;
    };
    const openDanmakuSendPanel = () => {
      if (!danmakuEnabled || !actions.canSendDanmaku) return;
      danmakuSearch.close();
      setDanmakuSendPanelOpen(true);
      refreshDanmakuCharacterLimit();
      danmakuSendInput.focus();
    };
    const closeDanmakuSendPanel = () => {
      blurActiveElementWithin(danmakuSendPanel);
      setDanmakuSendPanelOpen(false);
      setDanmakuSendStatus(null);
    };
    let danmakuEnabled = true;
    let sendingDanmaku = false;
    let danmakuCharacterLimit: number | null = null;
    let danmakuCooldownUntil = 0;
    let danmakuCooldownTimer: number | undefined;
    const setDanmakuEnabled = (enabled: boolean) => {
      danmakuEnabled = enabled;
      danmakuSendToggle.hidden = !enabled || !actions.canSendDanmaku;
      danmakuSearchToggle.hidden = !enabled;
      danmakuSendInput.disabled = !enabled || !actions.canSendDanmaku;
      danmakuSendSubmit.disabled =
        !enabled ||
        !actions.canSendDanmaku ||
        sendingDanmaku ||
        danmakuCooldownUntil > Date.now();
      if (!enabled) {
        closeDanmakuSendPanel();
        danmakuSendInput.blur();
        danmakuSearch.close();
      }
    };
    const updateDanmakuCharacterCount = () => {
      const length = danmakuSendInput.value.length;
      danmakuSendCount.textContent =
        danmakuCharacterLimit === null
          ? ""
          : `${length} / ${danmakuCharacterLimit}`;
      danmakuSendCount.hidden = danmakuCharacterLimit === null;
      danmakuSendCount.classList.toggle(
        "is-over-limit",
        danmakuCharacterLimit !== null && length > danmakuCharacterLimit,
      );
    };
    const refreshDanmakuCharacterLimit = () => {
      danmakuCharacterLimit = actions.getDanmakuCharacterLimit();
      if (danmakuCharacterLimit === null)
        danmakuSendInput.removeAttribute("maxlength");
      else danmakuSendInput.maxLength = danmakuCharacterLimit;
      updateDanmakuCharacterCount();
    };
    const updateDanmakuCooldown = () => {
      const remaining = danmakuCooldownUntil - Date.now();
      if (remaining <= 0) {
        danmakuCooldownUntil = 0;
        danmakuCooldownTimer = undefined;
        danmakuSendSubmit.textContent = t("pipSend");
        danmakuSendSubmit.disabled =
          !danmakuEnabled || !actions.canSendDanmaku || sendingDanmaku;
        return;
      }
      danmakuSendSubmit.disabled = true;
      danmakuSendSubmit.textContent = t(
        "pipCooldownSeconds",
        String(Math.ceil(remaining / 1000)),
      );
      danmakuCooldownTimer = eventScope.setTimeout(
        updateDanmakuCooldown,
        Math.min(1000, remaining),
      );
    };
    const sendDanmaku = async () => {
      if (!danmakuEnabled || !actions.canSendDanmaku || sendingDanmaku) return;
      if (danmakuCooldownUntil > Date.now()) {
        const seconds = Math.ceil((danmakuCooldownUntil - Date.now()) / 1000);
        setDanmakuSendStatus(t("pipWaitToSend", String(seconds)));
        return;
      }
      if (danmakuCooldownTimer !== undefined)
        eventScope.clearTimeout(danmakuCooldownTimer);
      danmakuCooldownTimer = undefined;
      danmakuCooldownUntil = 0;
      danmakuSendSubmit.textContent = t("pipSend");
      danmakuSendSubmit.disabled = false;

      refreshDanmakuCharacterLimit();
      if (!danmakuSendInput.value.trim()) {
        setDanmakuSendStatus(t("pipEnterDanmaku"));
        return;
      }
      if (
        danmakuCharacterLimit !== null &&
        danmakuSendInput.value.length > danmakuCharacterLimit
      ) {
        setDanmakuSendStatus(
          t("pipDanmakuTooLong", String(danmakuCharacterLimit)),
        );
        return;
      }

      setDanmakuSendStatus(null);
      sendingDanmaku = true;
      const sendStartedAt = Date.now();
      const submittedText = danmakuSendInput.value;
      danmakuSendSubmit.disabled = true;
      try {
        const result = await actions.sendDanmaku(submittedText);
        if (result.ok) {
          danmakuCooldownUntil = sendStartedAt + 5000;
          if (
            result.nativeInputCleared &&
            danmakuSendInput.value === submittedText
          ) {
            danmakuSendInput.value = "";
            updateDanmakuCharacterCount();
          }
          updateDanmakuCooldown();
        } else setDanmakuSendStatus(t("pipSendUnavailable"));
      } catch {
        setDanmakuSendStatus(t("pipSendFailed"));
      } finally {
        sendingDanmaku = false;
        if (danmakuCooldownUntil === 0) {
          danmakuSendSubmit.disabled =
            !danmakuEnabled || !actions.canSendDanmaku;
          danmakuSendSubmit.textContent = t("pipSend");
        }
      }
    };
    refreshDanmakuCharacterLimit();
    const showSpeedFeedback = () => {
      const rate = actions.getVideo()?.playbackRate;
      if (rate) actions.showFeedback(`${Math.round(rate * 100) / 100}×`);
    };
    const adjustPlaybackRate = (direction: number) => {
      actions.adjustPlaybackRate(direction);
      showSpeedFeedback();
    };
    const togglePlaybackRate = () => {
      actions.togglePlaybackRate();
      showSpeedFeedback();
    };
    const toggleMute = () => actions.toggleMute();

    eventScope.listen(volumeButton, "click", toggleMute);
    eventScope.listen(speedButton, "click", togglePlaybackRate);
    eventScope.listen(danmakuSendToggle, "click", () => {
      if (!danmakuEnabled || !actions.canSendDanmaku) return;
      if (danmakuSendPanel.hidden) openDanmakuSendPanel();
      else closeDanmakuSendPanel();
    });
    eventScope.listen(danmakuSendPanel, "submit", (e) => {
      e.preventDefault();
      void sendDanmaku();
    });
    eventScope.listen(danmakuSendInput, "input", updateDanmakuCharacterCount);
    eventScope.listen(danmakuSendInput, "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && e.isComposing) {
        e.preventDefault();
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeDanmakuSendPanel();
        danmakuSendToggle.focus();
      }
    });
    eventScope.listen(danmakuSendPanel, "keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      closeDanmakuSendPanel();
      danmakuSendToggle.focus();
    });
    eventScope.listen(playButton, "click", togglePlayback);
    eventScope.listen(
      screen,
      "click",
      (e) => {
        if (e.target !== screen && e.target !== video) return;
        e.stopPropagation();
        togglePlayback();
      },
      { capture: true },
    );
    eventScope.listen(nextButton, "click", () => actions.playNext());
    const closePlaylist = () => {
      blurActiveElementWithin(playlistPanel);
      playlistPanel.hidden = true;
      playlistButton.setAttribute("aria-expanded", "false");
    };
    const isPlaylistTarget = (target: EventTarget | null) =>
      target !== null &&
      (playlistPanel.contains(target as Node) ||
        playlistButton.contains(target as Node));
    const isPlaylistPanelFocusTarget = (target: EventTarget | null) =>
      target !== null && playlistPanel.contains(target as Node);
    const isDanmakuSearchTarget = (target: EventTarget | null) =>
      target !== null &&
      (danmakuSearchPanel.contains(target as Node) ||
        danmakuSearchToggle.contains(target as Node));
    const isDanmakuSearchFocusTarget = (target: EventTarget | null) =>
      target !== null && danmakuSearchPanel.contains(target as Node);
    let playlistCloseTimer = 0;
    eventScope.listen(win, "pointerleave", () => {
      const activeElement = doc.activeElement;
      if (!isPlaylistPanelFocusTarget(activeElement)) closePlaylist();
      if (!isTranslationPanelFocusTarget(activeElement))
        closeTranslationPanel();
      if (!danmakuSendPanel.contains(activeElement)) closeDanmakuSendPanel();
      if (!isDanmakuSearchFocusTarget(activeElement)) danmakuSearch.close();
    });
    eventScope.listen(win, "blur", () => {
      danmakuSearch.close();
    });
    eventScope.listen(screen, "pointerenter", () => {
      eventScope.clearTimeout(playlistCloseTimer);
    });
    eventScope.listen(screen, "pointerleave", (e) => {
      if (
        pipSelects.some((select) =>
          globalThis.PipCompanion.customSelect.containsTarget(
            select,
            e.relatedTarget,
          ),
        )
      )
        return;
      eventScope.clearTimeout(playlistCloseTimer);
      playlistCloseTimer = eventScope.setTimeout(() => {
        const activeElement = doc.activeElement;
        if (
          activeElement?.matches(":focus-visible") &&
          (isPlaylistPanelFocusTarget(activeElement) ||
            isTranslationPanelFocusTarget(activeElement) ||
            isDanmakuSearchFocusTarget(activeElement) ||
            pipSelects.some((select) =>
              globalThis.PipCompanion.customSelect.containsTarget(
                select,
                activeElement,
              ),
            ))
        )
          return;
        closePlaylist();
        closeTranslationPanel();
        danmakuSearch.close();
        for (const select of pipSelects)
          globalThis.PipCompanion.customSelect.closeForSelect(select);
      }, 250);
    });
    eventScope.listen(
      screen,
      "pointerdown",
      (e) => {
        if (!playlistPanel.hidden && !isPlaylistTarget(e.target))
          closePlaylist();
        if (danmakuSearch.isOpen() && !isDanmakuSearchTarget(e.target))
          danmakuSearch.close();
      },
      { capture: true },
    );
    eventScope.listen(
      screen,
      "focusin",
      (e) => {
        if (!playlistPanel.hidden && !isPlaylistTarget(e.target))
          closePlaylist();
        if (danmakuSearch.isOpen() && !isDanmakuSearchTarget(e.target))
          danmakuSearch.close();
      },
      { capture: true },
    );
    eventScope.listen(progress, "pointerdown", () => {
      danmakuSearch.close();
    });

    const originalSearchOpen = danmakuSearch.open;
    danmakuSearch.open = () => {
      closePlaylist();
      closeTranslationPanel();
      closeDanmakuSendPanel();
      originalSearchOpen();
    };
    const originalSearchTogglePanel = danmakuSearch.togglePanel;
    danmakuSearch.togglePanel = () => {
      if (!danmakuSearch.isOpen()) {
        closePlaylist();
        closeTranslationPanel();
        closeDanmakuSendPanel();
      }
      originalSearchTogglePanel();
    };
    eventScope.listen(
      win,
      "keydown",
      (e) => {
        if (playlistPanel.hidden) return;
        if (e.key === "Escape") {
          closePlaylist();
          playlistButton.focus();
          return;
        }
        const inPlaylistPanel = playlistPanel.contains(e.target as Node);
        const onPlaylistButton = playlistButton.contains(e.target as Node);
        const buttonKey = ["Enter", " ", "Tab"].includes(e.key);
        if (!((inPlaylistPanel || onPlaylistButton) && buttonKey))
          closePlaylist();
      },
      { capture: true },
    );
    globalThis.PipCompanion.pipPlaylistPanel.create({
      document: doc,
      window: win,
      eventScope,
      button: playlistButton,
      panel: playlistPanel,
      getPlaylist: actions.getPlaylist,
      selectItem: actions.selectPlaylistItem,
      close: closePlaylist,
    });

    globalThis.PipCompanion.pipRangeControls.create({
      eventScope,
      volumeSlider,
      speedSlider,
      setVolume: actions.setVolume,
      getVideo: actions.getVideo,
      cancelNextPlaybackRestore: actions.cancelNextPlaybackRestore,
      update,
      showSpeedFeedback,
    });

    const commitVolumeInput = () => {
      const raw = volumeValue.value.trim();
      const parsed = parseInt(raw, 10);
      const maxVolume = actions.getMaxVolume();
      if (!Number.isNaN(parsed)) {
        const clamped = Math.max(0, Math.min(maxVolume, parsed));
        actions.setVolume(clamped, clamped > 0);
        actions.showVolumeFeedback();
      } else update();
    };
    eventScope.listen(volumeValue, "click", () => volumeValue.select());
    eventScope.listen(volumeValue, "focus", () => volumeValue.select());
    eventScope.listen(volumeValue, "keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") {
        commitVolumeInput();
        volumeValue.blur();
      } else if (e.key === "Escape") {
        update();
        volumeValue.blur();
      }
    });
    eventScope.listen(volumeValue, "blur", commitVolumeInput);

    globalThis.PipCompanion.pipTimeInput.create({
      input: timeCurrent,
      eventScope,
      parseTime: globalThis.PipCompanion.util.parseTime,
      getVideo: actions.getVideo,
      formatTime: actions.formatTime,
      seek: seekVideo,
      showInvalid: () => actions.showFeedback(t("pipTimeInvalid")),
    });

    eventScope.listen(doc.documentElement, "pointerenter", () => {
      if (!doc.hasFocus()) win.focus();
    });

    eventScope.listen(win, "keydown", (e) => {
      const matches = (key: ShortcutKey) => actions.matchesShortcut(e, key);
      if (
        matches("pipDanmakuInputShortcut") &&
        danmakuEnabled &&
        actions.canSendDanmaku &&
        danmakuSendPanel.hidden &&
        (e.target === video ||
          e.target === screen ||
          e.target === doc.body ||
          e.target === doc.documentElement)
      ) {
        e.preventDefault();
        e.stopPropagation();
        openDanmakuSendPanel();
        return;
      }
      if (
        (matches("pipDanmakuSearchShortcut") ||
          ((e.ctrlKey || e.metaKey) && e.code === "KeyF")) &&
        danmakuEnabled &&
        (e.target === video ||
          e.target === screen ||
          e.target === doc.body ||
          e.target === doc.documentElement ||
          e.target === danmakuSearchInput)
      ) {
        e.preventDefault();
        e.stopPropagation();
        danmakuSearch.togglePanel();
        return;
      }
      if (
        e.target === volumeValue ||
        e.target === timeCurrent ||
        e.target === danmakuSendInput ||
        e.target === danmakuSearchInput
      )
        return;
      const target = e.target instanceof Element ? e.target : null;
      const videoSource = actions.getVideo();
      if (videoSource && matches("pipPlayPauseShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        togglePlayback();
        return;
      }
      const frameBackward = matches("pipFrameStepBackwardShortcut");
      const frameForward = matches("pipFrameStepForwardShortcut");
      if (
        videoSource &&
        !e.repeat &&
        (frameBackward || frameForward) &&
        !target?.closest?.("input[type='range']")
      ) {
        e.preventDefault();
        e.stopPropagation();
        const backward = frameBackward;
        const next = videoSource.currentTime + (backward ? -1 : 1) / 60;
        if (Number.isFinite(next) && next >= 0) seekVideo(videoSource, next);
        actions.showFrameStepIcon(backward);
        return;
      }
      const decreaseRate = matches("pipPlaybackRateDownShortcut");
      const increaseRate = matches("pipPlaybackRateUpShortcut");
      if (videoSource && (decreaseRate || increaseRate)) {
        e.preventDefault();
        e.stopPropagation();
        adjustPlaybackRate(decreaseRate ? -1 : 1);
        return;
      }
      if (videoSource && !e.repeat && matches("pipAutoFitShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        const aspectRatio = videoSource.videoWidth / videoSource.videoHeight;
        if (
          videoSource.videoWidth <= 0 ||
          videoSource.videoHeight <= 0 ||
          !Number.isFinite(aspectRatio)
        )
          return;

        let width = win.outerWidth;
        let height = win.outerHeight;
        if (win.innerWidth / win.innerHeight < aspectRatio)
          height = Math.round(
            win.outerHeight - win.innerHeight + win.innerWidth / aspectRatio,
          );
        else
          width = Math.round(
            win.outerWidth - win.innerWidth + win.innerHeight * aspectRatio,
          );

        void actions.resize(win.innerWidth, width, height).catch(() => {});
        return;
      }
      if (videoSource && matches("pipToggleSubtitlesShortcut")) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleSubtitles();
        return;
      }
      if (actions.matchesCommentsShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleComments();
        return;
      }
      if (actions.matchesDanmakuShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.toggleDanmaku();
        return;
      }
      if (actions.matchesScreenshotShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.screenshot();
        return;
      }
      if (actions.matchesLaunchShortcut(e)) {
        e.preventDefault();
        e.stopPropagation();
        actions.closePip();
        return;
      }
      const volumeUp = matches("pipVolumeUpShortcut");
      const volumeDown = matches("pipVolumeDownShortcut");
      const mute = matches("pipMuteShortcut");
      const seekBackward = matches("pipSeekBackwardShortcut");
      const seekForward = matches("pipSeekForwardShortcut");
      const rangeFocused = Boolean(target?.closest?.("input[type='range']"));
      if (
        !videoSource ||
        (target instanceof HTMLElement && target.isContentEditable) ||
        (target?.closest?.(
          "button, input, select, textarea, [contenteditable='true']",
        ) &&
          !(
            mute ||
            (rangeFocused &&
              (volumeUp || volumeDown || seekBackward || seekForward))
          ))
      )
        return;
      if (rangeFocused && (seekBackward || seekForward)) return;

      if (seekBackward || seekForward) {
        if (!Number.isFinite(videoSource.duration) || videoSource.duration <= 0)
          return;
        const delta = seekBackward
          ? -actions.getSeekSeconds()
          : actions.getSeekSeconds();
        seekVideo(
          videoSource,
          Math.max(
            0,
            Math.min(videoSource.duration, videoSource.currentTime + delta),
          ),
        );
      } else if (volumeUp || volumeDown) {
        const delta = volumeUp ? 10 : -10;
        const next = Math.max(
          0,
          Math.min(actions.getMaxVolume(), actions.getVolumePercent() + delta),
        );
        actions.setVolume(next, delta > 0);
        actions.showVolumeFeedback();
      } else if (mute) toggleMute();
      else return;

      e.preventDefault();
      e.stopPropagation();
      update();
    });

    let seekingPointerId: number | null = null;
    const progressRatioAt = (clientX: number) => {
      const rect = progress.getBoundingClientRect();
      return globalThis.PipCompanion.pipProgressMath.ratioAt(
        clientX,
        rect.left,
        rect.width,
      );
    };
    const progressTimeAtRatio = (
      videoSource: HTMLVideoElement,
      ratio: number,
    ) =>
      globalThis.PipCompanion.pipProgressMath.timeAt(
        ratio,
        videoSource.duration,
      );
    const seekProgressToRatio = (
      videoSource: HTMLVideoElement,
      ratio: number,
    ) => {
      const targetTime = progressTimeAtRatio(videoSource, ratio);
      progress.value = String(
        globalThis.PipCompanion.pipProgressMath.valueAt(ratio, progressMax),
      );
      seekVideo(videoSource, targetTime);
      update();
    };

    eventScope.listen(progress, "input", () => {
      if (seekingPointerId !== null) return;
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      seekProgressToRatio(videoSource, Number(progress.value) / progressMax);
    });

    eventScope.listen(
      progress,
      "pointerdown",
      (e) => {
        if (progress.disabled) return;
        const ratio = progressRatioAt(e.clientX);
        const videoSource = actions.getVideo();
        if (
          ratio === null ||
          !videoSource ||
          !Number.isFinite(videoSource.duration) ||
          videoSource.duration <= 0
        )
          return;
        e.preventDefault();
        progress.focus({ preventScroll: true });
        seekingPointerId = e.pointerId;
        progress.setPointerCapture(e.pointerId);
        seekProgressToRatio(videoSource, ratio);
      },
      { capture: true },
    );
    const finishSeeking = (e: PointerEvent) => {
      if (seekingPointerId !== e.pointerId) return;
      seekingPointerId = null;
      progress.blur();
      timeTooltip.hidden = true;
      clearTimeTooltipThumb();
      screen.classList.remove("controls-visible");
    };
    eventScope.listen(progress, "pointerup", finishSeeking);
    eventScope.listen(progress, "pointercancel", finishSeeking);
    eventScope.listen(progress, "lostpointercapture", finishSeeking);

    eventScope.listen(progress, "pointermove", (e) => {
      const videoSource = actions.getVideo();
      if (
        !videoSource ||
        !Number.isFinite(videoSource.duration) ||
        videoSource.duration <= 0
      )
        return;
      const ratio = progressRatioAt(e.clientX);
      const controlsRect = controls.getBoundingClientRect();
      if (ratio === null || controlsRect.width <= 0) return;
      const targetTime = progressTimeAtRatio(videoSource, ratio);
      timeTooltipText.textContent = actions.formatTime(targetTime);
      if (seekingPointerId === e.pointerId)
        seekProgressToRatio(videoSource, ratio);

      const frame = actions.getStoryboardFrame?.(targetTime);
      if (frame && frame.url) {
        timeTooltip.classList.add("has-thumb");
        timeTooltipThumb.style.display = "block";
        const maxThumbWidth = Math.min(
          frame.width,
          180,
          Math.max(80, controlsRect.width - 24),
        );
        const scale =
          maxThumbWidth < frame.width ? maxThumbWidth / frame.width : 1;
        const width = Math.round(frame.width * scale);
        const height = Math.round(frame.height * scale);
        timeTooltipThumb.style.width = `${width}px`;
        timeTooltipThumb.style.height = `${height}px`;
        timeTooltipThumb.style.backgroundImage = `url("${frame.url}")`;
        if (frame.sheetWidth && frame.sheetHeight)
          timeTooltipThumb.style.backgroundSize = `${Math.round(frame.sheetWidth * scale)}px ${Math.round(frame.sheetHeight * scale)}px`;
        else timeTooltipThumb.style.backgroundSize = "auto";
        timeTooltipThumb.style.backgroundPosition = `-${Math.round(frame.x * scale)}px -${Math.round(frame.y * scale)}px`;
      } else {
        clearTimeTooltipThumb();
      }

      timeTooltip.hidden = false;
      const progressRect = progress.getBoundingClientRect();
      const tooltipBottom = controlsRect.bottom - progressRect.top + 4;
      timeTooltip.style.bottom = `${Math.max(0, tooltipBottom)}px`;
      const halfWidth = timeTooltip.offsetWidth / 2;
      timeTooltip.style.left = `${Math.max(halfWidth, Math.min(controlsRect.width - halfWidth, e.clientX - controlsRect.left))}px`;
    });
    eventScope.listen(progress, "pointerleave", () => {
      timeTooltip.hidden = true;
      clearTimeTooltipThumb();
    });

    eventScope.listen(
      win,
      "wheel",
      (e) => {
        if (!actions.matchesWheelShortcut(e) || e.deltaY === 0) return;
        e.preventDefault();
        e.stopPropagation();
        const currentWidth = win.outerWidth;
        const currentHeight = win.outerHeight;
        const aspectRatio = currentWidth / currentHeight;
        const scale = e.deltaY < 0 ? 1.05 : 0.95;
        let height = Math.round(currentHeight * scale);
        const width = Math.round(height * aspectRatio);
        if (Math.abs(width / height - aspectRatio) >= 1e-5)
          height = Math.round(width / aspectRatio);
        void actions.resize(win.innerWidth, width, height).catch(() => {});
      },
      { capture: true, passive: false },
    );

    let hideControlsTimer = 0;
    const scheduleHideControls = () => {
      eventScope.clearTimeout(hideControlsTimer);
      hideControlsTimer = eventScope.setTimeout(
        () => screen.classList.remove("controls-visible"),
        500,
      );
    };
    eventScope.listen(screen, "pointerleave", scheduleHideControls);
    eventScope.listen(
      win,
      "pointermove",
      (e) => {
        screen.classList.add("controls-visible");
        eventScope.clearTimeout(hideControlsTimer);
        const target = e.target;
        const ElementCtor = win.document.defaultView?.Element;
        if (
          ElementCtor &&
          target instanceof ElementCtor &&
          target.closest(".controls")
        )
          return;
        scheduleHideControls();
      },
      { passive: true },
    );

    return ui;
  }

  return { create };
})();
