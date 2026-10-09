import { isRecord } from "../shared/type-guards.js";
import { registerBilibiliDanmakuListener } from "./bilibili-danmaku.js";

registerBilibiliDanmakuListener();

async function getOpenPipTabId(): Promise<number | null> {
  const { pipTabId } = await chrome.storage.session.get("pipTabId");
  if (typeof pipTabId !== "number") return null;

  try {
    const response: unknown = await chrome.tabs.sendMessage(pipTabId, {
      type: "PING",
    } satisfies ExtensionMessage);
    if (isRecord(response) && response.pipOpen === true) return pipTabId;
  } catch {
    // PiP 的來源分頁可能已導覽至其他頁面或關閉
  }

  await chrome.storage.session.set({ pipTabId: null });
  void broadcastPipState(false);
  return null;
}

async function broadcastPipState(pipOpen: boolean) {
  const message: ExtensionMessage = { type: "PIP_GLOBAL_STATE", pipOpen };
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

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (!isRecord(message)) return false;
    if (message.type === "PIP_STATE_CHANGED") {
      if (typeof message.pipOpen !== "boolean") return false;
      const pipOpen = message.pipOpen;
      void (async () => {
        const { pipTabId } = await chrome.storage.session.get("pipTabId");
        if (pipOpen && sender.tab?.id !== undefined)
          await chrome.storage.session.set({ pipTabId: sender.tab.id });
        else if (!pipOpen && (pipTabId === sender.tab?.id || pipTabId == null))
          await chrome.storage.session.set({ pipTabId: null });
        else return;

        await broadcastPipState(pipOpen);
      })();
      return false;
    }
    if (message.type === "GET_PIP_STATE") {
      void getOpenPipTabId().then(
        (pipTabId) => sendResponse({ ok: true, pipOpen: pipTabId !== null }),
        () => sendResponse({ ok: false, pipOpen: false }),
      );
      return true;
    }
    if (message.type === "CLOSE_ALL_PIP") {
      void getOpenPipTabId().then(async (pipTabId) => {
        if (pipTabId === null) {
          sendResponse({ ok: true, pipOpen: false });
          return;
        }

        try {
          const result: unknown = await chrome.tabs.sendMessage(pipTabId, {
            type: "CLOSE_PIP",
          } satisfies ExtensionMessage);
          if (!isRecord(result) || result.ok !== true) {
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
    return false;
  },
);

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (!isRecord(message) || message.type !== "RESIZE_PIP_WINDOW")
      return false;

    const sourceWindowId = sender.tab?.windowId;
    const {
      innerWidth,
      width: requestedWidth,
      height: requestedHeight,
    } = message;
    if (
      typeof innerWidth !== "number" ||
      typeof requestedWidth !== "number" ||
      typeof requestedHeight !== "number"
    ) {
      sendResponse({ ok: false });
      return false;
    }
    const width = Math.round(requestedWidth);
    const height = Math.round(requestedHeight);

    if (
      !Number.isFinite(innerWidth) ||
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width < 1 ||
      height < 1
    ) {
      sendResponse({ ok: false });
      return false;
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
  },
);
