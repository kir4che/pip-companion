"use strict";

globalThis.PipCompanion.subtitleTranslationOptions = {
  create({ storage, settings, configApi, t, showStatus }) {
    const providerSelect = document.querySelector(
      "#subtitle-translation-provider",
    ) as HTMLSelectElement;
    const microsoftConfig = document.querySelector(
      "#microsoft-translation-config",
    ) as HTMLElement;
    const googleConfig = document.querySelector(
      "#google-translation-config",
    ) as HTMLElement;
    const deeplConfig = document.querySelector(
      "#deepl-translation-config",
    ) as HTMLElement;
    const microsoftKey = document.querySelector(
      "#microsoft-translation-key",
    ) as HTMLInputElement;
    const microsoftRegion = document.querySelector(
      "#microsoft-translation-region",
    ) as HTMLInputElement;
    const googleKey = document.querySelector(
      "#google-translation-key",
    ) as HTMLInputElement;
    const deeplKey = document.querySelector(
      "#deepl-translation-key",
    ) as HTMLInputElement;
    const microsoftKeyDisplay = document.querySelector(
      "#microsoft-translation-key-display",
    ) as HTMLOutputElement;
    const googleKeyDisplay = document.querySelector(
      "#google-translation-key-display",
    ) as HTMLOutputElement;
    const deeplKeyDisplay = document.querySelector(
      "#deepl-translation-key-display",
    ) as HTMLOutputElement;
    const microsoftKeyLabel = document.querySelector(
      "#microsoft-translation-key-label",
    ) as HTMLLabelElement;
    const googleKeyLabel = document.querySelector(
      "#google-translation-key-label",
    ) as HTMLLabelElement;
    const deeplKeyLabel = document.querySelector(
      "#deepl-translation-key-label",
    ) as HTMLLabelElement;
    const testButton = document.querySelector(
      "#subtitle-translation-test",
    ) as HTMLButtonElement;
    const saveButton = document.querySelector(
      "#subtitle-translation-save",
    ) as HTMLButtonElement;
    const removeButton = document.querySelector(
      "#subtitle-translation-remove",
    ) as HTMLButtonElement;
    let testInProgress = false;
    let config: SubtitleTranslationConfig = {
      provider: "microsoft",
      microsoftKey: "",
      microsoftRegion: "",
      googleKey: "",
      deeplKey: "",
    };

    function requestProviderAccess(
      provider: SubtitleTranslationProvider,
      key: string,
    ): Promise<boolean> {
      return chrome.permissions.request({
        origins: configApi.getProviderOrigins(provider, key),
      });
    }

    function renderActions() {
      const provider = config.provider;
      const keyInput =
        provider === "google"
          ? googleKey
          : provider === "deepl"
            ? deeplKey
            : microsoftKey;
      const storedKey = configApi.getProviderApiKey(config, provider).trim();
      const hasStoredKey = storedKey !== "";
      const keyDirty = !hasStoredKey && keyInput.value.trim() !== "";
      const region = microsoftRegion.value.trim();
      const hasRequiredCredentials =
        Boolean(keyDirty || hasStoredKey) &&
        (provider !== "microsoft" ||
          /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(region));
      const regionDirty =
        provider === "microsoft" && region !== config.microsoftRegion;
      saveButton.hidden = !(keyDirty || regionDirty);
      removeButton.hidden = !hasStoredKey;
      testButton.disabled = testInProgress || !hasRequiredCredentials;
    }

    function render() {
      providerSelect.value = config.provider;
      for (const [input, display, label, key] of [
        [
          microsoftKey,
          microsoftKeyDisplay,
          microsoftKeyLabel,
          config.microsoftKey,
        ],
        [googleKey, googleKeyDisplay, googleKeyLabel, config.googleKey],
        [deeplKey, deeplKeyDisplay, deeplKeyLabel, config.deeplKey],
      ] as const) {
        const hasStoredKey = key.trim() !== "";
        input.hidden = hasStoredKey;
        display.hidden = !hasStoredKey;
        label.htmlFor = hasStoredKey ? "" : input.id;
        display.textContent = hasStoredKey ? configApi.maskApiKey(key) : "";
      }
      microsoftConfig.hidden = config.provider !== "microsoft";
      googleConfig.hidden = config.provider !== "google";
      deeplConfig.hidden = config.provider !== "deepl";
      renderActions();
    }

    async function saveConfig(
      nextConfig: SubtitleTranslationConfig,
      clearKeyInputs = true,
      silent = false,
    ): Promise<boolean> {
      try {
        await storage.set({ [settings.CONFIG_KEY]: nextConfig });
        config = nextConfig;
        if (clearKeyInputs) {
          microsoftKey.value = "";
          googleKey.value = "";
          deeplKey.value = "";
        }
        render();
        if (!silent) showStatus(t("subtitleTranslationSettingsSaved"));
        return true;
      } catch {
        showStatus(t("subtitleTranslationSettingsSaveFailed"), true);
        return false;
      }
    }

    providerSelect.addEventListener("change", () => {
      config = {
        ...config,
        provider:
          providerSelect.value === "google" || providerSelect.value === "deepl"
            ? providerSelect.value
            : "microsoft",
      };
      render();
      void saveConfig(config, false, true);
    });

    function getConfigWithInputKey(): SubtitleTranslationConfig {
      const nextConfig = { ...config };
      const keyField = `${nextConfig.provider}Key` as const;
      const input = {
        microsoft: microsoftKey,
        google: googleKey,
        deepl: deeplKey,
      }[nextConfig.provider];
      const key = input.value.trim();
      if (!nextConfig[keyField].trim() && key) nextConfig[keyField] = key;
      return nextConfig;
    }

    saveButton.addEventListener("click", () => {
      const nextConfig = getConfigWithInputKey();
      if (nextConfig.provider === "microsoft")
        nextConfig.microsoftRegion = microsoftRegion.value.trim();
      if (
        nextConfig.provider === config.provider &&
        nextConfig.microsoftKey === config.microsoftKey &&
        nextConfig.microsoftRegion === config.microsoftRegion &&
        nextConfig.googleKey === config.googleKey &&
        nextConfig.deeplKey === config.deeplKey
      ) {
        showStatus(t("subtitleTranslationNoChange"));
        return;
      }
      void (async () => {
        const key = configApi
          .getProviderApiKey(nextConfig, nextConfig.provider)
          .trim();
        const region = nextConfig.microsoftRegion;
        const hasRequiredCredentials =
          Boolean(key) &&
          (nextConfig.provider !== "microsoft" ||
            /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(region));
        const accessGranted = hasRequiredCredentials
          ? await requestProviderAccess(nextConfig.provider, key).catch(
              () => false,
            )
          : true;
        const saved = await saveConfig(nextConfig);
        if (saved && !accessGranted)
          showStatus(t("subtitleTranslationAccessDenied"), true);
      })();
    });

    testButton.addEventListener("click", () => {
      const nextConfig = getConfigWithInputKey();
      if (nextConfig.provider === "microsoft") {
        const region = microsoftRegion.value.trim();
        if (region) nextConfig.microsoftRegion = region;
      }
      testInProgress = true;
      renderActions();
      void (async () => {
        try {
          const key = configApi
            .getProviderApiKey(nextConfig, nextConfig.provider)
            .trim();
          const accessGranted = await requestProviderAccess(
            nextConfig.provider,
            key,
          ).catch(() => false);
          if (!accessGranted) {
            showStatus(t("subtitleTranslationAccessDenied"), true);
            return;
          }
          showStatus(t("subtitleTranslationTesting"));
          const result = await chrome.runtime.sendMessage({
            type: "TEST_SUBTITLE_TRANSLATION",
            provider: nextConfig.provider,
            config: nextConfig,
          } satisfies ExtensionMessage);
          showStatus(
            t(
              result?.ok
                ? "subtitleTranslationTestSuccess"
                : "subtitleTranslationTestFailed",
            ),
            !result?.ok,
          );
        } catch {
          showStatus(t("subtitleTranslationTestFailed"), true);
        } finally {
          testInProgress = false;
          renderActions();
        }
      })();
    });

    removeButton.addEventListener("click", () => {
      const provider = config.provider;
      const key = configApi.getProviderApiKey(config, provider).trim();
      const origins = configApi.getProviderOrigins(provider, key);
      const nextConfig = { ...config };
      if (provider === "microsoft") nextConfig.microsoftKey = "";
      else if (provider === "google") nextConfig.googleKey = "";
      else nextConfig.deeplKey = "";
      void (async () => {
        if (!(await saveConfig(nextConfig, true, true))) return;
        try {
          if (key) await chrome.permissions.remove({ origins });
        } catch {
          // 撤銷權限失敗不影響金鑰移除
        }
        showStatus(t("subtitleTranslationSettingsSaved"));
      })();
    });

    for (const input of [microsoftKey, googleKey, deeplKey, microsoftRegion])
      input.addEventListener("input", renderActions);

    function update(value: unknown): void {
      config = configApi.normalize(value);
      microsoftRegion.value = config.microsoftRegion;
      render();
    }

    async function load(): Promise<void> {
      try {
        const stored = await storage.get(settings.CONFIG_KEY);
        update(stored[settings.CONFIG_KEY]);
      } catch {
        update(null);
      }
    }

    return { render, update, load };
  },
} satisfies SubtitleTranslationOptionsApi;
