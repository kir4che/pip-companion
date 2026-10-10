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

  await chrome.storage.session.set({ pipTabId: null, pipSourcePlaying: true });
  void broadcastPipState(false);
  return null;
}

async function broadcastPipState(pipOpen: boolean) {
  const { pipSourcePlaying } =
    await chrome.storage.session.get("pipSourcePlaying");
  const message: ExtensionMessage = {
    type: "PIP_GLOBAL_STATE",
    pipOpen,
    sourcePlaying: pipOpen ? pipSourcePlaying !== false : true,
  };
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

async function findPipWindow(innerWidth: number, sourceWindowId: number) {
  const tabs = await chrome.tabs.query({ active: true });
  const pipTab = tabs.find(
    (tab) =>
      tab.windowId !== sourceWindowId &&
      typeof tab.width === "number" &&
      Math.abs(tab.width - innerWidth) <= 3,
  );
  if (pipTab?.windowId === undefined) return null;
  return chrome.windows.get(pipTab.windowId);
}

chrome.runtime.onMessage.addListener(
  (message: unknown, sender, sendResponse) => {
    if (!isRecord(message)) return false;
    if (message.type === "PIP_SOURCE_PLAYBACK_CHANGED") {
      if (typeof message.playing !== "boolean") return false;
      const playing = message.playing;
      void (async () => {
        const { pipTabId } = await chrome.storage.session.get("pipTabId");
        if (pipTabId !== sender.tab?.id) return;
        await chrome.storage.session.set({ pipSourcePlaying: playing });
        const playbackMessage: ExtensionMessage = {
          type: "PIP_SOURCE_PLAYBACK_CHANGED",
          playing,
        };
        const tabs = await chrome.tabs.query({});
        await Promise.all(
          tabs.flatMap((tab) =>
            tab.id === undefined || tab.id === sender.tab?.id
              ? []
              : [
                  chrome.tabs
                    .sendMessage(tab.id, playbackMessage)
                    .catch(() => {}),
                ],
          ),
        );
      })();
      return false;
    }
    if (message.type === "PIP_STATE_CHANGED") {
      if (typeof message.pipOpen !== "boolean") return false;
      const pipOpen = message.pipOpen;
      void (async () => {
        const { pipTabId } = await chrome.storage.session.get("pipTabId");
        if (pipOpen && sender.tab?.id !== undefined)
          await chrome.storage.session.set({
            pipTabId: sender.tab.id,
            pipSourcePlaying: message.playing !== false,
          });
        else if (!pipOpen && (pipTabId === sender.tab?.id || pipTabId == null))
          await chrome.storage.session.set({
            pipTabId: null,
            pipSourcePlaying: true,
          });
        else return;

        await broadcastPipState(pipOpen);
      })();
      return false;
    }
    if (message.type === "GET_PIP_BOUNDS") {
      void chrome.storage.session.get("pipBounds").then(({ pipBounds }) => {
        if (
          !isRecord(pipBounds) ||
          typeof pipBounds.width !== "number" ||
          typeof pipBounds.height !== "number" ||
          !Number.isFinite(pipBounds.width) ||
          !Number.isFinite(pipBounds.height) ||
          pipBounds.width < 1 ||
          pipBounds.height < 1
        ) {
          sendResponse({ ok: false });
          return;
        }
        sendResponse({
          ok: true,
          width: Math.round(pipBounds.width),
          height: Math.round(pipBounds.height),
        });
      });
      return true;
    }
    if (message.type === "GET_PIP_STATE") {
      void getOpenPipTabId().then(
        async (pipTabId) => {
          const { pipSourcePlaying } =
            await chrome.storage.session.get("pipSourcePlaying");
          sendResponse({
            ok: true,
            pipOpen: pipTabId !== null,
            sourcePlaying: pipTabId === null || pipSourcePlaying !== false,
          });
        },
        () => sendResponse({ ok: false, pipOpen: false, sourcePlaying: true }),
      );
      return true;
    }
    if (message.type === "REQUEST_PIP_HANDOFF") {
      const targetTabId = sender.tab?.id;
      if (targetTabId === undefined) {
        sendResponse({ ok: false, pipOpen: true });
        return false;
      }
      void getOpenPipTabId().then(async (sourceTabId) => {
        if (sourceTabId === null || sourceTabId === targetTabId) {
          sendResponse({ ok: false, pipOpen: sourceTabId !== null });
          return;
        }

        try {
          const result: unknown = await chrome.tabs.sendMessage(targetTabId, {
            type: "OPEN_PIP",
          } satisfies ExtensionMessage);
          if (!isRecord(result) || result.ok !== true) {
            sendResponse({ ok: false, pipOpen: true, message: result });
            return;
          }

          try {
            await chrome.tabs.sendMessage(sourceTabId, {
              type: "CLOSE_PIP",
            } satisfies ExtensionMessage);
          } catch {
            // 新 PiP 已建立時，來源分頁可能已被瀏覽器自動關閉。
          }
          await chrome.storage.session.set({
            pipTabId: targetTabId,
            pipSourcePlaying: true,
          });
          await broadcastPipState(true);
          sendResponse({ ok: true, pipOpen: true });
        } catch {
          sendResponse({ ok: false, pipOpen: true });
        }
      });
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
    if (!isRecord(message)) return false;
    if (
      message.type === "SAVE_PIP_BOUNDS" ||
      message.type === "RESTORE_PIP_BOUNDS"
    ) {
      const sourceWindowId = sender.tab?.windowId;
      const innerWidth = message.innerWidth;
      if (
        sourceWindowId === undefined ||
        typeof innerWidth !== "number" ||
        !Number.isFinite(innerWidth)
      ) {
        sendResponse({ ok: false });
        return false;
      }

      void (async () => {
        try {
          let pipBounds: unknown;
          if (message.type === "RESTORE_PIP_BOUNDS") {
            ({ pipBounds } = await chrome.storage.session.get("pipBounds"));
            if (pipBounds === undefined) {
              sendResponse({ ok: false, missing: true });
              return;
            }
          }

          const pipWindow = await findPipWindow(innerWidth, sourceWindowId);
          if (pipWindow?.id === undefined) {
            sendResponse({ ok: false });
            return;
          }

          if (message.type === "SAVE_PIP_BOUNDS") {
            const { pipTabId } = await chrome.storage.session.get("pipTabId");
            const { left, top, width, height } = message;
            if (
              pipTabId !== sender.tab?.id ||
              typeof left !== "number" ||
              typeof top !== "number" ||
              typeof width !== "number" ||
              typeof height !== "number" ||
              ![left, top, width, height].every(Number.isFinite) ||
              width < 1 ||
              height < 1
            ) {
              sendResponse({ ok: false });
              return;
            }
            await chrome.storage.session.set({
              pipBounds: { left, top, width, height },
            });
            sendResponse({ ok: true });
            return;
          }

          if (
            !isRecord(pipBounds) ||
            typeof pipBounds.left !== "number" ||
            typeof pipBounds.top !== "number" ||
            typeof pipBounds.width !== "number" ||
            typeof pipBounds.height !== "number" ||
            ![
              pipBounds.left,
              pipBounds.top,
              pipBounds.width,
              pipBounds.height,
            ].every(Number.isFinite) ||
            pipBounds.width < 1 ||
            pipBounds.height < 1
          ) {
            sendResponse({ ok: false });
            return;
          }
          await chrome.windows.update(pipWindow.id, {
            left: Math.round(pipBounds.left),
            top: Math.round(pipBounds.top),
            width: Math.round(pipBounds.width),
            height: Math.round(pipBounds.height),
          });
          sendResponse({ ok: true });
        } catch {
          sendResponse({ ok: false });
        }
      })();
      return true;
    }
    if (message.type !== "RESIZE_PIP_WINDOW") return false;

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
