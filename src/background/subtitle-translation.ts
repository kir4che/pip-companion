import { isRecord } from "../shared/type-guards.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";

const PREFERENCES_KEY = "subtitleTranslationPreferences";
const CONFIG_KEY = "subtitleTranslationConfig";
const MAX_TEXTS = 20;
const MAX_TEXT_LENGTH = 1000;
const MAX_TOTAL_LENGTH = 10000;
const REQUEST_TIMEOUT_MS = 15000;
const pipSubtitlesEnabledStorageKey = (tabId: number) =>
  `pipSubtitlesEnabled:${tabId}`;
const TRANSLATION_PROVIDERS: SubtitleTranslationProvider[] = [
  "microsoft",
  "google",
  "deepl",
];
let cachedLanguages: {
  provider: SubtitleTranslationProvider;
  expiresAt: number;
  languages: SubtitleTranslationLanguageOption[];
} | null = null;
const pipSubtitleStates = new Map<number, boolean>();

function isTranslationLanguage(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 35 &&
    /^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(value)
  );
}

function isTranslationRequest(
  value: unknown,
): value is Extract<ExtensionMessage, { type: "TRANSLATE_SUBTITLE_CUES" }> {
  return (
    isRecord(value) &&
    value.type === "TRANSLATE_SUBTITLE_CUES" &&
    isTranslationLanguage(value.targetLanguage) &&
    Array.isArray(value.texts) &&
    value.texts.length > 0 &&
    value.texts.length <= MAX_TEXTS &&
    value.texts.every(
      (text) =>
        typeof text === "string" &&
        text.length > 0 &&
        text.length <= MAX_TEXT_LENGTH &&
        !text.includes("\u0000"),
    ) &&
    value.texts.reduce(
      (total, text) => total + (typeof text === "string" ? text.length : 0),
      0,
    ) <= MAX_TOTAL_LENGTH
  );
}

function isTranslationProvider(
  value: unknown,
): value is SubtitleTranslationProvider {
  return value === "microsoft" || value === "google" || value === "deepl";
}

function readConfig(value: unknown): SubtitleTranslationConfig | null {
  if (!isRecord(value)) return null;
  const provider = value.provider;
  if (!isTranslationProvider(provider)) return null;
  const microsoftKey = value.microsoftKey;
  const microsoftRegion = value.microsoftRegion;
  const googleKey = value.googleKey;
  const deeplKey = value.deeplKey ?? "";
  if (
    typeof microsoftKey !== "string" ||
    microsoftKey.length > 4096 ||
    typeof microsoftRegion !== "string" ||
    microsoftRegion.length > 100 ||
    typeof googleKey !== "string" ||
    googleKey.length > 4096 ||
    typeof deeplKey !== "string" ||
    deeplKey.length > 4096
  )
    return null;
  return { provider, microsoftKey, microsoftRegion, googleKey, deeplKey };
}

function isTranslationConfigured(
  config: SubtitleTranslationConfig,
  provider = config.provider,
) {
  if (provider === "google") return Boolean(config.googleKey.trim());
  if (provider === "deepl") return Boolean(config.deeplKey.trim());
  return (
    Boolean(config.microsoftKey.trim()) &&
    /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(config.microsoftRegion)
  );
}

function canonicalLanguage(language: string) {
  if (/^zh-(?:tw|hant|hk|mo)$/i.test(language)) return "zh-Hant";
  if (/^zh-(?:cn|hans|sg)$/i.test(language)) return "zh-Hans";
  try {
    return Intl.getCanonicalLocales(language)[0] ?? language.toLowerCase();
  } catch {
    return language.toLowerCase();
  }
}

function deeplApiBaseUrl(key: string) {
  return key.trim().toLowerCase().endsWith(":fx")
    ? "https://api-free.deepl.com"
    : "https://api.deepl.com";
}

function parseMicrosoftLanguages(
  value: unknown,
): SubtitleTranslationLanguageOption[] {
  if (!isRecord(value) || !isRecord(value.translation))
    throw new Error("Invalid language response");
  return Object.entries(value.translation).flatMap(([code, detail]) => {
    if (
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(code) ||
      !isRecord(detail) ||
      typeof detail.name !== "string"
    )
      return [];
    return [
      { code: canonicalLanguage(code), label: detail.name.slice(0, 100) },
    ];
  });
}

function parseGoogleLanguages(
  value: unknown,
): SubtitleTranslationLanguageOption[] {
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !Array.isArray(value.data.languages)
  )
    throw new Error("Invalid language response");
  return value.data.languages.flatMap((entry) => {
    if (
      !isRecord(entry) ||
      typeof entry.language !== "string" ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(entry.language) ||
      typeof entry.name !== "string"
    )
      return [];
    return [
      {
        code: canonicalLanguage(entry.language),
        label: entry.name.slice(0, 100),
      },
    ];
  });
}

function parseDeepLLanguages(
  value: unknown,
): SubtitleTranslationLanguageOption[] {
  if (!Array.isArray(value)) throw new Error("Invalid language response");
  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== "string") return [];
    const language =
      typeof entry.language === "string" ? entry.language : entry.lang;
    if (
      typeof language !== "string" ||
      !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/i.test(language)
    )
      return [];
    return [
      {
        code: canonicalLanguage(language),
        label: entry.name.slice(0, 100),
      },
    ];
  });
}

async function getTranslationLanguages(
  config: SubtitleTranslationConfig,
  provider = config.provider,
  signal?: AbortSignal,
): Promise<SubtitleTranslationLanguageOption[]> {
  if (
    cachedLanguages?.provider === provider &&
    cachedLanguages.expiresAt > Date.now()
  )
    return cachedLanguages.languages;
  let languages: SubtitleTranslationLanguageOption[];
  if (provider === "microsoft") {
    const url = new URL(
      "https://api.cognitive.microsofttranslator.com/languages",
    );
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("scope", "translation");
    languages = await fetchWithTimeout(
      url,
      {},
      async (response) => {
        if (!response.ok) throw new Error("Language list request failed");
        return parseMicrosoftLanguages(await response.json());
      },
      signal,
    );
  } else if (provider === "google") {
    if (!config.googleKey.trim())
      throw new Error("Translation provider is not configured");
    const url = new URL(
      "https://translation.googleapis.com/language/translate/v2/languages",
    );
    url.searchParams.set("target", "en");
    url.searchParams.set("key", config.googleKey);
    languages = await fetchWithTimeout(
      url,
      {},
      async (response) => {
        if (!response.ok) throw new Error("Language list request failed");
        return parseGoogleLanguages(await response.json());
      },
      signal,
    );
  } else {
    if (!config.deeplKey.trim())
      throw new Error("Translation provider is not configured");
    const url = new URL(`${deeplApiBaseUrl(config.deeplKey)}/v3/languages`);
    url.searchParams.set("resource", "translate_text");
    languages = await fetchWithTimeout(
      url,
      {
        headers: { Authorization: `DeepL-Auth-Key ${config.deeplKey.trim()}` },
      },
      async (response) => {
        if (!response.ok) throw new Error("Language list request failed");
        return parseDeepLLanguages(await response.json());
      },
      signal,
    );
  }
  cachedLanguages = {
    provider,
    expiresAt: Date.now() + 60 * 60 * 1000,
    languages,
  };
  return languages;
}

function microsoftLanguage(language: string) {
  if (language === "zh-Hant") return "zh-Hant";
  if (language === "zh-Hans") return "zh-Hans";
  return language;
}

function googleLanguage(language: string) {
  if (language === "zh-Hant") return "zh-TW";
  if (language === "zh-Hans") return "zh-CN";
  return language;
}

function deeplLanguage(language: string) {
  return language.toUpperCase();
}

async function parseMicrosoftResponse(
  response: Response,
  expectedCount: number,
): Promise<string[]> {
  if (!response.ok) throw new Error("Translation request failed");
  const value: unknown = await response.json();
  if (!Array.isArray(value) || value.length !== expectedCount)
    throw new Error("Invalid translation response");
  return value.map((entry) => {
    if (
      !isRecord(entry) ||
      !Array.isArray(entry.translations) ||
      !isRecord(entry.translations[0]) ||
      typeof entry.translations[0].text !== "string"
    )
      throw new Error("Invalid translation response");
    return entry.translations[0].text.slice(0, 4000);
  });
}

function decodeGoogleText(value: string): string {
  return value.replace(
    /&(amp|lt|gt|quot|#39|#x27|#x([0-9a-f]+)|#([0-9]+));/gi,
    (
      entity,
      name: string,
      hex: string | undefined,
      decimal: string | undefined,
    ) => {
      switch (name.toLowerCase()) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "#39":
        case "#x27":
          return "'";
        default: {
          const codePoint = Number.parseInt(
            hex ?? decimal ?? "",
            hex ? 16 : 10,
          );
          return Number.isInteger(codePoint) &&
            codePoint >= 0 &&
            codePoint <= 0x10ffff
            ? String.fromCodePoint(codePoint)
            : entity;
        }
      }
    },
  );
}

async function parseDeepLResponse(
  response: Response,
  expectedCount: number,
): Promise<string[]> {
  if (!response.ok) throw new Error("Translation request failed");
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    !Array.isArray(value.translations) ||
    value.translations.length !== expectedCount
  )
    throw new Error("Invalid translation response");
  return value.translations.map((entry) => {
    if (!isRecord(entry) || typeof entry.text !== "string")
      throw new Error("Invalid translation response");
    return entry.text.slice(0, 4000);
  });
}

async function parseGoogleResponse(
  response: Response,
  expectedCount: number,
): Promise<string[]> {
  if (!response.ok) throw new Error("Translation request failed");
  const value: unknown = await response.json();
  if (
    !isRecord(value) ||
    !isRecord(value.data) ||
    !Array.isArray(value.data.translations) ||
    value.data.translations.length !== expectedCount
  )
    throw new Error("Invalid translation response");
  return value.data.translations.map((entry) => {
    if (!isRecord(entry) || typeof entry.translatedText !== "string")
      throw new Error("Invalid translation response");
    return decodeGoogleText(entry.translatedText).slice(0, 4000);
  });
}

async function translateTexts(
  config: SubtitleTranslationConfig,
  targetLanguage: string,
  texts: string[],
  provider = config.provider,
  signal?: AbortSignal,
): Promise<string[]> {
  if (provider === "microsoft") {
    if (
      !config.microsoftKey.trim() ||
      !/^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/i.test(config.microsoftRegion)
    )
      throw new Error("Translation provider is not configured");
    const url = new URL(
      "https://api.cognitive.microsofttranslator.com/translate",
    );
    url.searchParams.set("api-version", "3.0");
    url.searchParams.set("to", microsoftLanguage(targetLanguage));
    return fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=UTF-8",
          "Ocp-Apim-Subscription-Key": config.microsoftKey,
          "Ocp-Apim-Subscription-Region": config.microsoftRegion,
        },
        body: JSON.stringify(texts.map((text) => ({ Text: text }))),
      },
      (response) => parseMicrosoftResponse(response, texts.length),
      signal,
    );
  }

  if (provider === "google") {
    if (!config.googleKey.trim())
      throw new Error("Translation provider is not configured");
    const url = new URL(
      "https://translation.googleapis.com/language/translate/v2",
    );
    url.searchParams.set("key", config.googleKey);
    return fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          q: texts,
          target: googleLanguage(targetLanguage),
          format: "text",
        }),
      },
      (response) => parseGoogleResponse(response, texts.length),
      signal,
    );
  }

  if (!config.deeplKey.trim())
    throw new Error("Translation provider is not configured");
  const deeplKey = config.deeplKey.trim();
  const url = new URL(`${deeplApiBaseUrl(deeplKey)}/v2/translate`);
  return fetchWithTimeout(
    url,
    {
      method: "POST",
      headers: {
        Authorization: `DeepL-Auth-Key ${deeplKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: texts,
        target_lang: deeplLanguage(targetLanguage),
      }),
    },
    (response) => parseDeepLResponse(response, texts.length),
    signal,
  );
}

async function fetchWithTimeout<T>(
  url: URL,
  init: RequestInit,
  parse: (response: Response) => Promise<T>,
  externalSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const abort = () => controller.abort();
  externalSignal?.addEventListener("abort", abort, { once: true });
  if (externalSignal?.aborted) controller.abort();
  try {
    controller.signal.throwIfAborted();
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      const code =
        response.status === 429
          ? "rate-limited"
          : response.status === 456
            ? "quota-exceeded"
            : response.status === 401 || response.status === 403
              ? "not-configured"
              : "request-failed";
      throw new Error(code);
    }
    return await parse(response);
  } finally {
    clearTimeout(timeout);
    externalSignal?.removeEventListener("abort", abort);
  }
}

// 限制翻譯請求的頻率，避免同時發送多個請求導致服務拒絕。
let translationInFlight = false;
let nextTranslationAt = 0;
let translationFailure = "";
let translationGeneration = 0;
const translationCache = new Map<string, string[]>();
const pendingTranslationRequests = new Map<string, Promise<string[]>>();
const activeTranslationControllers = new Map<number, Set<AbortController>>();

function providerConfigSignature(
  value: unknown,
  provider: SubtitleTranslationProvider,
): string {
  const config = readConfig(value);
  if (!config) return "";
  return JSON.stringify([
    config[`${provider}Key`],
    provider === "microsoft" ? config.microsoftRegion : "",
  ]);
}

function activeConfigSignature(value: unknown): string {
  const config = readConfig(value);
  return config
    ? config.provider + providerConfigSignature(value, config.provider)
    : "";
}

function invalidateTranslations() {
  translationGeneration++;
  for (const tabId of activeTranslationControllers.keys())
    abortTabTranslations(tabId);
}

async function translate(
  config: SubtitleTranslationConfig,
  targetLanguage: string,
  texts: string[],
  provider = config.provider,
  signal?: AbortSignal,
  test = false,
): Promise<string[]> {
  signal?.throwIfAborted();
  const cacheKey =
    provider + "\u0000" + JSON.stringify([targetLanguage, texts]);
  const pendingKey = String(translationGeneration) + cacheKey;
  if (!test) {
    const cached = translationCache.get(cacheKey);
    if (cached) {
      translationCache.delete(cacheKey);
      translationCache.set(cacheKey, cached);
      return cached;
    }
    const pending = pendingTranslationRequests.get(pendingKey);
    if (pending) return pending;
    if (translationFailure) throw new Error(translationFailure);
  }
  if (translationInFlight || Date.now() < nextTranslationAt)
    throw new Error("busy");
  translationInFlight = true;
  nextTranslationAt = Date.now() + 300;
  const result = (async () => {
    try {
      const translations = await translateTexts(
        config,
        targetLanguage,
        texts,
        provider,
        signal,
      );
      signal?.throwIfAborted();
      if (!test) {
        translationCache.set(cacheKey, translations);
        while (translationCache.size > 50)
          translationCache.delete(translationCache.keys().next().value!);
      }
      return translations;
    } catch (error) {
      // timeout 可能是網路不穩定或翻譯服務拒絕，其他錯誤可能是設定錯誤或 API 金鑰失效。
      if (!test && !signal?.aborted)
        translationFailure =
          error instanceof Error ? error.message : "request-failed";
      throw error;
    } finally {
      translationInFlight = false;
      if (!test) pendingTranslationRequests.delete(pendingKey);
    }
  })();
  if (!test) pendingTranslationRequests.set(pendingKey, result);
  return result;
}

function abortTabTranslations(tabId: number) {
  for (const controller of activeTranslationControllers.get(tabId) ?? [])
    controller.abort();
  activeTranslationControllers.delete(tabId);
}

export function registerSubtitleTranslationListener() {
  chrome.tabs.onRemoved.addListener((tabId) => {
    if (pipSubtitleStates.has(tabId) || activeTranslationControllers.has(tabId))
      translationGeneration++;
    pipSubtitleStates.delete(tabId);
    abortTabTranslations(tabId);
  });
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    const configChange = changes[CONFIG_KEY];
    if (configChange) {
      for (const provider of TRANSLATION_PROVIDERS)
        if (
          providerConfigSignature(configChange.oldValue, provider) !==
          providerConfigSignature(configChange.newValue, provider)
        )
          for (const key of translationCache.keys())
            if (key.startsWith(provider + "\u0000"))
              translationCache.delete(key);
      if (
        activeConfigSignature(configChange.oldValue) !==
        activeConfigSignature(configChange.newValue)
      ) {
        cachedLanguages = null;
        invalidateTranslations();
        translationFailure = "";
      }
    }
    const preferenceChange = changes[PREFERENCES_KEY];
    if (preferenceChange) {
      const previous = isRecord(preferenceChange.oldValue)
        ? preferenceChange.oldValue
        : {};
      const next = isRecord(preferenceChange.newValue)
        ? preferenceChange.newValue
        : {};
      if (
        [
          "enabled",
          "targetLanguage",
          "useNativeSecondaryTrack",
          "preferNative",
        ].some((key) => previous[key] !== next[key])
      )
        invalidateTranslations();
      if (previous.enabled !== true && next.enabled === true)
        translationFailure = "";
    }
  });
  runtimeMessageDispatcher.addListener(
    [
      "PIP_STATE_CHANGED",
      "PIP_SUBTITLES_ENABLED_CHANGED",
      "GET_SUBTITLE_TRANSLATION_LANGUAGES",
      "GET_SUBTITLE_TRANSLATION_SERVICES",
      "SET_SUBTITLE_TRANSLATION_PROVIDER",
      "TRANSLATE_SUBTITLE_CUES",
      "TEST_SUBTITLE_TRANSLATION",
    ],
    (message, sender, sendResponse) => {
      if (
        isRecord(message) &&
        message.type === "PIP_STATE_CHANGED" &&
        sender.tab?.id !== undefined
      ) {
        const tabId = sender.tab.id;
        if (message.pipOpen === true) {
          const enabled = message.subtitlesEnabled === true;
          if (pipSubtitleStates.get(tabId) !== enabled) translationGeneration++;
          pipSubtitleStates.set(tabId, enabled);
          if (!enabled) abortTabTranslations(tabId);
        } else {
          // 舊的 session-storage 設定已經失效，清除所有 PiP 分頁的翻譯狀態。
          pipSubtitleStates.set(tabId, false);
          translationGeneration++;
          abortTabTranslations(tabId);
        }
        return false;
      }
      if (
        isRecord(message) &&
        message.type === "PIP_SUBTITLES_ENABLED_CHANGED" &&
        typeof message.enabled === "boolean" &&
        sender.tab?.id !== undefined
      ) {
        const tabId = sender.tab.id;
        if (pipSubtitleStates.get(tabId) !== message.enabled)
          translationGeneration++;
        pipSubtitleStates.set(tabId, message.enabled);
        if (!message.enabled) abortTabTranslations(tabId);
        void chrome.storage.session
          .get("pipTabId")
          .then(async ({ pipTabId }) => {
            if (pipTabId !== tabId) return;
            await chrome.storage.session.set({
              [pipSubtitlesEnabledStorageKey(tabId)]: message.enabled,
            });
          })
          .catch(() => {});
        return false;
      }
      const languageRequest =
        isRecord(message) &&
        message.type === "GET_SUBTITLE_TRANSLATION_LANGUAGES";
      const servicesRequest =
        isRecord(message) &&
        message.type === "GET_SUBTITLE_TRANSLATION_SERVICES";
      const requestedProvider =
        isRecord(message) &&
        message.type === "SET_SUBTITLE_TRANSLATION_PROVIDER" &&
        isTranslationProvider(message.provider)
          ? message.provider
          : null;
      const providerRequest = requestedProvider !== null;
      const testRequest =
        isRecord(message) &&
        message.type === "TEST_SUBTITLE_TRANSLATION" &&
        isTranslationProvider(message.provider)
          ? { provider: message.provider, config: readConfig(message.config) }
          : null;
      const translationRequest = isTranslationRequest(message) ? message : null;
      if (
        !languageRequest &&
        !servicesRequest &&
        !providerRequest &&
        !testRequest &&
        !translationRequest
      )
        return false;
      const requestGeneration = translationGeneration;
      void (async () => {
        try {
          if (testRequest !== null) {
            // 設定頁的連線測試：只接受擴充功能頁面呼叫，不經 PiP 分頁檢查。
            if (
              !testRequest.config ||
              !isTranslationConfigured(testRequest.config, testRequest.provider)
            ) {
              sendResponse({ ok: false, error: "not-configured" });
              return;
            }
            await translate(
              testRequest.config,
              "en",
              ["Hello"],
              testRequest.provider,
              undefined,
              true,
            );
            sendResponse({ ok: true });
            return;
          }
          const tabId = sender.tab?.id;
          if (tabId === undefined) {
            sendResponse({ ok: false, error: "unavailable" });
            return;
          }
          const [{ pipTabId }, stored] = await Promise.all([
            chrome.storage.session.get("pipTabId"),
            chrome.storage.local.get([PREFERENCES_KEY, CONFIG_KEY]),
          ]);
          if (
            pipTabId !== tabId ||
            requestGeneration !== translationGeneration
          ) {
            sendResponse({ ok: false, error: "unavailable" });
            return;
          }
          const config = readConfig(stored[CONFIG_KEY]);
          if (servicesRequest) {
            sendResponse({
              ok: true,
              provider: config?.provider ?? "microsoft",
              services: TRANSLATION_PROVIDERS.map((provider) => ({
                provider,
                configured: config
                  ? isTranslationConfigured(config, provider)
                  : false,
              })),
            });
            return;
          }
          if (requestedProvider !== null) {
            if (
              !config ||
              !isTranslationConfigured(config, requestedProvider)
            ) {
              sendResponse({ ok: false, error: "not-configured" });
              return;
            }
            await chrome.storage.local.set({
              [CONFIG_KEY]: { ...config, provider: requestedProvider },
            });
            sendResponse({ ok: true });
            return;
          }
          if (!config) {
            sendResponse({ ok: false, error: "not-configured" });
            return;
          }
          const preferences = stored[PREFERENCES_KEY];
          const targetLanguage =
            isRecord(preferences) &&
            isTranslationLanguage(preferences.targetLanguage)
              ? preferences.targetLanguage
              : "zh-Hant";
          if (
            !isRecord(preferences) ||
            preferences.enabled !== true ||
            preferences.useNativeSecondaryTrack === true ||
            (translationRequest !== null &&
              targetLanguage !== translationRequest.targetLanguage)
          ) {
            sendResponse({ ok: false, error: "disabled" });
            return;
          }
          const {
            [pipSubtitlesEnabledStorageKey(tabId)]: storedSubtitlesEnabled,
          } = await chrome.storage.session.get(
            pipSubtitlesEnabledStorageKey(tabId),
          );
          const subtitlesEnabled = pipSubtitleStates.has(tabId)
            ? pipSubtitleStates.get(tabId) === true
            : storedSubtitlesEnabled === true;
          if (
            !subtitlesEnabled ||
            requestGeneration !== translationGeneration
          ) {
            sendResponse({ ok: false, error: "disabled" });
            return;
          }
          if (!pipSubtitleStates.has(tabId)) pipSubtitleStates.set(tabId, true);
          if (languageRequest) {
            const controller = new AbortController();
            const controllers =
              activeTranslationControllers.get(tabId) ?? new Set();
            controllers.add(controller);
            activeTranslationControllers.set(tabId, controllers);
            try {
              const languages = await getTranslationLanguages(
                config,
                config.provider,
                controller.signal,
              );
              if (
                pipSubtitleStates.get(tabId) !== true ||
                requestGeneration !== translationGeneration
              ) {
                sendResponse({ ok: false, error: "disabled" });
                return;
              }
              sendResponse({ ok: true, languages });
            } finally {
              controllers.delete(controller);
              if (
                !controllers.size &&
                activeTranslationControllers.get(tabId) === controllers
              )
                activeTranslationControllers.delete(tabId);
            }
            return;
          }
          if (!translationRequest) return;
          if (!isTranslationConfigured(config)) {
            sendResponse({ ok: false, error: "not-configured" });
            return;
          }
          const controller = new AbortController();
          const controllers =
            activeTranslationControllers.get(tabId) ?? new Set();
          controllers.add(controller);
          activeTranslationControllers.set(tabId, controllers);
          try {
            const result = await translate(
              config,
              translationRequest.targetLanguage,
              translationRequest.texts,
              config.provider,
              controller.signal,
            );
            if (
              pipSubtitleStates.get(tabId) !== true ||
              requestGeneration !== translationGeneration
            ) {
              sendResponse({ ok: false, error: "disabled" });
              return;
            }
            sendResponse({
              ok: true,
              translations: result,
              provider: config.provider,
            });
          } finally {
            controllers.delete(controller);
            if (
              !controllers.size &&
              activeTranslationControllers.get(tabId) === controllers
            )
              activeTranslationControllers.delete(tabId);
          }
        } catch (error) {
          const code =
            error instanceof Error &&
            [
              "busy",
              "not-configured",
              "rate-limited",
              "quota-exceeded",
            ].includes(error.message)
              ? error.message
              : "request-failed";
          sendResponse({
            ok: false,
            error:
              requestGeneration !== translationGeneration ? "disabled" : code,
          });
        }
      })();
      return true;
    },
  );
}
