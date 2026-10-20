import { isRecord } from "../shared/type-guards.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";

const MAX_SUBTITLE_BYTES = 1_000_000;
const MAX_SUBTITLE_CUES = 5_000;

function isBilibiliSubtitleRequest(
  value: unknown,
): value is Extract<ExtensionMessage, { type: "GET_BILIBILI_SUBTITLE_CUES" }> {
  return (
    isRecord(value) &&
    value.type === "GET_BILIBILI_SUBTITLE_CUES" &&
    typeof value.url === "string" &&
    value.url.length <= 8192
  );
}

async function readLimitedJson(res: Response): Promise<unknown> {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("Missing subtitle response body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SUBTITLE_BYTES) {
      await reader.cancel();
      throw new Error("Subtitle response is too large");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
}

function sanitizeSubtitleCues(value: unknown) {
  if (!Array.isArray(value)) return null;
  return value.slice(0, MAX_SUBTITLE_CUES).flatMap((cue) => {
    if (
      !isRecord(cue) ||
      typeof cue.from !== "number" ||
      !Number.isFinite(cue.from) ||
      cue.from < 0 ||
      typeof cue.to !== "number" ||
      !Number.isFinite(cue.to) ||
      cue.to <= cue.from ||
      typeof cue.content !== "string" ||
      cue.content.length > 2000
    )
      return [];
    return [{ from: cue.from, to: cue.to, content: cue.content }];
  });
}

export function registerBilibiliSubtitleListener() {
  runtimeMessageDispatcher.addListener(
    "GET_BILIBILI_SUBTITLE_CUES",
    (msg: unknown, sender, sendResponse) => {
      if (!isBilibiliSubtitleRequest(msg)) return false;

      const pageUrl = sender.tab?.url || sender.url || "";
      let page: URL;
      let subtitle: URL;
      try {
        page = new URL(pageUrl);
        subtitle = new URL(msg.url);
      } catch {
        sendResponse({ ok: false });
        return false;
      }
      if (
        page.protocol !== "https:" ||
        !(
          page.hostname === "bilibili.com" ||
          page.hostname.endsWith(".bilibili.com")
        ) ||
        subtitle.protocol !== "https:" ||
        subtitle.hostname !== "aisubtitle.hdslb.com"
      ) {
        sendResponse({ ok: false });
        return false;
      }

      void fetch(subtitle, { credentials: "omit" })
        .then(async (res) => {
          const contentLength = Number(res.headers.get("content-length"));
          if (
            !res.ok ||
            (Number.isFinite(contentLength) &&
              contentLength > MAX_SUBTITLE_BYTES)
          )
            throw new Error("Subtitle request failed");

          const data = await readLimitedJson(res);
          if (!isRecord(data)) throw new Error("Invalid subtitle data");
          const cues = sanitizeSubtitleCues(data.body);
          if (!cues) throw new Error("Invalid subtitle cues");
          sendResponse({ ok: true, cues });
        })
        .catch(() => sendResponse({ ok: false }));
      return true;
    },
  );
}
