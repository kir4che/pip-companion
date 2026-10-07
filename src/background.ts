import { registerBilibiliDanmakuListener } from "./background/bilibili-danmaku.js";

registerBilibiliDanmakuListener();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "RESIZE_PIP_WINDOW") return;

  const sourceWindowId = sender.tab?.windowId;
  const innerWidth = Number(message.innerWidth);
  const width = Math.round(Number(message.width));
  const height = Math.round(Number(message.height));
  if (
    !Number.isFinite(innerWidth) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 1 ||
    height < 1
  ) {
    sendResponse({ ok: false });
    return;
  }

  void chrome.tabs
    .query({ active: true })
    .then((tabs) => {
      const pipTab = tabs.find(
        (tab) =>
          tab.windowId !== sourceWindowId &&
          typeof tab.width === "number" &&
          Math.abs(tab.width - innerWidth) <= 3,
      );
      if (pipTab?.windowId === undefined) {
        sendResponse({ ok: false });
        return;
      }
      void chrome.windows.update(pipTab.windowId, { width, height }).then(
        () => sendResponse({ ok: true }),
        () => sendResponse({ ok: false }),
      );
    })
    .catch(() => sendResponse({ ok: false }));
  return true;
});
