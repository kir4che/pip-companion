export function parseBilibiliAdvancedDanmaku(
  value: string,
): BilibiliAdvancedDanmaku | null {
  let data: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return null;
    data = parsed as Record<string, unknown>;
  } catch {
    return null;
  }

  const rawText = typeof data.content === "string" ? data.content : data.text;
  const text = typeof rawText === "string" ? rawText.trim() : "";
  const from = parsePoint(data.from);
  const to = parsePoint(data.to) || from;
  if (!text || !from || !to) return null;

  const sourceWidth = finiteNumber(data.width, 672, 1, 10000);
  const sourceHeight = finiteNumber(data.height, 438, 1, 10000);
  const duration = finiteNumber(data.dur ?? data.duration, 4, 0.1, 600);
  const alpha = Array.isArray(data.alpha)
    ? [
        finiteNumber(data.alpha[0], 1, 0, 1),
        finiteNumber(data.alpha[1], 1, 0, 1),
      ]
    : [finiteNumber(data.alpha, 1, 0, 1), finiteNumber(data.alpha, 1, 0, 1)];

  return {
    text,
    fromX: from.x,
    fromY: from.y,
    toX: to.x,
    toY: to.y,
    sourceWidth,
    sourceHeight,
    fontSize: finiteNumber(data.fontsize ?? data.fontSize, 25, 1, 200),
    durationMs: Math.round(duration * 1000),
    alphaStart: alpha[0],
    alphaEnd: alpha[1],
    rotateZ: finiteNumber(data.rotate ?? data.rotateZ, 0, -360, 360),
    rotateY: finiteNumber(data.rotateY, 0, -360, 360),
  };
}

function parsePoint(value: unknown): { x: number; y: number } | null {
  let parts: unknown[];
  if (typeof value === "string") parts = value.split(",");
  else if (Array.isArray(value)) parts = value;
  else if (value && typeof value === "object") {
    const point = value as Record<string, unknown>;
    parts = [point.x, point.y];
  } else return null;

  if (parts.length < 2) return null;
  const x = parseNumeric(parts[0]);
  const y = parseNumeric(parts[1]);
  if (x === null || y === null) return null;
  return {
    x: Math.max(-10000, Math.min(10000, x)),
    y: Math.max(-10000, Math.min(10000, y)),
  };
}

function finiteNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const number = parseNumeric(value);
  if (number === null) return fallback;
  return Math.max(min, Math.min(max, number));
}

function parseNumeric(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
