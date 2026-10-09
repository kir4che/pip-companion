"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentBahamutDanmakuSender = (() => {
  const site = globalThis.PipCompanion.site;

  type Composer = {
    input: HTMLInputElement;
    button: HTMLElement;
    signInNotice: HTMLElement | null;
  };

  function isVideoPage(): boolean {
    return (
      site.isBahamutHost(location.hostname) &&
      /^\/animeVideo\.php$/i.test(location.pathname) &&
      /^\d+$/.test(new URL(location.href).searchParams.get("sn") || "")
    );
  }

  function getComposer(): Composer | null {
    const player = document.querySelector("#video-container");
    const input = player?.querySelector<HTMLInputElement>(
      "input#danmutxt.danmu-text",
    );
    const button = player?.querySelector<HTMLElement>(".danmu-send_btn");
    if (!input || !button) return null;

    return {
      input,
      button,
      signInNotice:
        player?.querySelector<HTMLElement>(".danmu_UserSignIn") ?? null,
    };
  }

  function isVisible(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      element.isConnected &&
      !element.hidden &&
      !element.classList.contains("vjs-hidden") &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      element.getClientRects().length > 0
    );
  }

  function isSignedIn(composer: Composer): boolean {
    return !composer.signInNotice || !isVisible(composer.signInNotice);
  }

  function isSupportedPage(): boolean {
    if (!isVideoPage()) return false;
    const composer = getComposer();
    return Boolean(composer && isSignedIn(composer));
  }

  function getCharacterLimit(): number | null {
    // Bahamut enforces a UTF-8 byte limit, not a fixed JavaScript character count.
    return null;
  }

  function setNativeValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  async function send(
    text: string,
  ): Promise<{ ok: boolean; nativeInputCleared: boolean }> {
    if (!isVideoPage() || typeof text !== "string" || !text.trim())
      return { ok: false, nativeInputCleared: false };

    const composer = getComposer();
    if (
      !composer ||
      !isSignedIn(composer) ||
      composer.input.disabled ||
      composer.button.matches(":disabled") ||
      composer.button.getAttribute("aria-disabled") === "true" ||
      composer.input.value
    ) {
      return { ok: false, nativeInputCleared: false };
    }

    setNativeValue(composer.input, text);
    if (
      composer.input.value !== text ||
      composer.button.matches(":disabled") ||
      composer.button.getAttribute("aria-disabled") === "true"
    ) {
      if (composer.input.value === text) setNativeValue(composer.input, "");
      return { ok: false, nativeInputCleared: false };
    }

    // Let Bahamut's own player handler validate and send through the signed-in session.
    composer.button.click();

    const deadline = Date.now() + 1000;
    while (composer.input.value && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    return {
      ok: true,
      nativeInputCleared: composer.input.value === "",
    };
  }

  return { isSupportedPage, getCharacterLimit, send };
})();
