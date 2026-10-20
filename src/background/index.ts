import "../shared/extra-danmaku-url.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";
import { isRecord } from "../shared/type-guards.js";
import { registerBilibiliSubtitleListener } from "./bilibili-subtitle.js";
import { registerBilibiliDanmakuListener } from "./bilibili-danmaku.js";
import { registerBahamutDanmakuListener } from "./bahamut-danmaku.js";
import { registerTwitchChatListener } from "./twitch-chat.js";
import { registerYouTubeChatListener } from "./youtube-chat.js";
import { registerSubtitleTranslationListener } from "./subtitle-translation.js";

registerBilibiliSubtitleListener();
registerBilibiliDanmakuListener();
registerBahamutDanmakuListener();
registerTwitchChatListener();
registerYouTubeChatListener();
registerSubtitleTranslationListener();

const isValidExtraDanmakuSourceUrl =
  globalThis.PipCompanion.isValidExtraDanmakuSourceUrl;

async function migrateLegacySubtitleSettings() {
  const stored = await chrome.storage.local.get([
    "captionStyle",
    "subtitleStyle",
    "subtitleLayout",
    "pipToggleCaptionsShortcut",
    "pipToggleSubtitlesShortcut",
  ]);
  const updates: Record<string, unknown> = {};
  if (stored.subtitleStyle === undefined && isRecord(stored.captionStyle)) {
    updates.subtitleStyle = stored.captionStyle;
    if (stored.subtitleLayout === undefined) {
      const { backgroundColor, backgroundOpacity, bottomOffset } =
        stored.captionStyle;
      updates.subtitleLayout = {
        backgroundColor,
        backgroundOpacity,
        bottomOffset,
      };
    }
  }
  if (
    stored.pipToggleSubtitlesShortcut === undefined &&
    isRecord(stored.pipToggleCaptionsShortcut)
  )
    updates.pipToggleSubtitlesShortcut = stored.pipToggleCaptionsShortcut;
  if (Object.keys(updates).length) await chrome.storage.local.set(updates);
}

chrome.runtime.onInstalled.addListener(() => {
  void migrateLegacySubtitleSettings().catch((err: unknown) => {
    console.warn("[PiP Companion] Could not migrate subtitle settings:", err);
  });
});

const extraBilibiliSourceStorageKey = (tabId: number) =>
  `extraBilibiliSource:${tabId}`;
const pipSubtitlesEnabledStorageKey = (tabId: number) =>
  `pipSubtitlesEnabled:${tabId}`;
const PIP_WINDOW_ID_STORAGE_KEY = "pipWindowId";
// 尺寸快照必須在關閉通知清除來源分頁前儲存
let pipStateUpdate = Promise.resolve();

chrome.tabs.onRemoved.addListener((tabId) => {
  void chrome.storage.session
    .remove([
      extraBilibiliSourceStorageKey(tabId),
      `additionalBilibiliSource:${tabId}`,
      pipSubtitlesEnabledStorageKey(tabId),
    ])
    .catch(() => {});
});

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
  await chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
  void broadcastPipState(false);
  return null;
}

async function rollbackPipHandoff(sourceTabId: number, targetTabId: number) {
  await chrome.tabs
    .sendMessage(targetTabId, {
      type: "CLOSE_PIP_PRESERVE_PLAYBACK",
    } satisfies ExtensionMessage)
    .catch(() => {});

  let sourceState: unknown = null;
  try {
    sourceState = await chrome.tabs.sendMessage(sourceTabId, {
      type: "PING",
    } satisfies ExtensionMessage);
  } catch {
    // 來源分頁可能正在導覽或關閉，沿用原本的狀態清理流程。
  }
  if (isRecord(sourceState) && sourceState.pipOpen === true) {
    await chrome.storage.session.set({
      pipTabId: sourceTabId,
      pipSourcePlaying: sourceState.pipPlaying !== false,
    });
    await broadcastPipState(true);
    return;
  }
  await chrome.storage.session.set({
    pipTabId: null,
    pipSourcePlaying: true,
  });
  await chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
  await broadcastPipState(false);
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

async function findPipWindow(
  innerWidth: number,
  sourceWindowId: number | undefined,
) {
  const { [PIP_WINDOW_ID_STORAGE_KEY]: storedWindowId } =
    await chrome.storage.session.get(PIP_WINDOW_ID_STORAGE_KEY);
  if (typeof storedWindowId === "number" && storedWindowId !== sourceWindowId) {
    try {
      return await chrome.windows.get(storedWindowId);
    } catch {
      await chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
    }
  }

  const tabs = await chrome.tabs.query({ active: true });
  const candidates = (
    await Promise.all(
      tabs
        .filter(
          (tab) =>
            tab.windowId !== undefined &&
            tab.windowId !== sourceWindowId &&
            typeof tab.width === "number" &&
            Math.abs(tab.width - innerWidth) <= 3,
        )
        .map(async (activeTab) => {
          try {
            const browserWindow = await chrome.windows.get(activeTab.windowId!);
            return { browserWindow, activeTab };
          } catch {
            return null;
          }
        }),
    )
  ).filter(
    (candidate): candidate is NonNullable<typeof candidate> =>
      candidate !== null,
  );
  const popupCandidates = candidates.filter(
    ({ browserWindow }) => browserWindow.type === "popup",
  );
  const selected =
    popupCandidates.length === 1
      ? popupCandidates[0]
      : candidates.length === 1
        ? candidates[0]
        : undefined;
  if (!selected?.browserWindow.id) return null;
  await chrome.storage.session.set({
    [PIP_WINDOW_ID_STORAGE_KEY]: selected.browserWindow.id,
  });
  return selected.browserWindow;
}

chrome.windows.onRemoved.addListener((windowId) => {
  void chrome.storage.session
    .get(PIP_WINDOW_ID_STORAGE_KEY)
    .then(({ [PIP_WINDOW_ID_STORAGE_KEY]: storedWindowId }) => {
      if (storedWindowId === windowId)
        return chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
      return undefined;
    })
    .catch(() => {});
});

runtimeMessageDispatcher.addListener(
  [
    "EXTRA_DANMAKU_SOURCE_CHANGED",
    "PIP_SOURCE_PLAYBACK_CHANGED",
    "PIP_SUBTITLES_ENABLED_CHANGED",
    "PIP_STATE_CHANGED",
    "GET_PIP_BOUNDS",
    "GET_PIP_STATE",
    "REQUEST_PIP_HANDOFF",
    "CLOSE_ALL_PIP",
  ],
  (msg: unknown, sender, sendResponse) => {
    if (!isRecord(msg)) return false;
    if (msg.type === "EXTRA_DANMAKU_SOURCE_CHANGED") {
      const tabId = sender.tab?.id;
      const source = msg.source;
      if (
        tabId === undefined ||
        !isRecord(source) ||
        typeof source.enabled !== "boolean" ||
        typeof source.url !== "string" ||
        source.url.length > 2048 ||
        (source.url !== "" && !isValidExtraDanmakuSourceUrl(source.url)) ||
        (source.enabled && source.url === "") ||
        typeof source.offsetSeconds !== "number" ||
        !Number.isFinite(source.offsetSeconds) ||
        Math.abs(source.offsetSeconds) > 3600
      )
        return false;
      void chrome.storage.session
        .set({
          [extraBilibiliSourceStorageKey(tabId)]: {
            enabled: source.enabled,
            url: source.url,
            offsetSeconds: source.offsetSeconds,
          },
        })
        .catch(() => {});
      return false;
    }
    if (msg.type === "PIP_SOURCE_PLAYBACK_CHANGED") {
      if (typeof msg.playing !== "boolean") return false;
      const playing = msg.playing;
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
    if (msg.type === "PIP_SUBTITLES_ENABLED_CHANGED") {
      if (typeof msg.enabled !== "boolean") return false;
      void (async () => {
        const { pipTabId } = await chrome.storage.session.get("pipTabId");
        if (pipTabId !== sender.tab?.id) return;
        await chrome.storage.session.set({
          [pipSubtitlesEnabledStorageKey(sender.tab!.id as number)]:
            msg.enabled,
        });
      })();
      return false;
    }
    if (msg.type === "PIP_STATE_CHANGED") {
      if (typeof msg.pipOpen !== "boolean") return false;
      const pipOpen = msg.pipOpen;
      pipStateUpdate = pipStateUpdate
        .then(async () => {
          const senderTabId = sender.tab?.id;
          if (senderTabId !== undefined) {
            try {
              const currentState: unknown = await chrome.tabs.sendMessage(
                senderTabId,
                { type: "PING" } satisfies ExtensionMessage,
              );
              if (
                isRecord(currentState) &&
                typeof currentState.pipOpen === "boolean" &&
                currentState.pipOpen !== pipOpen
              )
                return;
            } catch {
              // 來源分頁可能正在導覽或關閉，沿用原本的狀態清理流程。
            }
          }
          const { pipTabId } = await chrome.storage.session.get("pipTabId");
          if (pipOpen && sender.tab?.id !== undefined)
            await chrome.storage.session.set({
              pipTabId: sender.tab.id,
              pipSourcePlaying: msg.playing !== false,
              [pipSubtitlesEnabledStorageKey(sender.tab.id)]:
                msg.subtitlesEnabled === true,
            });
          else if (
            !pipOpen &&
            (pipTabId === sender.tab?.id || pipTabId == null)
          )
            await chrome.storage.session.set({
              pipTabId: null,
              pipSourcePlaying: true,
            });
          else return;

          if (!pipOpen) {
            const keys = [PIP_WINDOW_ID_STORAGE_KEY];
            if (sender.tab?.id !== undefined)
              keys.push(pipSubtitlesEnabledStorageKey(sender.tab.id));
            await chrome.storage.session.remove(keys);
          }

          await broadcastPipState(pipOpen);
        })
        .catch(() => {});
      return false;
    }
    if (msg.type === "GET_PIP_BOUNDS") {
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
    if (msg.type === "GET_PIP_STATE") {
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
    if (msg.type === "REQUEST_PIP_HANDOFF") {
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
          const sourceState: unknown = await chrome.tabs.sendMessage(
            sourceTabId,
            { type: "PING" } satisfies ExtensionMessage,
          );
          if (
            !isRecord(sourceState) ||
            sourceState.pipOpen !== true ||
            sourceState.pipPlaying !== false
          ) {
            sendResponse({ ok: false, pipOpen: true });
            return;
          }

          const result: unknown = await chrome.tabs.sendMessage(targetTabId, {
            type: "OPEN_PIP",
          } satisfies ExtensionMessage);
          if (!isRecord(result) || result.ok !== true) {
            sendResponse({ ok: false, pipOpen: true, message: result });
            return;
          }

          const latestSourceState: unknown = await chrome.tabs
            .sendMessage(sourceTabId, {
              type: "PING",
            } satisfies ExtensionMessage)
            .catch(() => null);
          if (!isRecord(latestSourceState)) {
            await rollbackPipHandoff(sourceTabId, targetTabId);
            sendResponse({ ok: false, pipOpen: true });
            return;
          }

          if (latestSourceState.pipOpen === true) {
            if (latestSourceState.pipPlaying !== false) {
              await rollbackPipHandoff(sourceTabId, targetTabId);
              sendResponse({ ok: false, pipOpen: true });
              return;
            }
            let closeResult: unknown;
            try {
              closeResult = await chrome.tabs.sendMessage(sourceTabId, {
                type: "CLOSE_PIP_IF_PAUSED",
                preservePlayback: true,
              } satisfies ExtensionMessage);
            } catch {
              // 原 PiP 分頁在交接中關閉時，沿用原本的跨分頁切換行為。
            }
            if (!isRecord(closeResult) || closeResult.ok !== true) {
              let remainingSourcePip: unknown = null;
              try {
                remainingSourcePip = await chrome.tabs.sendMessage(
                  sourceTabId,
                  { type: "PING" } satisfies ExtensionMessage,
                );
              } catch {
                // 舊的 PiP 分頁可能已導覽或關閉，沿用原本的跨分頁切換行為。
              }
              if (
                isRecord(remainingSourcePip) &&
                remainingSourcePip.pipOpen === true
              ) {
                await rollbackPipHandoff(sourceTabId, targetTabId);
                sendResponse({ ok: false, pipOpen: true });
                return;
              }
            }
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
    if (msg.type === "CLOSE_ALL_PIP") {
      void getOpenPipTabId().then(async (pipTabId) => {
        if (pipTabId === null) {
          await chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
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
          try {
            const currentState: unknown = await chrome.tabs.sendMessage(
              pipTabId,
              { type: "PING" } satisfies ExtensionMessage,
            );
            if (isRecord(currentState) && currentState.pipOpen === true) {
              sendResponse({ ok: true, pipOpen: true });
              return;
            }
          } catch {
            // 關閉完成後來源分頁可能已導覽或關閉。
          }
          await chrome.storage.session.set({ pipTabId: null });
          await chrome.storage.session.remove(PIP_WINDOW_ID_STORAGE_KEY);
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

runtimeMessageDispatcher.addListener(
  [
    "SAVE_PIP_BOUNDS",
    "RESTORE_PIP_BOUNDS",
    "CENTER_PIP_BOUNDS",
    "RESIZE_PIP_WINDOW",
  ],
  (msg: unknown, sender, sendResponse) => {
    if (!isRecord(msg)) return false;
    if (
      msg.type === "SAVE_PIP_BOUNDS" ||
      msg.type === "RESTORE_PIP_BOUNDS" ||
      msg.type === "CENTER_PIP_BOUNDS"
    ) {
      const sourceWindowId = sender.tab?.windowId;
      const innerWidth = msg.innerWidth;
      if (
        sourceWindowId === undefined ||
        typeof innerWidth !== "number" ||
        !Number.isFinite(innerWidth)
      ) {
        sendResponse({ ok: false });
        return false;
      }

      const updateBounds = async () => {
        try {
          let pipBounds: unknown;
          if (msg.type === "RESTORE_PIP_BOUNDS") {
            ({ pipBounds } = await chrome.storage.session.get("pipBounds"));
            if (pipBounds === undefined) {
              sendResponse({ ok: false, missing: true });
              return;
            }
          }

          const pipWindow =
            msg.type === "SAVE_PIP_BOUNDS"
              ? null
              : await findPipWindow(innerWidth, sourceWindowId);
          if (msg.type !== "SAVE_PIP_BOUNDS" && pipWindow?.id === undefined) {
            sendResponse({ ok: false });
            return;
          }

          if (
            msg.type === "SAVE_PIP_BOUNDS" ||
            msg.type === "CENTER_PIP_BOUNDS"
          ) {
            const { pipTabId } = await chrome.storage.session.get("pipTabId");
            const { left, top, width, height } = msg;
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
            if (msg.type === "SAVE_PIP_BOUNDS") {
              sendResponse({ ok: true });
              return;
            }
            pipBounds = { left, top, width, height };
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
          if (pipWindow?.id === undefined) return;
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
      };
      if (msg.type === "SAVE_PIP_BOUNDS")
        pipStateUpdate = pipStateUpdate.then(updateBounds).catch(() => {});
      else void updateBounds();
      return true;
    }
    if (msg.type !== "RESIZE_PIP_WINDOW") return false;

    const sourceWindowId = sender.tab?.windowId;
    const { innerWidth, width: requestedWidth, height: requestedHeight } = msg;
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

    void findPipWindow(innerWidth, sourceWindowId)
      .then((pipWindow) => {
        if (pipWindow?.id === undefined) {
          sendResponse({ ok: false });
          return;
        }
        void chrome.windows.update(pipWindow.id, { width, height }).then(
          () => sendResponse({ ok: true }),
          () => sendResponse({ ok: false }),
        );
      })
      .catch(() => sendResponse({ ok: false }));
    return true;
  },
);
