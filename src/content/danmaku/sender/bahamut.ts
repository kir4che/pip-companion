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
    // 巴哈的限制依 UTF-8 位元組數計算，並非固定的 JavaScript 字元數。
    return null;
  }

  function setNativeValue(input: HTMLInputElement, value: string): void {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    const view = input.ownerDocument.defaultView;
    input.dispatchEvent(new (view?.Event ?? Event)("input", { bubbles: true }));
    input.dispatchEvent(
      new (view?.Event ?? Event)("change", { bubbles: true }),
    );
  }

  async function waitForSendButton(button: HTMLElement): Promise<boolean> {
    const deadline = Date.now() + 500;
    while (
      (button.matches(":disabled") ||
        button.getAttribute("aria-disabled") === "true") &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return (
      button.isConnected &&
      !button.matches(":disabled") &&
      button.getAttribute("aria-disabled") !== "true"
    );
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
      !(await waitForSendButton(composer.button))
    ) {
      if (composer.input.value === text) setNativeValue(composer.input, "");
      return { ok: false, nativeInputCleared: false };
    }

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
