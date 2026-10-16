import { isRecord } from "../shared/type-guards.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";
import { readResponseBytes } from "./danmaku-utils.js";

const MAX_RESPONSE_BYTES = 8_000_000;
const MAX_DANMAKU_TIME_SECONDS = 24 * 60 * 60;

function isBahamutDanmakuRequest(
  value: unknown,
): value is Extract<ExtensionMessage, { type: "GET_BAHAMUT_DANMAKU" }> {
  return (
    isRecord(value) &&
    value.type === "GET_BAHAMUT_DANMAKU" &&
    typeof value.videoSn === "string" &&
    /^\d{1,12}$/.test(value.videoSn) &&
    Number(value.videoSn) > 0
  );
}

export function registerBahamutDanmakuListener(): void {
  runtimeMessageDispatcher.addListener(
    "GET_BAHAMUT_DANMAKU",
    (message, _sender, sendResponse) => {
      if (!isBahamutDanmakuRequest(message)) return;

      void (async () => {
        try {
          const url = new URL("https://api.gamer.com.tw/anime/v1/danmu.php");
          url.searchParams.set("videoSn", message.videoSn);
          url.searchParams.set("geo", "TW,HK");
          const response = await fetch(url);
          if (!response.ok)
            throw new Error(`Bahamut danmaku HTTP ${response.status}`);
          const contentLength = Number(response.headers.get("content-length"));
          if (
            Number.isFinite(contentLength) &&
            contentLength > MAX_RESPONSE_BYTES
          )
            throw new Error("Bahamut danmaku response is too large");
          const bytes = await readResponseBytes(
            response,
            MAX_RESPONSE_BYTES,
            "Bahamut danmaku",
          );
          const result: unknown = JSON.parse(new TextDecoder().decode(bytes));
          const data =
            isRecord(result) && isRecord(result.data) ? result.data : null;
          if (!data || !Array.isArray(data.danmu))
            throw new Error("Invalid Bahamut danmaku response");
          if (data.danmu.length > 100_000)
            throw new Error("Bahamut danmaku response has too many comments");

          const messages = data.danmu.flatMap((item): DanmakuData[] => {
            if (
              !isRecord(item) ||
              typeof item.text !== "string" ||
              !item.text.trim() ||
              item.text.length > 2000 ||
              typeof item.time !== "number" ||
              !Number.isFinite(item.time) ||
              item.time < 0 ||
              item.time > MAX_DANMAKU_TIME_SECONDS
            )
              return [];
            const position = Number(item.position);
            const color =
              typeof item.color === "string" &&
              /^#[\da-f]{6}$/i.test(item.color)
                ? item.color
                : "#FFFFFF";
            const sn = Number(item.sn);
            return [
              {
                text: item.text,
                parts: [{ type: "text", text: item.text }],
                replayTime: Math.round(item.time * 1000) / 1000,
                type:
                  position === 1 ? "top" : position === 2 ? "bottom" : "right",
                color,
                ...(Number.isSafeInteger(sn) && sn > 0
                  ? { messageId: String(sn) }
                  : {}),
              },
            ];
          });
          sendResponse({ ok: true, messages });
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Bahamut danmaku request failed",
          });
        }
      })();
      return true;
    },
  );
}
