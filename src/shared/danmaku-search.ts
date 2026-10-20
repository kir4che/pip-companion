"use strict";

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.danmakuSearch = (() => {
  const DEFAULT_MAX_RESULTS = 200;
  const DEFAULT_BUCKET_SECONDS = 15;
  const DEFAULT_TOP_N = 3;
  const DEFAULT_MIN_DISTANCE_SECONDS = 45;

  function searchDanmaku(
    messages: DanmakuData[],
    query: string,
    options: { maxResults?: number } = {},
  ): DanmakuSearchResult[] {
    const q = (query || "").trim().toLowerCase();
    if (!q || !Array.isArray(messages) || messages.length === 0) return [];

    const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;
    const matches: DanmakuData[] = [];

    for (const msg of messages) {
      if (
        typeof msg.replayTime !== "number" ||
        !Number.isFinite(msg.replayTime) ||
        msg.replayTime < 0 ||
        typeof msg.text !== "string"
      )
        continue;

      if (msg.text.toLowerCase().includes(q)) {
        matches.push(msg);
      }
    }

    matches.sort((a, b) => (a.replayTime || 0) - (b.replayTime || 0));

    const results: DanmakuSearchResult[] = [];
    for (const msg of matches) {
      const text = msg.text!;
      const time = msg.replayTime!;
      const last = results[results.length - 1];

      if (last && last.text === text && Math.abs(time - last.time) <= 2) {
        last.count = (last.count || 1) + 1;
      } else {
        results.push({
          time,
          text,
          ...(msg.color ? { color: msg.color } : {}),
          count: 1,
        });
        if (results.length >= maxResults) break;
      }
    }

    return results;
  }

  function calculateDanmakuHeatPeaks(
    messages: DanmakuData[],
    duration?: number,
    options: {
      bucketSeconds?: number;
      topN?: number;
      minDistanceSeconds?: number;
    } = {},
  ): DanmakuHeatPeak[] {
    if (!Array.isArray(messages) || messages.length === 0) return [];

    const bucketSeconds = options.bucketSeconds ?? DEFAULT_BUCKET_SECONDS;
    const topN = options.topN ?? DEFAULT_TOP_N;
    const minDistanceSeconds =
      options.minDistanceSeconds ?? DEFAULT_MIN_DISTANCE_SECONDS;

    const validMessages: { time: number; text: string }[] = [];
    let maxTimeFound = 0;

    for (const msg of messages) {
      if (
        typeof msg.replayTime !== "number" ||
        !Number.isFinite(msg.replayTime) ||
        msg.replayTime < 0
      )
        continue;

      const time = msg.replayTime;
      if (time > maxTimeFound) maxTimeFound = time;
      validMessages.push({
        time,
        text: typeof msg.text === "string" ? msg.text.trim() : "",
      });
    }

    if (validMessages.length === 0) return [];

    const maxTime =
      typeof duration === "number" && Number.isFinite(duration) && duration > 0
        ? duration
        : maxTimeFound;

    const bucketCount = Math.max(1, Math.ceil(maxTime / bucketSeconds) + 1);
    const counts = new Uint32Array(bucketCount);

    for (const item of validMessages) {
      const bIndex = Math.min(
        bucketCount - 1,
        Math.floor(item.time / bucketSeconds),
      );
      counts[bIndex] = (counts[bIndex] || 0) + 1;
    }

    const candidateIndices: number[] = [];
    for (let i = 0; i < bucketCount; i++) {
      if ((counts[i] || 0) >= 2) {
        candidateIndices.push(i);
      }
    }

    candidateIndices.sort((a, b) => (counts[b] || 0) - (counts[a] || 0));

    const peakBuckets: number[] = [];
    const peaks: DanmakuHeatPeak[] = [];

    for (const bIndex of candidateIndices) {
      const peakCenterTime =
        bIndex * bucketSeconds + Math.floor(bucketSeconds / 2);

      const isTooClose = peaks.some(
        (p) => Math.abs(p.time - peakCenterTime) < minDistanceSeconds,
      );
      if (isTooClose) continue;

      peakBuckets.push(bIndex);
      peaks.push({
        time: peakCenterTime,
        count: counts[bIndex] || 0,
        representativeText: "",
      });

      if (peaks.length >= topN) break;
    }

    if (peaks.length > 0) {
      const textMaps = peakBuckets.map(() => new Map<string, number>());
      for (const item of validMessages) {
        const bIndex = Math.floor(item.time / bucketSeconds);
        const pIdx = peakBuckets.indexOf(bIndex);
        if (pIdx !== -1 && item.text.length >= 2 && item.text.length <= 40) {
          const map = textMaps[pIdx];
          if (map) map.set(item.text, (map.get(item.text) || 0) + 1);
        }
      }

      for (let j = 0; j < peaks.length; j++) {
        const peak = peaks[j];
        const map = textMaps[j];
        if (!peak || !map) continue;
        let repText = "";
        let maxFreq = 0;
        for (const [txt, freq] of map.entries()) {
          if (freq > maxFreq) {
            maxFreq = freq;
            repText = txt;
          }
        }
        if (!repText && map.size > 0) repText = map.keys().next().value || "";
        peak.representativeText = repText;
      }
    }

    return peaks;
  }

  return {
    searchDanmaku,
    calculateDanmakuHeatPeaks,
  };
})();
