const BILIBILI_SEGMENT_SECONDS = 120;
const BILIBILI_MAX_SEGMENTS = 180;
const BILIBILI_MAX_SEGMENT_BYTES = 8_000_000;
const BILIBILI_MAX_TOTAL_BYTES = 32_000_000;
const BILIBILI_LEGACY_CACHE_TTL_MS = 5 * 60 * 1000;
const BILIBILI_RETRY_DELAYS_MS = [300, 900];
let cachedLegacyDanmaku: {
  cid: string;
  expiresAt: number;
  promise: ReturnType<typeof fetchLegacyBilibiliDanmaku>;
} | null = null;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(
  input: RequestInfo | URL,
  init: RequestInit,
  label: string,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= BILIBILI_RETRY_DELAYS_MS.length; attempt++) {
    try {
      const response = await fetch(input, init);
      if (
        response.ok ||
        ![408, 425, 429, 500, 502, 503, 504].includes(response.status) ||
        attempt === BILIBILI_RETRY_DELAYS_MS.length
      )
        return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === BILIBILI_RETRY_DELAYS_MS.length) throw error;
    }
    await wait(BILIBILI_RETRY_DELAYS_MS[attempt]);
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}
const WBI_MIXIN_KEY_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

let cachedWbiMixinKey = "";
let cachedWbiKeyExpiresAt = 0;

function md5(input: string): string {
  const inputBytes = new TextEncoder().encode(input);
  const paddedLength = Math.ceil((inputBytes.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(inputBytes);
  padded[inputBytes.length] = 0x80;
  new DataView(padded.buffer).setBigUint64(
    paddedLength - 8,
    BigInt(inputBytes.length) * 8n,
    true,
  );

  const shifts = [
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5,
    9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11,
    16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10,
    15, 21,
  ];
  const constants = Array.from(
    { length: 64 },
    (_, index) => Math.floor(Math.abs(Math.sin(index + 1)) * 2 ** 32) >>> 0,
  );
  const words = new Uint32Array(16);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < padded.length; offset += 64) {
    const view = new DataView(padded.buffer, offset, 64);
    for (let index = 0; index < 16; index++)
      words[index] = view.getUint32(index * 4, true);

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let index = 0; index < 64; index++) {
      let f: number;
      let wordIndex: number;
      if (index < 16) {
        f = (b & c) | (~b & d);
        wordIndex = index;
      } else if (index < 32) {
        f = (d & b) | (~d & c);
        wordIndex = (5 * index + 1) % 16;
      } else if (index < 48) {
        f = b ^ c ^ d;
        wordIndex = (3 * index + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        wordIndex = (7 * index) % 16;
      }

      const sum = (a + f + constants[index] + words[wordIndex]) >>> 0;
      const shift = shifts[index];
      const rotated = (sum << shift) | (sum >>> (32 - shift));
      const previousD = d;
      d = c;
      c = b;
      b = (b + rotated) >>> 0;
      a = previousD;
    }
    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return [a0, b0, c0, d0]
    .flatMap((word) => [0, 8, 16, 24].map((shift) => (word >>> shift) & 0xff))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readResponseBytes(
  response: Response,
  maxBytes: number,
  label: string,
): Promise<Uint8Array> {
  if (!response.body) {
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > maxBytes)
      throw new Error(`${label} response is too large`);
    return new Uint8Array(buffer);
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} response is too large`);
      }
      chunks.push(result.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function getWbiMixinKey(): Promise<string> {
  if (cachedWbiMixinKey && Date.now() < cachedWbiKeyExpiresAt)
    return cachedWbiMixinKey;

  const response = await fetchWithRetry(
    "https://api.bilibili.com/x/web-interface/nav",
    { credentials: "include" },
    "WBI key",
  );
  if (!response.ok) throw new Error(`WBI key HTTP ${response.status}`);
  const result = await response.json();
  const images = result?.data?.wbi_img;
  const imageKey = String(images?.img_url || "")
    .split("/")
    .pop()
    ?.split(".")[0];
  const subKey = String(images?.sub_url || "")
    .split("/")
    .pop()
    ?.split(".")[0];
  const source = `${imageKey || ""}${subKey || ""}`;
  if (result?.code !== 0 || source.length < 64)
    throw new Error("Bilibili WBI keys are unavailable");

  cachedWbiMixinKey = WBI_MIXIN_KEY_TABLE.map((index) => source[index])
    .join("")
    .slice(0, 32);
  cachedWbiKeyExpiresAt = Date.now() + 60 * 60 * 1000;
  return cachedWbiMixinKey;
}

function createWbiUrl(
  mixinKey: string,
  parameters: Record<string, string | number>,
): URL {
  const signedParameters: Record<string, string | number> = {
    ...parameters,
    wts: Math.floor(Date.now() / 1000),
  };
  const canonicalQuery = Object.keys(signedParameters)
    .sort()
    .map((key) => {
      const value = encodeURIComponent(String(signedParameters[key])).replace(
        /[!'()*]/g,
        "",
      );
      return `${key}=${value}`;
    })
    .join("&");
  const url = new URL("https://api.bilibili.com/x/v2/dm/wbi/web/seg.so");
  for (const [key, value] of Object.entries(signedParameters))
    url.searchParams.set(key, String(value));
  url.searchParams.set("w_rid", md5(canonicalQuery + mixinKey));
  return url;
}

function readProtoVarint(
  bytes: Uint8Array,
  offset: number,
  limit = bytes.length,
) {
  let value = 0n;
  let shift = 0n;
  while (offset < limit && shift <= 63n) {
    const byte = bytes[offset++];
    if (shift === 63n && byte > 1)
      throw new Error("Invalid Bilibili danmaku protobuf");
    value |= BigInt(byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return { value, offset };
    shift += 7n;
  }
  throw new Error("Invalid Bilibili danmaku protobuf");
}

function skipProtoField(
  bytes: Uint8Array,
  wireType: number,
  offset: number,
  limit = bytes.length,
): number {
  if (wireType === 0) return readProtoVarint(bytes, offset, limit).offset;
  if (wireType === 1 || wireType === 5) {
    const end = offset + (wireType === 1 ? 8 : 4);
    if (end > limit) throw new Error("Truncated danmaku protobuf");
    return end;
  }
  if (wireType === 2) {
    const length = readProtoVarint(bytes, offset, limit);
    const size = Number(length.value);
    const end = length.offset + size;
    if (!Number.isSafeInteger(size) || end > limit)
      throw new Error("Truncated danmaku protobuf");
    return end;
  }
  throw new Error("Unsupported Bilibili danmaku protobuf field");
}

function decodeBilibiliXmlText(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi,
    (entity, name: string) => {
      const lowerName = name.toLowerCase();
      if (lowerName === "amp") return "&";
      if (lowerName === "lt") return "<";
      if (lowerName === "gt") return ">";
      if (lowerName === "quot") return '"';
      if (lowerName === "apos") return "'";
      const codePoint = lowerName.startsWith("#x")
        ? Number.parseInt(lowerName.slice(2), 16)
        : Number.parseInt(lowerName.slice(1), 10);
      if (
        !Number.isInteger(codePoint) ||
        codePoint < 0 ||
        codePoint > 0x10ffff ||
        (codePoint >= 0xd800 && codePoint <= 0xdfff)
      )
        return entity;
      return String.fromCodePoint(codePoint);
    },
  );
}

function parseBilibiliDanmakuXml(xml: string) {
  const comments: {
    id?: string;
    replayTime: number;
    type: "right" | "top" | "bottom";
    color: string;
    text: string;
  }[] = [];
  const decoder = new RegExp(
    "<d\\b[^>]*\\bp=(?:\"([^\"]*)\"|'([^']*)')[^>]*>([\\s\\S]*?)<\\/d>",
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = decoder.exec(xml))) {
    const attributes = (match[1] ?? match[2]).split(",");
    const replayTime = Number(attributes[0]);
    const mode = Number(attributes[1]);
    const color = Number(attributes[3]);
    const id = attributes[7]?.trim();
    const text = decodeBilibiliXmlText(match[3]).trim();
    if (
      !Number.isFinite(replayTime) ||
      replayTime < 0 ||
      ![1, 2, 3, 4, 5].includes(mode) ||
      !Number.isInteger(color) ||
      color < 0 ||
      color > 0xffffff ||
      !text
    )
      continue;
    comments.push({
      ...(id && id !== "0" ? { id } : {}),
      replayTime,
      type: mode === 4 ? "bottom" : mode === 5 ? "top" : "right",
      color: `#${color.toString(16).padStart(6, "0")}`,
      text,
    });
  }
  return comments;
}

async function fetchLegacyBilibiliDanmaku(cid: string | number) {
  const legacyUrl = new URL("https://api.bilibili.com/x/v1/dm/list.so");
  legacyUrl.searchParams.set("oid", String(cid));
  const response = await fetchWithRetry(
    legacyUrl,
    {
      credentials: "include",
      cache: "no-store",
    },
    "Legacy danmaku",
  );
  if (!response.ok) throw new Error(`Legacy danmaku HTTP ${response.status}`);
  const bytes = await readResponseBytes(
    response,
    BILIBILI_MAX_SEGMENT_BYTES,
    "Legacy danmaku",
  );
  return {
    bytes: bytes.byteLength,
    comments: parseBilibiliDanmakuXml(new TextDecoder().decode(bytes)),
  };
}

function getCachedLegacyBilibiliDanmaku(cid: string | number) {
  const key = String(cid);
  if (
    cachedLegacyDanmaku?.cid === key &&
    cachedLegacyDanmaku.expiresAt > Date.now()
  )
    return cachedLegacyDanmaku.promise;

  const promise = fetchLegacyBilibiliDanmaku(key);
  const entry = {
    cid: key,
    expiresAt: Date.now() + BILIBILI_LEGACY_CACHE_TTL_MS,
    promise,
  };
  cachedLegacyDanmaku = entry;
  void promise.catch(() => {
    if (cachedLegacyDanmaku === entry) cachedLegacyDanmaku = null;
  });
  return promise;
}

function parseBilibiliSegment(bytes: Uint8Array) {
  const comments: {
    id?: string;
    replayTime: number;
    type: "right" | "top" | "bottom";
    color: string;
    text: string;
  }[] = [];
  let offset = 0;
  const decoder = new TextDecoder();

  while (offset < bytes.length) {
    const key = readProtoVarint(bytes, offset, bytes.length);
    offset = key.offset;
    const tag = Number(key.value >> 3n);
    const wireType = Number(key.value & 7n);
    if (tag === 0) throw new Error("Invalid Bilibili danmaku protobuf tag");
    if (tag !== 1 || wireType !== 2) {
      offset = skipProtoField(bytes, wireType, offset, bytes.length);
      continue;
    }

    const size = readProtoVarint(bytes, offset, bytes.length);
    offset = size.offset;
    const elementSize = Number(size.value);
    const end = offset + elementSize;
    if (!Number.isSafeInteger(elementSize) || end > bytes.length)
      throw new Error("Truncated danmaku element");
    let id = "";
    let progress: number | null = null;
    let mode = 0;
    let color = 0xffffff;
    let text = "";

    while (offset < end) {
      const fieldKey = readProtoVarint(bytes, offset, end);
      offset = fieldKey.offset;
      const fieldTag = Number(fieldKey.value >> 3n);
      const fieldWireType = Number(fieldKey.value & 7n);
      if (fieldTag === 0) throw new Error("Invalid danmaku field tag");
      if (fieldWireType === 0) {
        const fieldValue = readProtoVarint(bytes, offset, end);
        offset = fieldValue.offset;
        if (fieldTag === 1) id = fieldValue.value.toString();
        else if (fieldTag === 2) progress = Number(fieldValue.value);
        else if (fieldTag === 3) mode = Number(fieldValue.value);
        else if (fieldTag === 5) color = Number(fieldValue.value);
      } else if (fieldWireType === 2) {
        const fieldSize = readProtoVarint(bytes, offset, end);
        offset = fieldSize.offset;
        const fieldLength = Number(fieldSize.value);
        const fieldEnd = offset + fieldLength;
        if (!Number.isSafeInteger(fieldLength) || fieldEnd > end)
          throw new Error("Truncated danmaku field");
        if (fieldTag === 7)
          text = decoder.decode(bytes.subarray(offset, fieldEnd));
        offset = fieldEnd;
      } else offset = skipProtoField(bytes, fieldWireType, offset, end);
    }

    if (
      progress !== null &&
      Number.isSafeInteger(progress) &&
      progress >= 0 &&
      [1, 2, 3, 4, 5].includes(mode) &&
      Number.isInteger(color) &&
      color >= 0 &&
      color <= 0xffffff &&
      text.trim()
    ) {
      comments.push({
        id,
        replayTime: progress / 1000,
        type: mode === 4 ? "bottom" : mode === 5 ? "top" : "right",
        color: `#${color.toString(16).padStart(6, "0")}`,
        text: text.trim(),
      });
    }
    offset = end;
  }
  return comments;
}

export function registerBilibiliDanmakuListener() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.type === "GET_BILIBILI_DANMAKU") {
      const senderUrl = sender.url || sender.tab?.url || "";
      const bvid = String(message.bvid || "");
      const avid = String(message.avid || "");
      const page = Number(message.page);
      const requestedStartSegment = Number(message.startSegment);
      const requestedEndSegment = Number(message.endSegment);
      const rangeRequested =
        message.startSegment !== undefined || message.endSegment !== undefined;
      const requestedRangeStart =
        message.startSegment === undefined ? 1 : requestedStartSegment;
      const requestedRangeEnd =
        message.endSegment === undefined
          ? requestedRangeStart
          : requestedEndSegment;
      if (
        !/^https:\/\/(www\.)?bilibili\.com\//.test(senderUrl) ||
        (!/^BV[\w]{10}$/i.test(bvid) && !/^\d+$/.test(avid)) ||
        (Boolean(bvid) && Boolean(avid)) ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 1000 ||
        (message.startSegment !== undefined &&
          (!Number.isInteger(requestedStartSegment) ||
            requestedStartSegment < 1)) ||
        (message.endSegment !== undefined &&
          (!Number.isInteger(requestedEndSegment) ||
            requestedEndSegment < 1)) ||
        (rangeRequested &&
          (requestedRangeEnd < requestedRangeStart ||
            requestedRangeEnd - requestedRangeStart > 5))
      ) {
        sendResponse({ ok: false, error: "Invalid Bilibili video request" });
        return;
      }

      void (async () => {
        try {
          const videoUrl = new URL(
            "https://api.bilibili.com/x/web-interface/view",
          );
          videoUrl.searchParams.set(bvid ? "bvid" : "aid", bvid || avid);
          const videoResponse = await fetchWithRetry(
            videoUrl,
            { credentials: "include" },
            "Video info",
          );
          if (!videoResponse.ok)
            throw new Error(`Video info HTTP ${videoResponse.status}`);
          const videoInfo = await videoResponse.json();
          const part = videoInfo?.data?.pages?.[page - 1];
          const cid = part?.cid;
          const aid = videoInfo?.data?.aid;
          const duration = Number(part?.duration);
          if (
            videoInfo?.code !== 0 ||
            !/^\d+$/.test(String(cid ?? "")) ||
            !/^\d+$/.test(String(aid ?? "")) ||
            !Number.isFinite(duration) ||
            duration <= 0
          )
            throw new Error("Bilibili video part was not found");

          const segmentCount = Math.ceil(duration / BILIBILI_SEGMENT_SECONDS);
          const segmentStart = rangeRequested
            ? Math.max(1, requestedStartSegment || 1)
            : 1;
          const segmentEnd = rangeRequested
            ? Math.min(
                segmentCount,
                requestedEndSegment || requestedStartSegment || 1,
              )
            : segmentCount;
          if (
            segmentStart > segmentCount ||
            segmentStart > segmentEnd ||
            (rangeRequested && segmentEnd - segmentStart > 5)
          )
            throw new Error("Bilibili danmaku segment range is out of bounds");
          if (segmentCount > BILIBILI_MAX_SEGMENTS) {
            const legacy = await getCachedLegacyBilibiliDanmaku(cid);
            legacy.comments.sort((a, b) => a.replayTime - b.replayTime);
            sendResponse({
              ok: true,
              messages: legacy.comments,
              recoveredSegments: [],
              unavailableSegments: [],
              legacyFallback: true,
              duration,
              segmentCount,
              segmentStart: 1,
              segmentEnd: segmentCount,
            });
            return;
          }

          const mixinKey = await getWbiMixinKey();
          const comments = [];
          const seenCommentIds = new Set();
          const unavailableSegments: { segment: number; status: number }[] = [];
          const recoveredSegments: {
            segment: number;
            status: number;
            comments: number;
          }[] = [];
          let fallbackError = "";
          let totalBytes = 0;
          for (
            let segmentIndex = segmentStart;
            segmentIndex <= segmentEnd;
            segmentIndex++
          ) {
            const start = (segmentIndex - 1) * BILIBILI_SEGMENT_SECONDS * 1000;
            const end = segmentIndex * BILIBILI_SEGMENT_SECONDS * 1000;
            const danmakuUrl = createWbiUrl(mixinKey, {
              type: 1,
              oid: Number(cid),
              pid: Number(aid),
              segment_index: segmentIndex,
              pull_mode: 1,
              ps: start,
              pe: end,
              web_location: 1315873,
              "x-bili-device-req-json":
                '{"platform":"web","device":"pc","mobi_app":"web_cn"}',
              "x-bili-locale-json":
                '{"c_locale":{"language":"zh","script":"Hans"},"always_translate":false}',
            });
            let danmakuResponse = await fetchWithRetry(
              danmakuUrl,
              {
                credentials: "include",
                cache: "no-store",
              },
              `Danmaku segment ${segmentIndex}/${segmentCount}`,
            );
            if (danmakuResponse.status === 304)
              danmakuResponse = await fetchWithRetry(
                danmakuUrl,
                {
                  credentials: "include",
                  cache: "reload",
                },
                `Danmaku segment ${segmentIndex}/${segmentCount}`,
              );
            if (!danmakuResponse.ok) {
              if ([304, 404].includes(danmakuResponse.status)) {
                unavailableSegments.push({
                  segment: segmentIndex,
                  status: danmakuResponse.status,
                });
                continue;
              }
              throw new Error(
                `Danmaku segment ${segmentIndex}/${segmentCount} HTTP ${danmakuResponse.status}`,
              );
            }
            const bytes = await readResponseBytes(
              danmakuResponse,
              BILIBILI_MAX_SEGMENT_BYTES,
              `Danmaku segment ${segmentIndex}/${segmentCount}`,
            );
            totalBytes += bytes.byteLength;
            if (totalBytes > BILIBILI_MAX_TOTAL_BYTES)
              throw new Error("Bilibili danmaku responses are too large");
            if (bytes[0] === 0x7b) {
              const result = JSON.parse(new TextDecoder().decode(bytes));
              throw new Error(
                `Bilibili danmaku API error: ${result?.message || result?.code || "invalid response"}`,
              );
            }
            for (const comment of parseBilibiliSegment(bytes)) {
              if (comment.id && comment.id !== "0") {
                if (seenCommentIds.has(comment.id)) continue;
                seenCommentIds.add(comment.id);
              }
              comments.push(comment);
            }
          }
          if (unavailableSegments.length) {
            try {
              const legacy = await getCachedLegacyBilibiliDanmaku(cid);
              totalBytes += legacy.bytes;
              if (totalBytes > BILIBILI_MAX_TOTAL_BYTES)
                throw new Error("Bilibili danmaku responses are too large");
              const legacyComments = legacy.comments;
              const knownCommentIds = new Set(
                comments
                  .map((comment) => comment.id)
                  .filter((id) => id && id !== "0"),
              );
              const remainingSegments = [];
              for (const unavailable of unavailableSegments) {
                const start =
                  (unavailable.segment - 1) * BILIBILI_SEGMENT_SECONDS;
                const end = Math.min(
                  unavailable.segment * BILIBILI_SEGMENT_SECONDS,
                  duration,
                );
                let recoveredCount = 0;
                for (const comment of legacyComments) {
                  if (comment.replayTime < start || comment.replayTime >= end)
                    continue;
                  if (comment.id && knownCommentIds.has(comment.id)) continue;
                  if (comment.id && comment.id !== "0")
                    knownCommentIds.add(comment.id);
                  comments.push(comment);
                  recoveredCount++;
                }
                if (recoveredCount) {
                  recoveredSegments.push({
                    ...unavailable,
                    comments: recoveredCount,
                  });
                } else remainingSegments.push(unavailable);
              }
              unavailableSegments.splice(
                0,
                unavailableSegments.length,
                ...remainingSegments,
              );
            } catch (error) {
              fallbackError =
                error instanceof Error
                  ? error.message
                  : "Legacy danmaku fallback failed";
            }
          }
          comments.sort((a, b) => a.replayTime - b.replayTime);
          sendResponse({
            ok: true,
            messages: comments,
            duration,
            segmentCount,
            segmentStart,
            segmentEnd,
            recoveredSegments,
            unavailableSegments,
            fallbackError,
          });
        } catch (error) {
          sendResponse({
            ok: false,
            error:
              error instanceof Error
                ? error.message
                : "Bilibili request failed",
          });
        }
      })();
      return true;
    }
  });
}
