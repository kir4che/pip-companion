import { isRecord } from "../shared/type-guards.js";

const connections = new Map<number, TwitchChatConnection>();
let nextConnectionId = 0;

function isChannel(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9_]{1,25}$/i.test(value);
}

class TwitchChatConnection {
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private reconnectDelay = 1000;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private receiveBuffer = "";
  private permanentlyFailed = false;

  constructor(
    private readonly tabId: number,
    readonly pageUrl: string,
    private readonly channel: string,
    private readonly connectionId: string,
  ) {}

  start(): void {
    this.stopped = false;
    this.permanentlyFailed = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = null;
    this.receiveBuffer = "";
    const socket = this.socket;
    this.socket = null;
    socket?.close();
  }

  private sendStatus(status: "connected" | "error", error?: string): void {
    void chrome.tabs
      .sendMessage(this.tabId, {
        type: "ADDITIONAL_TWITCH_CHAT_STATUS",
        channel: this.channel,
        connectionId: this.connectionId,
        status,
        ...(error ? { error } : {}),
      } satisfies ExtensionMessage)
      .catch(() => {});
  }

  private connect(): void {
    if (this.stopped || this.permanentlyFailed || this.socket) return;
    const socket = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.stopped || this.socket !== socket) return;
      this.reconnectDelay = 1000;
      socket.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      socket.send("PASS SCHMOOPII");
      socket.send(
        `NICK justinfan${Math.floor(Math.random() * 900000 + 100000)}`,
      );
      socket.send(`JOIN #${this.channel}`);
      this.sendStatus("connected");
      this.keepaliveTimer = setInterval(() => {
        if (this.socket !== socket || socket.readyState !== WebSocket.OPEN)
          return;
        socket.send("PING :pip-companion");
      }, 15000);
    });
    socket.addEventListener("message", (event) => {
      if (
        this.stopped ||
        this.socket !== socket ||
        typeof event.data !== "string"
      )
        return;
      this.receiveBuffer += event.data;
      const lines = this.receiveBuffer.split("\r\n");
      this.receiveBuffer = lines.pop() ?? "";
      for (const line of lines) this.handleLine(line);
    });
    socket.addEventListener("close", () => {
      if (this.stopped || this.socket !== socket) return;
      this.socket = null;
      if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
      if (!this.permanentlyFailed) {
        this.sendStatus("error", "Twitch 聊天連線已中斷，正在重新連線。");
        this.scheduleReconnect();
      }
    });
    socket.addEventListener("error", () => {
      if (this.stopped || this.socket !== socket) return;
      this.sendStatus("error", "無法連線至 Twitch 聊天。");
      socket.close();
    });
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) return;
    const delay = this.reconnectDelay;
    this.reconnectDelay = Math.min(30000, this.reconnectDelay * 2);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private handleLine(line: string): void {
    if (!line) return;
    if (line.startsWith("PING")) {
      this.socket?.send(line.replace(/^PING/, "PONG"));
      return;
    }
    if (line.startsWith("NOTICE")) {
      this.permanentlyFailed = true;
      this.sendStatus("error", "Twitch 拒絕了聊天連線。");
      this.socket?.close();
      return;
    }
    const match = line.match(
      /^(?:@([^ ]+) )?:([^! ]+)!.* PRIVMSG #[^ ]+ :(.*)$/,
    );
    if (!match) return;
    const tags = parseTags(match[1] || "");
    const text = match[3] || "";
    if (!text.trim() || text.length > 2000) return;
    const messageId =
      tags.id || `${this.channel}:${Date.now()}:${Math.random()}`;
    const author = tags["display-name"] || match[2] || "";
    const color =
      typeof tags.color === "string" && /^#[\da-f]{6}$/i.test(tags.color)
        ? tags.color
        : undefined;
    void chrome.tabs
      .sendMessage(this.tabId, {
        type: "ADDITIONAL_TWITCH_CHAT_MESSAGE",
        channel: this.channel,
        connectionId: this.connectionId,
        data: {
          text,
          parts: createMessageParts(text, tags.emotes),
          author,
          messageId,
          ...(color ? { color } : {}),
        },
      } satisfies ExtensionMessage)
      .catch(() => {});
  }
}

function parseTags(value: string): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const item of value.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    tags[item.slice(0, separator)] = decodeTagValue(item.slice(separator + 1));
  }
  return tags;
}

function decodeTagValue(value: string): string {
  return value.replace(/\\([snr:\\])/g, (_match, character: string) => {
    switch (character) {
      case "s":
        return " ";
      case ":":
        return ";";
      case "r":
        return "\r";
      case "n":
        return "\n";
      case "\\":
        return "\\";
      default:
        return character;
    }
  });
}

function createMessageParts(
  text: string,
  emoteTag: string | undefined,
): DanmakuPart[] {
  if (!emoteTag) return [{ type: "text", text }];
  const ranges: Array<{ start: number; end: number; id: string }> = [];
  for (const entry of emoteTag.split("/")) {
    const [id, positions] = entry.split(":");
    if (!id || !positions) continue;
    for (const position of positions.split(",")) {
      const [startText, endText] = position.split("-");
      const start = Number(startText);
      const end = Number(endText);
      if (
        !/^\d+$/.test(id) ||
        !Number.isInteger(start) ||
        !Number.isInteger(end) ||
        start < 0 ||
        end < start ||
        end >= text.length
      )
        continue;
      ranges.push({ start, end: end + 1, id });
    }
  }
  ranges.sort((a, b) => a.start - b.start || a.end - b.end);
  const parts: DanmakuPart[] = [];
  let cursor = 0;
  for (const range of ranges.slice(0, 50)) {
    if (range.start < cursor) continue;
    if (range.start > cursor)
      parts.push({ type: "text", text: text.slice(cursor, range.start) });
    const emoteText = text.slice(range.start, range.end);
    parts.push({
      type: "image",
      src: `https://static-cdn.jtvnw.net/emoticons/v2/${range.id}/default/dark/2.0`,
      alt: emoteText,
    });
    cursor = range.end;
  }
  if (cursor < text.length)
    parts.push({ type: "text", text: text.slice(cursor) });
  return parts.length ? parts : [{ type: "text", text }];
}

export function registerTwitchChatListener(): void {
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (!isRecord(message)) return false;
    const tabId = sender.tab?.id;
    const pageUrl = sender.url;
    if (
      tabId === undefined ||
      typeof pageUrl !== "string" ||
      !/^https?:\/\//i.test(pageUrl)
    )
      return false;

    const connection = connections.get(tabId);
    if (message.type === "STOP_ADDITIONAL_TWITCH_CHAT") {
      if (connection?.pageUrl !== pageUrl) return false;
      connection.stop();
      connections.delete(tabId);
      return false;
    }
    if (
      message.type !== "START_ADDITIONAL_TWITCH_CHAT" ||
      !isChannel(message.channel)
    )
      return false;

    connection?.stop();
    const nextConnection = new TwitchChatConnection(
      tabId,
      pageUrl,
      message.channel,
      `${Date.now().toString(36)}-${(++nextConnectionId).toString(36)}`,
    );
    connections.set(tabId, nextConnection);
    nextConnection.start();
    return false;
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    connections.get(tabId)?.stop();
    connections.delete(tabId);
  });
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== "loading") return;
    connections.get(tabId)?.stop();
    connections.delete(tabId);
  });
}
