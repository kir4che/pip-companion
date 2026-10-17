"use strict";

globalThis.PipCompanion.extraBilibiliSettings = {
  create({
    enabled,
    url,
    offset,
    offsetError,
    urlHint,
    status,
    switchConfirm,
    switchConfirmYes,
    switchConfirmNo,
    util,
    storage,
    t,
  }) {
    let extraSourceSaveQueue: Promise<void> = Promise.resolve();
    let extraSourceSaveRevision = 0;
    let extraBilibiliSourceEdited = false;
    let extraBilibiliTabId: number | undefined;
    let extraSourceLoadError: string | null = null;
    // 本地表單驗證錯誤獨立保存，避免被來源端回報的執行期狀態覆蓋。
    let extraSourceValidationError: string | null = null;
    // 最後一次從來源端實際套用的設定，用來判斷是否真的有來源需要停用。
    let extraSourceApplied: ExtraBilibiliSourceSettings | null = null;
    let extraSourceLoading = false;
    let extraSourceErrorRevision = -1;
    // 已連線時切換到不同來源網址，先等待使用者確認才替換來源。
    let pendingSwitch: ExtraBilibiliSourceSettings | null = null;

    function showSwitchConfirm(source: ExtraBilibiliSourceSettings): void {
      pendingSwitch = source;
      switchConfirm.hidden = false;
    }

    function clearSwitchConfirm(): void {
      pendingSwitch = null;
      switchConfirm.hidden = true;
    }

    function isYouTubeSourceUrl(value: string): boolean {
      try {
        const source = new URL(value.trim());
        if (!/(^|\.)youtube\.com$/i.test(source.hostname)) return false;
        return source.pathname === "/watch"
          ? /^[\w-]{11}$/.test(source.searchParams.get("v") || "")
          : /^\/live\/[\w-]{11}\/?$/.test(source.pathname);
      } catch {
        return false;
      }
    }

    function renderExtraSourceHint(): void {
      urlHint.hidden = !isYouTubeSourceUrl(url.value);
    }

    function renderExtraSourceStatus(): void {
      const error = extraSourceValidationError ?? extraSourceLoadError;
      url.classList.toggle("is-error", error !== null);
      if (error) url.setAttribute("aria-describedby", status.id);
      else url.removeAttribute("aria-describedby");
      if (extraSourceLoading) {
        status.textContent = t("popupExtraDanmakuConnecting");
        status.dataset.state = "loading";
      } else if (error) {
        status.textContent = error;
        status.dataset.state = "error";
      } else if (extraSourceApplied?.enabled === true) {
        status.textContent = t("popupExtraDanmakuConnected");
        status.dataset.state = "connected";
      } else {
        status.textContent = "";
        status.dataset.state = "";
      }
    }

    function setExtraSourceLoading(loading: boolean): void {
      if (extraSourceLoading === loading) return;
      extraSourceLoading = loading;
      renderExtraSourceStatus();
    }

    // URL 錯誤只在下方狀態列顯示，避免與輸入框 hover 提示重複。
    function setExtraSourceLoadError(error: string | null): void {
      extraSourceLoadError = error;
      renderExtraSourceStatus();
    }

    function setExtraSourceValidationError(error: string | null): void {
      extraSourceValidationError = error;
      renderExtraSourceStatus();
    }

    function clearExtraSourceErrors(): void {
      extraSourceValidationError = null;
      extraSourceLoadError = null;
      renderExtraSourceStatus();
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

    function setOffsetInputError(message: string | null): void {
      offset.classList.toggle("is-error", message !== null);
      if (message) {
        offsetError.textContent = message;
        offset.setAttribute("aria-describedby", offsetError.id);
      } else {
        offsetError.textContent = "";
        offset.removeAttribute("aria-describedby");
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
      extraSourceApplied = parseExtraBilibiliSource(value);
      setExtraBilibiliAvailability(source.available !== false);
      enabled.checked = source.enabled === true;
      url.value = typeof source.url === "string" ? source.url : "";
      offset.value = String(
        typeof source.offsetSeconds === "number" &&
          Number.isFinite(source.offsetSeconds)
          ? Math.max(-3600, Math.min(3600, source.offsetSeconds))
          : 0,
      );
      setExtraSourceLoading(source.loading === true);
      renderExtraSourceHint();
      renderExtraSourceStatus();
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
        const hasConfiguredSource =
          globalThis.PipCompanion.extraBilibiliSourceConfig.hasSettings(
            liveSettings,
          ) ||
          globalThis.PipCompanion.extraBilibiliSourceConfig.hasSettings(
            storedSettings,
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
        else
          setExtraSourceLoadError(
            storageReadError ??
              (hasConfiguredSource ? sourceMessageError : null),
          );
        if (util.isRecord(sourceToRender))
          setExtraSourceLoading(sourceToRender.loading === true);
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

    function parseExtraBilibiliForm(): ExtraBilibiliFormResult {
      return globalThis.PipCompanion.extraBilibiliForm.parse(
        url.value,
        offset.value,
        enabled.checked,
        util.isValidExtraDanmakuSourceUrl,
      );
    }

    async function applyExtraSource(
      source: ExtraBilibiliSourceSettings,
    ): Promise<void> {
      const revision = ++extraSourceSaveRevision;
      clearSwitchConfirm();
      try {
        const saved = await queueExtraBilibiliSourceUpdate(source);
        if (revision !== extraSourceSaveRevision) return;
        renderExtraBilibiliSource(saved);
      } catch {
        if (revision !== extraSourceSaveRevision) return;
        // 儲存失敗代表沒有套用，將開關還原成來源端實際狀態。
        enabled.checked = extraSourceApplied?.enabled === true;
        setExtraSourceLoadError(t("popupExtraDanmakuSaveFailed"));
      }
    }

    async function saveExtraBilibiliSource(): Promise<void> {
      const wantsEnabled = enabled.checked;
      clearExtraSourceErrors();
      setOffsetInputError(null);
      const form = parseExtraBilibiliForm();

      if (!form.ok && wantsEnabled) {
        // 使用者想啟用但設定無效：保留正在運作的來源，只顯示錯誤並還原開關。
        clearSwitchConfirm();
        enabled.checked = extraSourceApplied?.enabled === true;
        if (form.errorField === "url")
          setExtraSourceValidationError(t("popupExtraDanmakuInvalidUrl"));
        else setOffsetInputError(t("popupExtraDanmakuInvalidOffset"));
        return;
      }

      // 設定無效且使用者想停用時，仍照常停用（URL 需清空才能通過訊息驗證）。
      const nextSource = form.ok
        ? form.source
        : { enabled: false, url: "", offsetSeconds: form.offsetSeconds };
      if (
        nextSource.enabled &&
        extraSourceApplied?.enabled === true &&
        nextSource.url !== extraSourceApplied.url
      ) {
        showSwitchConfirm(nextSource);
        return;
      }
      await applyExtraSource(nextSource);
    }

    url.addEventListener("input", () => {
      extraBilibiliSourceEdited = true;
      clearSwitchConfirm();
      clearExtraSourceErrors();
      renderExtraSourceHint();
    });
    offset.addEventListener("input", () => {
      extraBilibiliSourceEdited = true;
      clearSwitchConfirm();
    });
    switchConfirmYes.addEventListener("click", () => {
      if (pendingSwitch) void applyExtraSource(pendingSwitch);
    });
    switchConfirmNo.addEventListener("click", () => {
      clearSwitchConfirm();
      enabled.checked = extraSourceApplied?.enabled === true;
      url.value = extraSourceApplied?.url ?? "";
      offset.value = String(extraSourceApplied?.offsetSeconds ?? 0);
      renderExtraSourceHint();
      renderExtraSourceStatus();
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
          setExtraSourceLoading(message.loading === true);
          return;
        }
        if (message.type === "EXTRA_DANMAKU_SOURCE_CHANGED") {
          extraSourceApplied = parseExtraBilibiliSource(message.source);
          enabled.checked = message.source.enabled;
          setExtraBilibiliAvailability(message.available);
          renderExtraSourceHint();
          renderExtraSourceStatus();
        }
      },
    );
  },
} satisfies ExtraBilibiliSettingsApi;
