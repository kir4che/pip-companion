import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function setup(fetchHandler, initialPath = "/bangumi/play/ep476878") {
  const listeners = [];
  const messageListeners = [];
  const createdUrls = [];
  const revokedUrls = [];

  const context = {
    location: {
      href: `https://www.bilibili.com${initialPath}`,
      hostname: "www.bilibili.com",
      pathname: initialPath,
      search: "",
      origin: "https://www.bilibili.com",
    },
    document: {
      documentElement: { dataset: {} },
      querySelectorAll: () => [],
      querySelector: () => null,
      dispatchEvent: () => true,
      addEventListener: () => {},
      removeEventListener: () => {},
    },
    window: null,
    URL: {
      createObjectURL: () => {
        const u = `blob:test-${createdUrls.length + 1}`;
        createdUrls.push(u);
        return u;
      },
      revokeObjectURL: (u) => {
        revokedUrls.push(u);
      },
    },
    URLSearchParams,
    fetch: fetchHandler,
    addEventListener: (type, handler) => {
      if (type === "message") messageListeners.push(handler);
      else listeners.push({ type, handler });
    },
    removeEventListener: () => {},
  };
  context.window = context;

  context.PipCompanion = {
    site: {
      isYouTubeHost: () => false,
      isBilibiliHost: (host) => host.includes("bilibili.com"),
      isBilibiliLiveHost: () => false,
      isBahamutHost: () => false,
      isNetflixHost: () => false,
      parseBilibiliVideoPath: (pathname) => {
        const m = pathname.match(/^\/video\/(BV[\w]{10}|av\d+)/i);
        if (!m) return null;
        return {
          videoId: m[1],
          bvid: /^BV/i.test(m[1]) ? m[1] : "",
          avid: /^av/i.test(m[1]) ? m[1].slice(2) : "",
        };
      },
      parseYouTubeVideoId: () => null,
    },
    util: {
      isRecord: (value) =>
        typeof value === "object" && value !== null && !Array.isArray(value),
    },
    ContentPlayback: { isLiveStream: () => false },
  };

  vm.runInNewContext(
    ts.transpileModule(
      readFileSync(
        new URL("../src/content/pip/storyboard.ts", import.meta.url),
        "utf8",
      ),
      {
        compilerOptions: { target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    context,
  );

  return {
    context,
    storyboard: context.PipCompanion.ContentStoryboard,
    messageListeners,
    createdUrls,
    revokedUrls,
  };
}

test("Bilibili Bangumi storyboard preloads and extracts frame for episode", async () => {
  const fetchCalls = [];
  const env = setup(async (url) => {
    fetchCalls.push(String(url));
    if (String(url).includes("/pgc/view/web/season")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          result: {
            season_id: 41424,
            episodes: [
              {
                id: 476869,
                ep_id: 476869,
                bvid: "BV1s34y1x7Mg",
                aid: 810463977,
                cid: 570484359,
              },
              {
                id: 476878,
                ep_id: 476878,
                bvid: "BV1QZ4y1i7Bt",
                aid: 384878342,
                cid: 742758669,
              },
            ],
          },
        }),
      };
    }
    if (String(url).includes("/x/player/videoshot")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            img_x_len: 10,
            img_y_len: 10,
            img_x_size: 480,
            img_y_size: 270,
            image: ["//bimp.hdslb.com/videoshot/742758669-0001.jpg"],
            index: [0, 10, 20, 30, 40],
          },
        }),
      };
    }
    if (String(url).includes("bimp.hdslb.com")) {
      return {
        ok: true,
        blob: async () => ({ size: 100 }),
      };
    }
    return { ok: false };
  });

  const video = { duration: 1420, currentTime: 25 };
  env.storyboard.preload(video);

  await new Promise((r) => setTimeout(r, 10));

  assert.ok(fetchCalls.some((c) => c.includes("ep_id=476878")));
  assert.ok(
    fetchCalls.some(
      (c) => c.includes("cid=742758669") && c.includes("BV1QZ4y1i7Bt"),
    ),
  );

  const frame = env.storyboard.getFrame(25, video);
  assert.ok(frame, "Storyboard frame should be returned");
  assert.equal(frame.width, 480);
  assert.equal(frame.height, 270);
  assert.equal(frame.sheetWidth, 4800);
  assert.equal(frame.sheetHeight, 2700);
  assert.equal(frame.x, 960);
  assert.equal(frame.y, 0);
  assert.ok(frame.url.startsWith("blob:test-"));
});

test("Bilibili Bangumi episode switch reuses cached season info", async () => {
  let seasonFetchCount = 0;
  let videoshotCalls = [];

  const env = setup(async (url) => {
    const s = String(url);
    if (s.includes("/pgc/view/web/season")) {
      seasonFetchCount++;
      return {
        ok: true,
        json: async () => ({
          code: 0,
          result: {
            season_id: 41424,
            episodes: [
              {
                id: 476878,
                ep_id: 476878,
                bvid: "BV1QZ4y1i7Bt",
                aid: 384878342,
                cid: 742758669,
              },
              {
                id: 476879,
                ep_id: 476879,
                bvid: "BV1QS4y1e7Em",
                aid: 727541257,
                cid: 748977184,
              },
            ],
          },
        }),
      };
    }
    if (s.includes("/x/player/videoshot")) {
      videoshotCalls.push(s);
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            img_x_len: 10,
            img_y_len: 10,
            img_x_size: 480,
            img_y_size: 270,
            image: ["//bimp.hdslb.com/videoshot/test.jpg"],
            index: [0, 10],
          },
        }),
      };
    }
    return { ok: true, blob: async () => ({ size: 50 }) };
  });

  const video = { duration: 1200, currentTime: 0 };
  env.storyboard.preload(video);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(seasonFetchCount, 1);
  assert.equal(videoshotCalls.length, 1);
  assert.ok(videoshotCalls[0].includes("cid=742758669"));

  env.context.location.pathname = "/bangumi/play/ep476879";
  env.context.location.href = "https://www.bilibili.com/bangumi/play/ep476879";
  for (const listener of env.messageListeners) {
    listener({
      source: env.context.window,
      origin: env.context.location.origin,
      data: { type: "PIP_BILI_NAVIGATE" },
    });
  }

  env.storyboard.preload(video);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(seasonFetchCount, 1);
  assert.equal(videoshotCalls.length, 2);
  assert.ok(videoshotCalls[1].includes("cid=748977184"));
});

test("Bilibili storyboard revokes blobs on reset", async () => {
  const env = setup(async (url) => {
    const s = String(url);
    if (s.includes("/pgc/view/web/season")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          result: {
            episodes: [
              {
                id: 476878,
                ep_id: 476878,
                bvid: "BV1QZ4y1i7Bt",
                aid: 384878342,
                cid: 742758669,
              },
            ],
          },
        }),
      };
    }
    if (s.includes("/x/player/videoshot")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            img_x_len: 10,
            img_y_len: 10,
            img_x_size: 480,
            img_y_size: 270,
            image: ["//bimp.hdslb.com/videoshot/test.jpg"],
            index: [0, 10],
          },
        }),
      };
    }
    return { ok: true, blob: async () => ({ size: 50 }) };
  });

  const video = { duration: 1200, currentTime: 0 };
  env.storyboard.preload(video);
  await new Promise((r) => setTimeout(r, 10));

  assert.equal(env.createdUrls.length, 1);
  assert.equal(env.revokedUrls.length, 0);

  env.storyboard.reset();
  assert.equal(env.revokedUrls.length, 1);
  assert.equal(env.revokedUrls[0], env.createdUrls[0]);
});

test("Bilibili UGC video storyboard loads pagelist and videoshot", async () => {
  const fetchCalls = [];
  const env = setup(async (url) => {
    const s = String(url);
    fetchCalls.push(s);
    if (s.includes("/x/player/pagelist")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: [
            { page: 1, cid: 111111 },
            { page: 2, cid: 222222 },
          ],
        }),
      };
    }
    if (s.includes("/x/player/videoshot")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            img_x_len: 10,
            img_y_len: 10,
            img_x_size: 160,
            img_y_size: 90,
            image: ["//bimp.hdslb.com/videoshot/ugc.jpg"],
            index: [0, 5, 10],
          },
        }),
      };
    }
    return { ok: true, blob: async () => ({ size: 50 }) };
  }, "/video/BV1xx411c7mD");
  env.context.location.search = "?p=2";

  const video = { duration: 600, currentTime: 0 };
  env.storyboard.preload(video);
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(fetchCalls.some((c) => c.includes("pagelist?bvid=BV1xx411c7mD")));
  assert.ok(
    fetchCalls.some((c) => c.includes("videoshot") && c.includes("cid=222222")),
  );

  const frame = env.storyboard.getFrame(6, video);
  assert.ok(frame);
  assert.equal(frame.width, 160);
  assert.equal(frame.height, 90);
});

test("Bilibili Bangumi season fallback loads first episode when epId is not in URL", async () => {
  const fetchCalls = [];
  const env = setup(async (url) => {
    const s = String(url);
    fetchCalls.push(s);
    if (s.includes("/pgc/view/web/season")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          result: {
            season_id: 41424,
            episodes: [
              {
                id: 476869,
                ep_id: 476869,
                bvid: "BV1s34y1x7Mg",
                aid: 810463977,
                cid: 570484359,
              },
            ],
          },
        }),
      };
    }
    if (s.includes("/x/player/videoshot")) {
      return {
        ok: true,
        json: async () => ({
          code: 0,
          data: {
            img_x_len: 10,
            img_y_len: 10,
            img_x_size: 480,
            img_y_size: 270,
            image: ["//bimp.hdslb.com/videoshot/ss.jpg"],
            index: [0, 10],
          },
        }),
      };
    }
    return { ok: true, blob: async () => ({ size: 50 }) };
  }, "/bangumi/play/ss41424");

  const video = { duration: 1200, currentTime: 0 };
  env.storyboard.preload(video);
  await new Promise((r) => setTimeout(r, 10));

  assert.ok(fetchCalls.some((c) => c.includes("season_id=41424")));
  assert.ok(fetchCalls.some((c) => c.includes("cid=570484359")));

  const frame = env.storyboard.getFrame(5, video);
  assert.ok(frame);
  assert.equal(frame.width, 480);
});
