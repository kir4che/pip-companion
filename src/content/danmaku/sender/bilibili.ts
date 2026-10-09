"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentBilibiliDanmakuSender = (() => {
  const site = globalThis.PipCompanion.site;

  function isSupportedPage(): boolean {
    if (site.isBilibiliLiveHost(location.hostname)) return true;
    if (!site.isBilibiliHost(location.hostname)) return false;
    return (
      Boolean(site.parseBilibiliVideoPath(location.pathname)) ||
      /^\/bangumi\/play\/(?:ss|ep)\d+/i.test(location.pathname)
    );
  }

  function getComposer(): {
    input: HTMLInputElement | HTMLTextAreaElement;
    button: HTMLElement;
  } | null {
    if (site.isBilibiliLiveHost(location.hostname)) {
      const input =
        document.querySelector<HTMLTextAreaElement>(
          ".chat-input-new textarea",
        ) ||
        document.querySelector<HTMLTextAreaElement>(
          "#chat-control-panel-vm textarea",
        );
      const composer = input?.closest<HTMLElement>(
        ".chat-input-new, #chat-control-panel-vm",
      );
      const button =
        composer?.querySelector<HTMLElement>(".send-btn") ??
        composer?.querySelector<HTMLElement>(".right-actions button");
      return input && button ? { input, button } : null;
    }

    const input = document.querySelector<HTMLInputElement>(
      ".bpx-player-dm-input",
    );
    const button = document.querySelector<HTMLElement>(
      ".bpx-player-dm-btn-send",
    );
    return input && button ? { input, button } : null;
  }

  function setNativeValue(
    input: HTMLInputElement | HTMLTextAreaElement,
    value: string,
  ): void {
    const prototype = Object.getPrototypeOf(input) as object;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function getCharacterLimit(): number | null {
    const maxLength = getComposer()?.input.maxLength;
    return maxLength && maxLength > 0 ? maxLength : null;
  }

  async function send(
    text: string,
  ): Promise<{ ok: boolean; nativeInputCleared: boolean }> {
    if (!isSupportedPage())
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (typeof text !== "string" || !text.trim())
      return {
        ok: false,
        nativeInputCleared: false,
      };

    const composer = getComposer();
    if (!composer)
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (
      composer.input.disabled ||
      composer.button.matches(":disabled") ||
      composer.button.getAttribute("aria-disabled") === "true"
    )
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (composer.input.value.length > 0)
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (composer.input.maxLength > 0 && text.length > composer.input.maxLength)
      return {
        ok: false,
        nativeInputCleared: false,
      };

    setNativeValue(composer.input, text);
    if (
      composer.button.matches(":disabled") ||
      composer.button.getAttribute("aria-disabled") === "true"
    ) {
      if (composer.input.value === text) setNativeValue(composer.input, "");
      return {
        ok: false,
        nativeInputCleared: false,
      };
    }

    composer.button.click();
    const deadline = Date.now() + 1000;
    while (composer.input.value && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    const nativeInputCleared = composer.input.value === "";
    return {
      ok: true,
      nativeInputCleared,
    };
  }

  return { isSupportedPage, getCharacterLimit, send };
})();
