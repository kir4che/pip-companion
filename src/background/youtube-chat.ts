import { isRecord } from "../shared/type-guards.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";

type RelayConnection = {
  connectionId: string;
  videoId: string;
  targetTabId: number;
  targetUrl: string;
  sourceTabId: number | null;
  sourceUrl: string;
  seekRevision: number;
};

const connections = new Map<number, RelayConnection>();
const pendingSourceTabs = new Map<string, Promise<number>>();
const knownSourceTabs = new Map<number, string>();
const SOURCE_OPEN_TIMEOUT_MS = 20000;
const SOURCE_OPEN_POLL_MS = 500;
const SOURCE_REUSE_WAIT_MS = 5000;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sourceVideoId(value: string | undefined): string | null {
  try {
    const url = new URL(value || "");
    if (url.protocol !== "https:" || !/(^|\.)youtube\.com$/i.test(url.hostname))
      return null;
    if (url.pathname === "/watch") return url.searchParams.get("v");
    return url.pathname.match(/^\/live\/([\w-]{11})\/?$/)?.[1] || null;
  } catch {
    return null;
  }
}

function send(tabId: number, message: ExtensionMessage): Promise<unknown> {
  return chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
}

async function readSourceProbe(
  tabId: number,
): Promise<{ videoId: string; url: string } | null> {
  try {
    const probe = await send(tabId, { type: "YOUTUBE_CHAT_PROBE" });
    if (
      !isRecord(probe) ||
      typeof probe.videoId !== "string" ||
      typeof probe.url !== "string" ||
      sourceVideoId(probe.url) !== probe.videoId
    )
      return null;
    return { videoId: probe.videoId, url: probe.url };
  } catch {
    return null;
  }
}

async function probeSourceTab(
  tabId: number,
  videoId: string,
): Promise<string | null> {
  const probe = await readSourceProbe(tabId);
  return probe && probe.videoId === videoId ? probe.url : null;
}

function claimedSourceTabIds(): Set<number> {
  const claimed = new Set<number>();
  for (const connection of connections.values())
    if (connection.sourceTabId !== null) claimed.add(connection.sourceTabId);
  return claimed;
}

type SourceLookup = {
  source: { tabId: number; url: string } | null;
  claimedVideo: boolean;
};

async function findSourceTab(
  videoId: string,
  targetTabId: number,
): Promise<SourceLookup> {
  const claimed = claimedSourceTabIds();
  const tabs = await chrome.tabs.query({});
  let claimedVideo = false;
  for (const tab of tabs) {
    if (tab.id === undefined || tab.id === targetTabId) continue;
    const url = await probeSourceTab(tab.id, videoId);
    if (url === null) continue;
    knownSourceTabs.set(tab.id, videoId);
    if (claimed.has(tab.id)) {
      claimedVideo = true;
      continue;
    }
    return { source: { tabId: tab.id, url }, claimedVideo };
  }
  return { source: null, claimedVideo };
}

// 已知的來源分頁若正在重新整理，短暫等待它重新就緒，避免重新套用時重複開啟分頁。
async function reuseKnownSourceTab(
  videoId: string,
  isStillConnected: () => boolean,
): Promise<{ tabId: number; url: string } | null> {
  for (const [tabId, knownVideoId] of [...knownSourceTabs]) {
    if (knownVideoId !== videoId) continue;
    try {
      await chrome.tabs.get(tabId);
    } catch {
      knownSourceTabs.delete(tabId);
      continue;
    }
    const deadline = Date.now() + SOURCE_REUSE_WAIT_MS;
    while (Date.now() < deadline) {
      if (!isStillConnected()) return null;
      const probe = await readSourceProbe(tabId);
      if (probe) {
        if (probe.videoId === videoId) return { tabId, url: probe.url };
        knownSourceTabs.delete(tabId);
        break;
      }
      await wait(SOURCE_OPEN_POLL_MS);
    }
  }
  return null;
}

function hasConnectionForVideo(videoId: string): boolean {
  for (const connection of connections.values())
    if (connection.videoId === videoId) return true;
  return false;
}

// 每部影片重用一個進行中的自動開啟，避免重複或同時啟用時開啟第二個來源分頁。
function openSourceTab(videoId: string): Promise<number> {
  const existing = pendingSourceTabs.get(videoId);
  if (existing) return existing;
  const open = (async () => {
    const tab = await chrome.tabs.create({
      url: `https://www.youtube.com/watch?v=${videoId}`,
      active: false,
    });
    if (tab.id === undefined) throw new Error("無法開啟 YouTube 來源分頁。");
    const deadline = Date.now() + SOURCE_OPEN_TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (!hasConnectionForVideo(videoId))
        throw new Error("YouTube 聊天連線已取消。");
      await new Promise((resolve) => setTimeout(resolve, SOURCE_OPEN_POLL_MS));
      if (await probeSourceTab(tab.id, videoId)) return tab.id;
    }
    throw new Error(
      "無法自動開啟 YouTube 來源分頁，請確認影片可正常播放後再試。",
    );
  })();
  pendingSourceTabs.set(videoId, open);
  const clear = () => {
    if (pendingSourceTabs.get(videoId) === open)
      pendingSourceTabs.delete(videoId);
  };
  void open.then(clear, clear);
  return open;
}

function stop(connection: RelayConnection, error?: string): void {
  if (connections.get(connection.targetTabId) !== connection) return;
  connections.delete(connection.targetTabId);
  if (connection.sourceTabId !== null)
    void send(connection.sourceTabId, {
      type: "YOUTUBE_CHAT_STOP",
      connectionId: connection.connectionId,
    }).catch(() => {});
  if (error)
    void send(connection.targetTabId, {
      type: "EXTRA_YOUTUBE_CHAT_STATUS",
      connectionId: connection.connectionId,
      videoId: connection.videoId,
      status: "error",
      error,
    }).catch(() => {});
}

export function registerYouTubeChatListener(): void {
  runtimeMessageDispatcher.addListener(
    [
      "START_EXTRA_YOUTUBE_CHAT",
      "STOP_EXTRA_YOUTUBE_CHAT",
      "EXTRA_YOUTUBE_CHAT_CLOCK",
      "YOUTUBE_CHAT_MESSAGE",
      "YOUTUBE_CHAT_ENDED",
    ],
    async (message, sender, respond) => {
      if (
        !isRecord(message) ||
        sender.frameId !== 0 ||
        sender.tab?.id === undefined ||
        !sender.url
      )
        return;
      const tabId = sender.tab.id;
      if (message.type === "START_EXTRA_YOUTUBE_CHAT") {
        const previous = connections.get(tabId);
        if (previous) stop(previous);
        const connection: RelayConnection = {
          connectionId: message.connectionId as string,
          videoId: message.videoId as string,
          targetTabId: tabId,
          targetUrl: sender.url,
          sourceTabId: null,
          sourceUrl: "",
          seekRevision: 0,
        };
        connections.set(tabId, connection);
        const isStillConnected = () => connections.get(tabId) === connection;
        try {
          const lookup = await findSourceTab(connection.videoId, tabId);
          if (!isStillConnected()) {
            respond({ ok: false });
            return;
          }
          let source = lookup.source;
          // 已經正在為其他目標提供內容的來源分頁，不得觸發重複開啟分頁；呼叫端必須等待或選擇其他來源。
          if (!source && lookup.claimedVideo)
            throw new Error("此 YouTube 來源分頁正被其他目標使用。");
          if (!source) {
            source = await reuseKnownSourceTab(
              connection.videoId,
              isStillConnected,
            );
            if (!isStillConnected()) {
              respond({ ok: false });
              return;
            }
          }
          if (!source) {
            const openedTabId = await openSourceTab(connection.videoId);
            if (!isStillConnected()) {
              respond({ ok: false });
              return;
            }
            const url = await probeSourceTab(openedTabId, connection.videoId);
            source = url === null ? null : { tabId: openedTabId, url };
          }
          if (!source) throw new Error("找不到可用的 YouTube 來源分頁。");
          // 來源分頁只能為一個目標提供內容；claimedSourceTabIds 覆蓋了非同步探測完成前的快照。
          if (
            [...connections.values()].some(
              (candidate) =>
                candidate !== connection &&
                candidate.sourceTabId === source.tabId,
            )
          )
            throw new Error("此 YouTube 來源分頁正被其他目標使用。");
          connection.sourceTabId = source.tabId;
          connection.sourceUrl = source.url;
          knownSourceTabs.set(source.tabId, connection.videoId);
          const response = await send(source.tabId, {
            type: "YOUTUBE_CHAT_START",
            connectionId: connection.connectionId,
            videoId: connection.videoId,
          });
          if (!isStillConnected()) {
            respond({ ok: false });
            return;
          }
          if (
            !isRecord(response) ||
            response.ok !== true ||
            (response.mode !== "live" && response.mode !== "replay")
          )
            throw new Error(
              "YouTube 聊天室尚未就緒，或此影片沒有可用的聊天重播。",
            );
          respond({ ok: true, mode: response.mode });
          return;
        } catch (error) {
          stop(connection);
          respond({
            ok: false,
            error:
              error instanceof Error ? error.message : "YouTube 聊天連線失敗。",
          });
        }
        return;
      }
      if (
        message.type === "YOUTUBE_CHAT_MESSAGE" ||
        message.type === "YOUTUBE_CHAT_ENDED"
      ) {
        const connection = [...connections.values()].find(
          (c) =>
            c.sourceTabId === tabId && c.connectionId === message.connectionId,
        );
        if (
          !connection ||
          sourceVideoId(sender.url) !== connection.videoId ||
          sender.url !== connection.sourceUrl
        )
          return;
        if (message.type === "YOUTUBE_CHAT_ENDED") {
          stop(connection, "YouTube 聊天來源已中斷或換片。");
          return;
        }
        if (message.seekRevision !== connection.seekRevision) return;
        await send(connection.targetTabId, {
          type: "EXTRA_YOUTUBE_CHAT_MESSAGE",
          connectionId: connection.connectionId,
          videoId: connection.videoId,
          seekRevision: connection.seekRevision,
          data: message.data as DanmakuData,
        }).catch(() => stop(connection));
        return;
      }
      const connection = connections.get(tabId);
      if (
        !connection ||
        connection.connectionId !== message.connectionId ||
        connection.targetUrl !== sender.url
      ) {
        respond({
          ok: false,
          error: "YouTube 聊天連線已失效，請重新套用來源。",
        });
        return;
      }
      if (message.type === "STOP_EXTRA_YOUTUBE_CHAT") {
        stop(connection);
        return;
      }
      if (
        message.type === "EXTRA_YOUTUBE_CHAT_CLOCK" &&
        connection.sourceTabId !== null
      ) {
        if ((message.seekRevision as number) < connection.seekRevision) return;
        connection.seekRevision = message.seekRevision as number;
        await send(connection.sourceTabId, {
          type: "YOUTUBE_CHAT_CLOCK",
          connectionId: connection.connectionId,
          time: message.time as number,
          paused: message.paused as boolean,
          ended: message.ended as boolean,
          seekRevision: connection.seekRevision,
        }).catch(() =>
          stop(connection, "YouTube 聊天來源已中斷，請重新套用來源。"),
        );
        respond({ ok: true });
      }
    },
  );
  chrome.tabs.onRemoved.addListener((tabId) => {
    knownSourceTabs.delete(tabId);
    for (const connection of [...connections.values()])
      if (connection.targetTabId === tabId || connection.sourceTabId === tabId)
        stop(
          connection,
          connection.sourceTabId === tabId
            ? "YouTube 聊天來源分頁已關閉。"
            : undefined,
        );
  });
  chrome.tabs.onUpdated.addListener((tabId, change) => {
    for (const connection of [...connections.values()]) {
      const sourceChanged =
        connection.sourceTabId === tabId &&
        (change.status === "loading" ||
          (change.url !== undefined && change.url !== connection.sourceUrl));
      const targetChanged =
        connection.targetTabId === tabId &&
        (change.status === "loading" ||
          (change.url !== undefined && change.url !== connection.targetUrl));
      if (sourceChanged || targetChanged)
        stop(
          connection,
          sourceChanged ? "YouTube 聊天來源已重新載入或換片。" : undefined,
        );
    }
  });
}
