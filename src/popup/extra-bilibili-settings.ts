"use strict";

globalThis.PipCompanion.extraBilibiliSettings = {
  create({ enabled, url, offset, urlError, offsetError, util, storage, t }) {
    let extraSourceSaveQueue: Promise<void> = Promise.resolve();
    let extraSourceSaveRevision = 0;
    let extraBilibiliSourceEdited = false;
    let extraBilibiliTabId: number | undefined;
    let extraSourceLoadError: string | null = null;
    let extraSourceErrorRevision = -1;

    function setExtraSourceLoadError(error: string | null): void {
      const previousError = extraSourceLoadError;
      extraSourceLoadError = error;
      if (error) {
        setExtraBilibiliInputError("url", error);
      } else if (previousError && urlError.textContent === previousError) {
        setExtraBilibiliInputError("url", null);
      }
    }

    function clearExtraSourceLoadError(): void {
      setExtraSourceLoadError(null);
    }

    function updateExtraSourceError(
      error: string | null,
      revision: number,
    ): void {
      if (revision < extraSourceErrorRevision) return;
      extraSourceErrorRevision = revision;
      setExtraSourceLoadError(error);
    }

    async function sendExtraDanmakuMessage(
      message: ExtensionMessage,
    ): Promise<unknown> {
      let tabId = extraBilibiliTabId;
      if (tabId === undefined) {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (activeTab?.id === undefined)
          throw new Error("No active browser tab");
        tabId = activeTab.id;
        extraBilibiliTabId = tabId;
      }
      try {
        await chrome.tabs.get(tabId);
      } catch {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (activeTab?.id === undefined)
          throw new Error("No active browser tab");
        tabId = activeTab.id;
        extraBilibiliTabId = tabId;
      }
      return chrome.tabs.sendMessage(tabId, message);
    }

    function setExtraBilibiliInputError(
      field: "url" | "offset",
      message: string | null,
    ): void {
      const input = field === "url" ? url : offset;
      const tooltip = field === "url" ? urlError : offsetError;
      input.classList.toggle("is-error", message !== null);
      if (message) {
        tooltip.textContent = message;
        input.setAttribute("aria-describedby", tooltip.id);
      } else {
        tooltip.textContent = "";
        input.removeAttribute("aria-describedby");
      }
    }

    function parseExtraBilibiliSource(
      value: unknown,
    ): ExtraBilibiliSourceSettings | null {
      return globalThis.PipCompanion.extraBilibiliSourceConfig.parse(value);
    }

    function extraBilibiliSourceStorageKey(tabId: number): string {
      return globalThis.PipCompanion.extraBilibiliSourceConfig.storageKey(
        tabId,
      );
    }

    function setExtraBilibiliAvailability(available: boolean): void {
      enabled.disabled = !available;
      url.disabled = !available;
      offset.disabled = !available;
    }

    function renderExtraBilibiliSource(value: unknown) {
      const source = util.isRecord(value) ? value : {};
      setExtraBilibiliAvailability(source.available !== false);
      enabled.checked = source.enabled === true;
      url.value = typeof source.url === "string" ? source.url : "";
      offset.value = String(
        typeof source.offsetSeconds === "number" &&
          Number.isFinite(source.offsetSeconds)
          ? Math.max(-3600, Math.min(3600, source.offsetSeconds))
          : 0,
      );
    }

    async function loadExtraBilibiliSource() {
      const revision = extraSourceSaveRevision;
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          lastFocusedWindow: true,
        });
        if (activeTab?.id === undefined)
          throw new Error("No active browser tab");
        const tabId = activeTab.id;
        extraBilibiliTabId = tabId;
        const storageKey = extraBilibiliSourceStorageKey(tabId);
        const legacyStorageKey = `additionalBilibiliSource:${tabId}`;
        let sourceMessageError: string | null = null;
        let storageReadError: string | null = null;
        const [liveSource, storedValues] = await Promise.all([
          chrome.tabs
            .sendMessage(tabId, {
              type: "GET_EXTRA_DANMAKU_SOURCE",
            } satisfies ExtensionMessage)
            .catch(() => {
              sourceMessageError = t("popupExtraDanmakuConnectionFailed");
              return null;
            }),
          storage.get([storageKey, legacyStorageKey]).catch(() => {
            storageReadError = t("popupExtraDanmakuStorageFailed");
            return {} as Record<string, unknown>;
          }),
        ]);
        if (revision !== extraSourceSaveRevision || extraBilibiliSourceEdited)
          return;

        const liveSettings = parseExtraBilibiliSource(liveSource);
        const storedSettings = parseExtraBilibiliSource(
          storedValues[storageKey] ?? storedValues[legacyStorageKey],
        );
        let sourceToRender: unknown = liveSource;
        const resolution =
          globalThis.PipCompanion.extraBilibiliSourceConfig.resolve(
            liveSettings,
            storedSettings,
          );
        if (resolution.restore) {
          sourceToRender = resolution.restore;
          try {
            sourceToRender = await chrome.tabs.sendMessage(tabId, {
              type: "SET_EXTRA_DANMAKU_SOURCE",
              source: resolution.restore,
            } satisfies ExtensionMessage);
            sourceMessageError = null;
          } catch {
            sourceMessageError = t("popupExtraDanmakuApplyFailed");
          }
          if (revision !== extraSourceSaveRevision || extraBilibiliSourceEdited)
            return;
        } else if (resolution.persist) {
          void storage
            .set({ [storageKey]: resolution.persist })
            .catch(() => {});
        }

        renderExtraBilibiliSource(sourceToRender);
        if (
          util.isRecord(sourceToRender) &&
          (typeof sourceToRender.error === "string" ||
            sourceToRender.error === null) &&
          typeof sourceToRender.errorRevision === "number" &&
          Number.isInteger(sourceToRender.errorRevision)
        )
          updateExtraSourceError(
            sourceToRender.error,
            sourceToRender.errorRevision,
          );
        else setExtraSourceLoadError(storageReadError ?? sourceMessageError);
      } catch {
        if (
          revision === extraSourceSaveRevision &&
          !extraBilibiliSourceEdited
        ) {
          renderExtraBilibiliSource(null);
          setExtraSourceLoadError(t("popupExtraDanmakuLoadFailed"));
        }
      }
    }

    function queueExtraBilibiliSourceUpdate(source: {
      enabled: boolean;
      url: string;
      offsetSeconds: number;
    }): Promise<unknown> {
      const request = extraSourceSaveQueue.then(async () => {
        const saved = await sendExtraDanmakuMessage({
          type: "SET_EXTRA_DANMAKU_SOURCE",
          source,
        });
        const tabId = extraBilibiliTabId;
        const settings = parseExtraBilibiliSource(saved) ?? source;
        if (tabId !== undefined)
          await storage.set({
            [extraBilibiliSourceStorageKey(tabId)]: settings,
          });
        return saved;
      });
      extraSourceSaveQueue = request.then(
        () => {},
        () => {},
      );
      return request;
    }

    async function disableExtraSourceForInvalidSettings(
      revision: number,
      url: string,
      offsetSeconds: number,
      errorField: "url" | "offset",
    ): Promise<void> {
      enabled.checked = false;
      const validationError =
        errorField === "url"
          ? t("popupExtraDanmakuInvalidUrl")
          : t("popupExtraDanmakuInvalidOffset");
      try {
        await queueExtraBilibiliSourceUpdate({
          enabled: false,
          url: errorField === "url" ? "" : url,
          offsetSeconds,
        });
        if (revision === extraSourceSaveRevision)
          setExtraBilibiliInputError(errorField, validationError);
      } catch {
        if (revision === extraSourceSaveRevision)
          setExtraBilibiliInputError(
            errorField,
            `${validationError} ${t("popupExtraDanmakuDisableFailed")}`,
          );
      }
    }

    function parseExtraBilibiliForm(): ExtraBilibiliFormResult {
      return globalThis.PipCompanion.extraBilibiliForm.parse(
        url.value,
        offset.value,
        enabled.checked,
        util.isValidExtraDanmakuSourceUrl,
      );
    }

    async function saveExtraBilibiliSource(): Promise<void> {
      const revision = ++extraSourceSaveRevision;
      setExtraBilibiliInputError("url", null);
      setExtraBilibiliInputError("offset", null);
      const form = parseExtraBilibiliForm();
      if (!form.ok) {
        await disableExtraSourceForInvalidSettings(
          revision,
          form.url,
          form.offsetSeconds,
          form.errorField,
        );
        return;
      }

      try {
        const saved = await queueExtraBilibiliSourceUpdate(form.source);
        if (revision !== extraSourceSaveRevision) return;
        renderExtraBilibiliSource(saved);
      } catch {
        if (revision === extraSourceSaveRevision)
          setExtraBilibiliInputError("url", t("popupExtraDanmakuSaveFailed"));
      }
    }

    url.addEventListener("input", () => {
      extraBilibiliSourceEdited = true;
      clearExtraSourceLoadError();
    });
    offset.addEventListener("input", () => {
      extraBilibiliSourceEdited = true;
    });
    void loadExtraBilibiliSource();
    url.addEventListener("change", () => {
      void saveExtraBilibiliSource();
    });
    offset.addEventListener("change", () => {
      void saveExtraBilibiliSource();
    });
    enabled.addEventListener("change", () => {
      void saveExtraBilibiliSource();
    });
    globalThis.PipCompanion.runtimeMessages.addListener(
      ["EXTRA_DANMAKU_SOURCE_STATUS", "EXTRA_DANMAKU_SOURCE_CHANGED"],
      (message, sender) => {
        if (
          !util.isExtensionMessage(message) ||
          sender.tab?.id !== extraBilibiliTabId
        )
          return;
        if (message.type === "EXTRA_DANMAKU_SOURCE_STATUS") {
          updateExtraSourceError(message.error, message.revision);
          return;
        }
        if (message.type === "EXTRA_DANMAKU_SOURCE_CHANGED") {
          enabled.checked = message.source.enabled;
          setExtraBilibiliAvailability(message.available);
        }
      },
    );
  },
} satisfies ExtraBilibiliSettingsApi;
