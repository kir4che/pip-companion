"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.ContentYouTubeDanmakuSender = (() => {
  const site = globalThis.PipCompanion.site;
  const MAX_MESSAGE_LENGTH = 200;
  const EDITOR_SELECTORS = [
    "yt-live-chat-message-input-renderer [contenteditable]",
    "yt-live-chat-text-input-field-renderer [contenteditable]",
    "yt-live-chat-text-input-field-renderer textarea",
    "#input[contenteditable]",
  ];
  const BUTTON_SELECTORS = [
    "#send-button button",
    "button#send-button",
    "#send-button",
    'button[aria-label*="Send"]',
    'button[aria-label*="送出"]',
  ];
  const CHAT_FRAME_SELECTOR =
    'ytd-live-chat-frame iframe, iframe#chatframe, iframe[src*="/live_chat"]';

  function getDocuments(): Document[] {
    const docs = [document];
    for (const frame of document.querySelectorAll<HTMLIFrameElement>(
      CHAT_FRAME_SELECTOR,
    )) {
      try {
        const frameDocument = frame.contentDocument;
        if (frameDocument) docs.push(frameDocument);
      } catch {}
    }
    return docs;
  }

  function findElement<T extends Element>(selectors: string[]): T | null {
    for (const doc of getDocuments()) {
      for (const selector of selectors) {
        const element = doc.querySelector<T>(selector);
        if (element) return element;
      }
    }
    return null;
  }

  function getComposer(): { input: HTMLElement; button: HTMLElement } | null {
    const input = findElement<HTMLElement>(EDITOR_SELECTORS);
    if (!input) return null;
    const root =
      input.closest("yt-live-chat-message-input-renderer") ||
      input.closest("yt-live-chat-text-input-field-renderer");
    let button: HTMLElement | null = null;
    if (root) {
      for (const selector of BUTTON_SELECTORS) {
        button = root.querySelector<HTMLElement>(selector);
        if (button) break;
      }
    }
    button ||= findElement<HTMLElement>(BUTTON_SELECTORS);
    return button ? { input, button } : null;
  }

  async function waitForComposer(): Promise<{
    input: HTMLElement;
    button: HTMLElement;
  } | null> {
    const deadline = Date.now() + 2000;
    let composer = getComposer();
    while (!composer && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      composer = getComposer();
    }
    return composer;
  }

  function isLiveVideo(): boolean {
    const player = document.querySelector("#movie_player") as {
      getVideoData?: () => { isLive?: boolean };
    } | null;
    try {
      const isLive = player?.getVideoData?.().isLive;
      if (typeof isLive === "boolean") return isLive;
    } catch {}

    const bridgedIsLive = document.documentElement.dataset.pipYtIsLive;
    if (bridgedIsLive === "true") return true;
    if (bridgedIsLive === "false") return false;

    return Boolean(
      document.querySelector(
        "#movie_player.ytp-live, #movie_player .ytp-live-badge",
      ),
    );
  }

  function isSupportedPage(): boolean {
    if (!site.isYouTubeHost(location.hostname)) return false;
    if (/^\/watch(?:\/|$)/.test(location.pathname)) return isLiveVideo();
    if (/^\/live\/[^/]+/.test(location.pathname)) return isLiveVideo();
    if (/^\/live_chat(?:\/|$)/.test(location.pathname))
      return Boolean(getComposer());
    return false;
  }

  function getCharacterLimit(): number | null {
    return getComposer() ? MAX_MESSAGE_LENGTH : null;
  }

  function readText(element: HTMLElement): string {
    return element.tagName === "INPUT" || element.tagName === "TEXTAREA"
      ? (element as HTMLInputElement | HTMLTextAreaElement).value
      : element.innerText || element.textContent || "";
  }

  function setText(element: HTMLElement, text: string): void {
    if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
      const prototype = Object.getPrototypeOf(element) as object;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (setter) setter.call(element, text);
      else (element as HTMLInputElement | HTMLTextAreaElement).value = text;
    } else {
      element.textContent = text;
    }
    const view = element.ownerDocument.defaultView;
    if (view) {
      element.dispatchEvent(
        new view.InputEvent("input", {
          bubbles: true,
          inputType: "insertText",
          data: text,
        }),
      );
      element.dispatchEvent(new view.Event("change", { bubbles: true }));
    }
  }

  function isDisabled(element: HTMLElement): boolean {
    return (
      element.matches(":disabled") ||
      element.getAttribute("aria-disabled") === "true"
    );
  }

  async function waitForSendButton(button: HTMLElement): Promise<boolean> {
    const deadline = Date.now() + 500;
    while (
      (!button.isConnected ||
        !button.getClientRects().length ||
        isDisabled(button)) &&
      Date.now() < deadline
    ) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    return (
      button.isConnected &&
      button.getClientRects().length > 0 &&
      !isDisabled(button)
    );
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

    const composer = await waitForComposer();
    if (!composer)
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (isDisabled(composer.input))
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (readText(composer.input).trim())
      return {
        ok: false,
        nativeInputCleared: false,
      };
    if (text.length > MAX_MESSAGE_LENGTH)
      return {
        ok: false,
        nativeInputCleared: false,
      };

    composer.input.focus();
    setText(composer.input, text);
    if (!(await waitForSendButton(composer.button))) {
      if (readText(composer.input) === text) setText(composer.input, "");
      return {
        ok: false,
        nativeInputCleared: false,
      };
    }
    composer.button.click();

    const deadline = Date.now() + 1000;
    while (readText(composer.input) && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    const nativeInputCleared = !readText(composer.input);
    return {
      ok: true,
      nativeInputCleared,
    };
  }

  return { isSupportedPage, getCharacterLimit, send };
})();
