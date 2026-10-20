import "../shared/bilibili-danmaku-config.js";
import { parseBilibiliAdvancedDanmaku } from "../shared/bilibili-advanced-danmaku.js";
import { isRecord } from "../shared/type-guards.js";
import { runtimeMessageDispatcher } from "./message-dispatcher.js";
import { readResponseBytes } from "./danmaku-utils.js";

const BILIBILI_SEGMENT_SECONDS =
  globalThis.PipCompanion.bilibiliDanmakuConfig.segmentSeconds;
const BILIBILI_MAX_SEGMENTS = 180;
const BILIBILI_MAX_SEGMENT_BYTES = 8_000_000;
const BILIBILI_MAX_TOTAL_BYTES = 32_000_000;
const BILIBILI_LEGACY_CACHE_TTL_MS = 5 * 60 * 1000;
const BILIBILI_RETRY_DELAYS_MS = [300, 900];
const BILIBILI_FETCH_TIMEOUT_MS = 5000;
const BV_TABLE = "fZodR9XQDSUm21yCkr6zBqiveYah8bt4xsWpHnJE7jL5VG3guMTKNPAwcF";
const BV_TR: Record<string, bigint> = {};
for (let i = 0; i < 58; i++) BV_TR[BV_TABLE[i]!] = BigInt(i);
const BV_S = [11, 10, 3, 8, 4, 6];
const BV_XOR = 177451812n;
const BV_ADD = 8728348608n;

function bv2av(bv: string): string {
  try {
    let r = 0n;
    for (let i = 0; i < 6; i++) {
      const char = bv[BV_S[i]!] || "";
      const val = BV_TR[char];
      if (val === undefined) return "";
      r += val * 58n ** BigInt(i);
    }
    return String((r - BV_ADD) ^ BV_XOR);
  } catch {
    return "";
  }
}

const WBI_MIXIN_KEY_TABLE = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
  33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40, 61,
  26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36,
  20, 34, 44, 52,
];

function isBilibiliDanmakuRequest(
  value: unknown,
): value is Extract<ExtensionMessage, { type: "GET_BILIBILI_DANMAKU" }> {
  if (
    !isRecord(value) ||
    value.type !== "GET_BILIBILI_DANMAKU" ||
    !Number.isSafeInteger(value.page) ||
    (value.startSegment !== undefined &&
      !Number.isSafeInteger(value.startSegment)) ||
    (value.endSegment !== undefined && !Number.isSafeInteger(value.endSegment))
  )
    return false;
  const count =
    (typeof value.bvid === "string" ? 1 : 0) +
    (typeof value.avid === "string" ? 1 : 0) +
    (typeof value.epId === "string" ? 1 : 0);
  return count === 1;
}

let cachedLegacyDanmaku: {
  cid: string;
  expiresAt: number;
  promise: ReturnType<typeof fetchLegacyBilibiliDanmaku>;
} | null = null;
let cachedWbiMixinKey = "";
let cachedWbiKeyExpiresAt = 0;

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
      const response = await fetch(input, {
        ...init,
        signal: init.signal ?? AbortSignal.timeout(BILIBILI_FETCH_TIMEOUT_MS),
        referrer: "https://www.bilibili.com/",
        referrerPolicy: "strict-origin-when-cross-origin",
      });
      if (
        response.ok ||
        ![408, 425, 429, 500, 502, 503, 504].includes(response.status) ||
        attempt === BILIBILI_RETRY_DELAYS_MS.length
      )
        return response;
      lastError = new Error(`${label} HTTP ${response.status}`);
    } catch (err) {
      lastError = err;
      if (attempt === BILIBILI_RETRY_DELAYS_MS.length) throw err;
    }

    const retryDelay = BILIBILI_RETRY_DELAYS_MS[attempt];
    if (retryDelay !== undefined) await wait(retryDelay);
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed`);
}

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
    (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0,
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

      const constant = constants[index]!;
      const word = words[wordIndex]!;
      const shift = shifts[index]!;
      const sum = (a + f + constant + word) >>> 0;
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

async function getWbiMixinKey(): Promise<string> {
  if (cachedWbiMixinKey && Date.now() < cachedWbiKeyExpiresAt)
    return cachedWbiMixinKey;

  const response = await fetchWithRetry(
    "https://api.bilibili.com/x/web-interface/nav",
    { credentials: "include" },
    "WBI key",
  );
  if (!response.ok) throw new Error(`WBI key HTTP ${response.status}`);
  const result: unknown = await response.json();
  const data = isRecord(result) && isRecord(result.data) ? result.data : null;
  const images = data && isRecord(data.wbi_img) ? data.wbi_img : null;
  const imageUrl = typeof images?.img_url === "string" ? images.img_url : "";
  const subUrl = typeof images?.sub_url === "string" ? images.sub_url : "";
  const imageKey = imageUrl.split("/").pop()?.split(".")[0] || "";
  const subKey = subUrl.split("/").pop()?.split(".")[0] || "";
  const source = `${imageKey}${subKey}`;

  if (!isRecord(result) || source.length < 64)
    throw new Error("Bilibili WBI keys are unavailable");

  cachedWbiMixinKey = WBI_MIXIN_KEY_TABLE.map((i) => source[i])
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

function parseBilibiliInitialState(html: string): unknown {
  const assignment = /(?:window\.)?__INITIAL_STATE__\s*=\s*/.exec(html);
  if (!assignment || assignment.index === undefined)
    throw new Error("Bilibili video page metadata was not found");

  let jsonStart = assignment.index + assignment[0].length;
  while (/\s/.test(html[jsonStart] || "")) jsonStart++;
  if (html[jsonStart] !== "{")
    throw new Error("Bilibili video page metadata is not JSON");

  let jsonEnd = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = jsonStart; index < html.length; index++) {
    const character = html[index];
    if (character === undefined) break;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth++;
    } else if (character === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = index + 1;
        break;
      }
    }
  }
  if (jsonEnd < 0 || inString || depth !== 0)
    throw new Error("Bilibili video page metadata is incomplete");
  try {
    return JSON.parse(html.slice(jsonStart, jsonEnd));
  } catch {
    throw new Error("Bilibili video page metadata is invalid");
  }
}

async function fetchBilibiliPagelistMetadata(
  videoId: string,
  page: number,
): Promise<{ cid: string; aid: string; duration: number } | null> {
  try {
    const isBvid = /^BV[\w]{10}$/i.test(videoId);
    const param = isBvid
      ? `bvid=${encodeURIComponent(videoId)}`
      : `aid=${encodeURIComponent(videoId)}`;
    const url = new URL(`https://api.bilibili.com/x/player/pagelist?${param}`);
    const response = await fetchWithRetry(
      url,
      { credentials: "include" },
      "Pagelist metadata",
    );
    if (!response.ok) return null;
    const json: unknown = await response.json();
    if (!isRecord(json) || json.code !== 0 || !Array.isArray(json.data))
      return null;
    const part = json.data[page - 1];
    if (!isRecord(part)) return null;
    const cid = String(part.cid ?? "");
    const duration = Number(part.duration);
    if (!/^\d+$/.test(cid) || !Number.isFinite(duration) || duration <= 0)
      return null;
    const aid = isBvid ? bv2av(videoId) : videoId;
    return { cid, aid: aid || cid, duration };
  } catch {
    return null;
  }
}

async function fetchBilibiliPageMetadata(
  videoId: string,
  page: number,
): Promise<{ cid: string; aid: string; duration: number }> {
  const videoPath = /^BV[\w]{10}$/i.test(videoId) ? videoId : `av${videoId}`;
  const pageUrl = new URL(`https://www.bilibili.com/video/${videoPath}/`);
  pageUrl.searchParams.set("p", String(page));
  const response = await fetchWithRetry(
    pageUrl,
    { credentials: "include", cache: "no-store" },
    "Video page metadata",
  );
  if (!response.ok)
    throw new Error(`Video page metadata HTTP ${response.status}`);
  const html = new TextDecoder().decode(
    await readResponseBytes(
      response,
      BILIBILI_MAX_SEGMENT_BYTES,
      "Bilibili video page",
    ),
  );

  const state = parseBilibiliInitialState(html);
  const videoData =
    isRecord(state) && isRecord(state.videoData) ? state.videoData : null;
  const pages = Array.isArray(videoData?.pages) ? videoData.pages : [];
  const part = pages[page - 1];
  const cid = String(isRecord(part) ? (part.cid ?? "") : "");
  const aid = String(videoData?.aid ?? "");
  const duration = Number(isRecord(part) ? part.duration : undefined);
  if (
    !/^\d+$/.test(cid) ||
    !/^\d+$/.test(aid) ||
    !Number.isFinite(duration) ||
    duration <= 0
  )
    throw new Error("Bilibili video page metadata was not found");
  return { cid, aid, duration };
}

const cachedBangumiEpisodes = new Map<
  string,
  { aid: string; cid: string; duration: number }
>();

async function fetchBilibiliBangumiMetadata(
  epId: string,
): Promise<{ cid: string; aid: string; duration: number }> {
  const cached = cachedBangumiEpisodes.get(epId);
  if (cached) return cached;

  const url = new URL("https://api.bilibili.com/pgc/view/web/season");
  url.searchParams.set("ep_id", epId);
  const response = await fetchWithRetry(
    url,
    { credentials: "include" },
    "Bangumi episode metadata",
  );
  if (!response.ok)
    throw new Error(`Bangumi episode metadata HTTP ${response.status}`);

  const json: unknown = await response.json();
  if (!isRecord(json) || json.code !== 0 || !isRecord(json.result))
    throw new Error("Bilibili bangumi metadata was not found");

  const result = json.result;
  const episodeLists: unknown[] = [];
  if (Array.isArray(result.episodes)) episodeLists.push(...result.episodes);
  if (Array.isArray(result.section)) {
    for (const sec of result.section) {
      if (isRecord(sec) && Array.isArray(sec.episodes)) {
        episodeLists.push(...sec.episodes);
      }
    }
  }

  for (const item of episodeLists) {
    if (!isRecord(item)) continue;
    const itemId = String(item.id ?? item.ep_id ?? "");
    const cid = String(item.cid ?? "");
    const aid = String(item.aid ?? "");
    const rawDuration = Number(item.duration);
    const duration =
      rawDuration > 10_000 ? Math.round(rawDuration / 1000) : rawDuration;
    if (
      /^\d+$/.test(cid) &&
      /^\d+$/.test(aid) &&
      Number.isFinite(duration) &&
      duration > 0
    ) {
      cachedBangumiEpisodes.set(itemId, { cid, aid, duration });
    }
  }

  const match = cachedBangumiEpisodes.get(epId);
  if (!match) throw new Error(`Bangumi episode ${epId} was not found`);
  return match;
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
    if (byte === undefined)
      throw new Error("Truncated Bilibili danmaku protobuf");
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
    advanced?: BilibiliAdvancedDanmaku;
  }[] = [];
  const decoder = new RegExp(
    "<d\\b[^>]*\\bp=(?:\"([^\"]*)\"|'([^']*)')[^>]*>([\\s\\S]*?)<\\/d>",
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = decoder.exec(xml))) {
    const rawAttributes = match[1] ?? match[2];
    const rawText = match[3];
    if (rawAttributes === undefined || rawText === undefined) continue;
    const attributes = rawAttributes.split(",");
    const replayTime = Number(attributes[0]);
    const mode = Number(attributes[1]);
    const color = Number(attributes[3]);
    const id = attributes[7]?.trim();
    const text = decodeBilibiliXmlText(rawText).trim();
    const advanced =
      mode === 7 ? parseBilibiliAdvancedDanmaku(text) : undefined;
    const displayText = advanced?.text || text;

    if (
      !Number.isFinite(replayTime) ||
      replayTime < 0 ||
      (![1, 2, 3, 4, 5].includes(mode) && !advanced) ||
      !Number.isInteger(color) ||
      color < 0 ||
      color > 0xffffff ||
      !displayText
    )
      continue;
    comments.push({
      ...(id && id !== "0" ? { id } : {}),
      replayTime,
      type: mode === 4 ? "bottom" : mode === 5 ? "top" : "right",
      color: `#${color.toString(16).padStart(6, "0")}`,
      text: displayText,
      ...(advanced ? { advanced } : {}),
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
    advanced?: BilibiliAdvancedDanmaku;
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

    const advanced =
      mode === 7 ? parseBilibiliAdvancedDanmaku(text.trim()) : undefined;
    const displayText = advanced?.text || text.trim();
    if (
      progress !== null &&
      Number.isSafeInteger(progress) &&
      progress >= 0 &&
      ([1, 2, 3, 4, 5].includes(mode) || Boolean(advanced)) &&
      Number.isInteger(color) &&
      color >= 0 &&
      color <= 0xffffff &&
      displayText
    ) {
      comments.push({
        id,
        replayTime: progress / 1000,
        type: mode === 4 ? "bottom" : mode === 5 ? "top" : "right",
        color: `#${color.toString(16).padStart(6, "0")}`,
        text: displayText,
        ...(advanced ? { advanced } : {}),
      });
    }

    offset = end;
  }
  return comments;
}

export function registerBilibiliDanmakuListener() {
  runtimeMessageDispatcher.addListener(
    "GET_BILIBILI_DANMAKU",
    (msg: unknown, _sender, sendResponse) => {
      if (!isBilibiliDanmakuRequest(msg)) return;

      const bvid = msg.bvid || "";
      const avid = msg.avid || "";
      const epId = msg.epId || "";
      const page = msg.page;
      const requestedStartSegment = msg.startSegment ?? 1;
      const requestedEndSegment = msg.endSegment ?? requestedStartSegment;
      const rangeRequested =
        msg.startSegment !== undefined || msg.endSegment !== undefined;

      const hasVideoTarget =
        /^BV[\w]{10}$/i.test(bvid) || /^\d+$/.test(avid) || /^\d+$/.test(epId);
      const targetCount = (bvid ? 1 : 0) + (avid ? 1 : 0) + (epId ? 1 : 0);

      if (
        !hasVideoTarget ||
        targetCount !== 1 ||
        !Number.isInteger(page) ||
        page < 1 ||
        page > 1000 ||
        (msg.startSegment !== undefined && requestedStartSegment < 1) ||
        (msg.endSegment !== undefined && requestedEndSegment < 1) ||
        (rangeRequested &&
          (requestedEndSegment < requestedStartSegment ||
            requestedEndSegment - requestedStartSegment > 5))
      ) {
        sendResponse({ ok: false, error: "Invalid Bilibili video request" });
        return;
      }

      void (async () => {
        let fallbackCid = "";
        let fallbackSendLegacy:
          | ((
              legacy: Awaited<
                ReturnType<typeof getCachedLegacyBilibiliDanmaku>
              >,
            ) => void)
          | null = null;
        try {
          let cid: string;
          let aid: string;
          let duration: number;

          if (epId) {
            ({ cid, aid, duration } = await fetchBilibiliBangumiMetadata(epId));
          } else {
            const pagelist = await fetchBilibiliPagelistMetadata(
              bvid || avid,
              page,
            );
            if (pagelist) ({ cid, aid, duration } = pagelist);
            else {
              const videoUrl = new URL(
                "https://api.bilibili.com/x/web-interface/view",
              );
              videoUrl.searchParams.set(bvid ? "bvid" : "aid", bvid || avid);
              const videoResponse = await fetchWithRetry(
                videoUrl,
                { credentials: "include" },
                "Video info",
              );
              if (videoResponse.status === 412) {
                ({ cid, aid, duration } = await fetchBilibiliPageMetadata(
                  bvid || avid,
                  page,
                ));
              } else {
                if (!videoResponse.ok)
                  throw new Error(`Video info HTTP ${videoResponse.status}`);

                const videoInfo: unknown = await videoResponse.json();
                const videoData =
                  isRecord(videoInfo) && isRecord(videoInfo.data)
                    ? videoInfo.data
                    : null;
                const pages = Array.isArray(videoData?.pages)
                  ? videoData.pages
                  : [];
                const part = pages[page - 1];
                cid = String(isRecord(part) ? (part.cid ?? "") : "");
                aid = String(videoData?.aid ?? "");
                duration = Number(isRecord(part) ? part.duration : undefined);

                if (
                  !isRecord(videoInfo) ||
                  videoInfo.code !== 0 ||
                  !/^\d+$/.test(cid) ||
                  !/^\d+$/.test(aid) ||
                  !Number.isFinite(duration) ||
                  duration <= 0
                )
                  throw new Error("Bilibili video part was not found");
              }
            }
          }

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
          const sendLegacyFallback = (
            legacy: Awaited<ReturnType<typeof getCachedLegacyBilibiliDanmaku>>,
          ) => {
            const legacyComments = rangeRequested
              ? legacy.comments.filter((comment) => {
                  const start = (segmentStart - 1) * BILIBILI_SEGMENT_SECONDS;
                  const end = Math.min(
                    segmentEnd * BILIBILI_SEGMENT_SECONDS,
                    duration,
                  );
                  return (
                    comment.replayTime >= start && comment.replayTime < end
                  );
                })
              : legacy.comments;
            legacyComments.sort((a, b) => a.replayTime - b.replayTime);
            sendResponse({
              ok: true,
              messages: legacyComments,
              recoveredSegments: [],
              unavailableSegments: [],
              legacyFallback: !rangeRequested,
              duration,
              segmentCount,
              segmentStart,
              segmentEnd,
            });
          };
          fallbackCid = cid;
          fallbackSendLegacy = sendLegacyFallback;

          if (
            segmentStart > segmentCount ||
            segmentStart > segmentEnd ||
            (rangeRequested && segmentEnd - segmentStart > 5)
          )
            throw new Error("Bilibili danmaku segment range is out of bounds");

          if (segmentCount > BILIBILI_MAX_SEGMENTS) {
            const legacy = await getCachedLegacyBilibiliDanmaku(cid);
            sendLegacyFallback(legacy);
            return;
          }

          let mixinKey: string;
          try {
            mixinKey = await getWbiMixinKey();
          } catch {
            const legacy = await getCachedLegacyBilibiliDanmaku(cid);
            sendLegacyFallback(legacy);
            return;
          }
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

            if (danmakuResponse.status === 412) {
              const legacy = await getCachedLegacyBilibiliDanmaku(cid);
              sendLegacyFallback(legacy);
              return;
            }

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
              const result: unknown = JSON.parse(
                new TextDecoder().decode(bytes),
              );
              const errorDetail = isRecord(result)
                ? result.message || result.code || "invalid response"
                : "invalid response";
              throw new Error(
                `Bilibili danmaku API error: ${String(errorDetail)}`,
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
            } catch (err) {
              fallbackError =
                err instanceof Error
                  ? err.message
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
        } catch (err) {
          if (fallbackCid && fallbackSendLegacy) {
            try {
              const legacy = await getCachedLegacyBilibiliDanmaku(fallbackCid);
              fallbackSendLegacy(legacy);
              return;
            } catch {}
          }
          sendResponse({
            ok: false,
            error:
              err instanceof Error ? err.message : "Bilibili request failed",
          });
        }
      })();
      return true;
    },
  );
}
