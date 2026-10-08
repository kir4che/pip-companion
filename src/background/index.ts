import { registerBilibiliDanmakuListener } from "./bilibili-danmaku.js";

registerBilibiliDanmakuListener();

async function getOpenPipTabId(): Promise<number | null> {
  const { pipTabId } = await chrome.storage.session.get("pipTabId");
  if (typeof pipTabId !== "number") return null;

  try {
    const response = await chrome.tabs.sendMessage(pipTabId, { type: "PING" });
    if (response?.pipOpen) return pipTabId;
  } catch {
    // PiP 的來源分頁可能已導覽至其他頁面或關閉
  }

  await chrome.storage.session.set({ pipTabId: null });
  void broadcastPipState(false);
  return null;
}

async function broadcastPipState(pipOpen: boolean) {
  const message = { type: "PIP_GLOBAL_STATE", pipOpen };
  const tabs = await chrome.tabs.query({});
  await Promise.all([
    ...tabs.flatMap((tab) =>
      tab.id === undefined
        ? []
        : [chrome.tabs.sendMessage(tab.id, message).catch(() => {})],
    ),
    chrome.runtime.sendMessage(message).catch(() => {}),
  ]);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PIP_STATE_CHANGED") {
    void (async () => {
      const { pipTabId } = await chrome.storage.session.get("pipTabId");
      if (message.pipOpen === true && sender.tab?.id !== undefined)
        await chrome.storage.session.set({ pipTabId: sender.tab.id });
      else if (
        message.pipOpen === false &&
        (pipTabId === sender.tab?.id || pipTabId == null)
      )
        await chrome.storage.session.set({ pipTabId: null });
      else return;

      await broadcastPipState(message.pipOpen === true);
    })();
    return;
  }
  if (message?.type === "GET_PIP_STATE") {
    void getOpenPipTabId().then(
      (pipTabId) => sendResponse({ ok: true, pipOpen: pipTabId !== null }),
      () => sendResponse({ ok: false, pipOpen: false }),
    );
    return true;
  }
  if (message?.type === "CLOSE_ALL_PIP") {
    void getOpenPipTabId().then(async (pipTabId) => {
      if (pipTabId === null) {
        sendResponse({ ok: true, pipOpen: false });
        return;
      }

      try {
        const result = await chrome.tabs.sendMessage(pipTabId, {
          type: "CLOSE_PIP",
        });
        if (!result?.ok) {
          sendResponse({ ok: false, pipOpen: true });
          return;
        }
        await chrome.storage.session.set({ pipTabId: null });
        await broadcastPipState(false);
        sendResponse({ ok: true, pipOpen: false });
      } catch {
        sendResponse({ ok: false, pipOpen: true });
      }
    });
    return true;
  }
});

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
