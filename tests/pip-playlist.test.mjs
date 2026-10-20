import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = readFileSync(
  new URL("../src/content/pip/playlist.ts", import.meta.url),
  "utf8",
);
const compiledSource = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;
const playbackSource = readFileSync(
  new URL("../src/content/pip/playback.ts", import.meta.url),
  "utf8",
);

function loadPlaylist({ site, location, querySelector, querySelectorAll }) {
  const root = {
    PipCompanion: {
      site,
      util: { getMessage: (key, value) => `${key}:${value}` },
    },
  };
  const context = {
    globalThis: root,
    URL,
    URLSearchParams,
    location,
    document: {
      querySelector: querySelector ?? (() => null),
      querySelectorAll: querySelectorAll ?? (() => []),
    },
    window: { postMessage() {} },
  };
  vm.runInNewContext(compiledSource, context);
  return root.PipCompanion.ContentPlaylist;
}

function setup({
  currentEpisode = 1,
  heading = "集數",
  currentMarkerEpisode = 0,
  duplicateCurrentPath = false,
  includeOutsideLink = false,
  hasList = true,
} = {}) {
  const origin = "https://video.example.test";
  const paths = [1, 2, 3, 4].map((episode) => {
    const pathEpisode = duplicateCurrentPath && episode === 2 ? 1 : episode;
    const query =
      episode === 1
        ? "?source=episode-list"
        : duplicateCurrentPath && episode === 2
          ? "?episode=2"
          : "";
    return `/drama/42/eps/${pathEpisode}${query}`;
  });
  const clicked = [];
  const listItems = [];
  const list = {
    querySelectorAll(selector) {
      return selector === "li, [role='listitem']" ? listItems : [];
    },
  };
  const links = paths.map((path, i) => {
    const text = `第${i + 1}集 ${41 - i}:42`;
    const attributes =
      i + 1 === currentMarkerEpisode ? { "aria-current": "page" } : {};
    let link;
    const item = {
      getAttribute: (name) => attributes[name] ?? null,
      closest: (selector) =>
        selector === "ul, ol, [role='list']" ? list : null,
      querySelector: (selector) => (selector === "a[href]" ? link : null),
    };
    listItems.push(item);
    link = {
      href: new URL(path, origin).href,
      innerText: text,
      textContent: text,
      getAttribute: (name) => attributes[name] ?? null,
      closest(selector) {
        if (selector === "ul, ol, [role='list']") return list;
        if (selector === "li, [role='listitem']") return item;
        return null;
      },
      click() {
        clicked.push(this.href);
      },
    };
    return link;
  });
  const headings = heading ? [{ textContent: heading }] : [];
  const outsideLink = {
    href: new URL("/drama/42", origin).href,
    innerText: "Drama details",
    textContent: "Drama details",
  };
  const region = {
    getAttribute: () => null,
    querySelectorAll(selector) {
      if (selector === "ul, ol, [role='list']") return hasList ? [list] : [];
      if (selector === "a[href]")
        return includeOutsideLink ? [...links, outsideLink] : links;
      if (selector.includes("h1")) return headings;
      return [];
    },
  };
  const url = new URL(`/drama/42/eps/${currentEpisode}`, origin);
  const site = {
    isYouTubeHost: () => false,
    isBahamutHost: () => false,
    isBilibiliHost: () => false,
    isBilibiliLiveHost: () => false,
  };
  const playlist = loadPlaylist({
    site,
    location: {
      href: url.href,
      origin: url.origin,
      pathname: url.pathname,
      hostname: url.hostname,
    },
    querySelectorAll: () => [region],
  });
  return { playlist, links, clicked };
}

function setupBahamut(currentSn) {
  const sns = ["ep-1", "ep-2"];
  const clicked = [];
  const links = sns.map((sn, i) => ({
    dataset: { aniVideoSn: sn },
    href: `https://ani.gamer.com.tw/animeVideo.php?sn=${sn}`,
    textContent: `第${i + 1}集`,
    closest: () => ({ classList: { contains: () => false } }),
    querySelectorAll: () => [],
    click() {
      clicked.push(this.href);
    },
  }));
  const url = new URL(
    `https://ani.gamer.com.tw/animeVideo.php${currentSn ? `?sn=${currentSn}` : ""}`,
  );
  const playlist = loadPlaylist({
    site: {
      isYouTubeHost: () => false,
      isBahamutHost: () => true,
      isBilibiliHost: () => false,
      isBilibiliLiveHost: () => false,
    },
    location: url,
    querySelectorAll: (selector) =>
      selector === ".anime-title .season a[data-ani-video-sn]" ? links : [],
  });
  return { playlist, links, clicked };
}

function setupBilibiliBangumi(currentEpId) {
  const clicked = [];
  const items = ["476877", "476878"].map((epId, i) => ({
    dataset: { epId },
    textContent: `第${i + 1}話`,
    classList: { contains: () => false },
    getAttribute: () => null,
    contains: () => false,
    querySelectorAll: () => [],
    querySelector: () => null,
    click() {
      clicked.push(epId);
    },
  }));
  const playlist = loadPlaylist({
    site: {
      isYouTubeHost: () => false,
      isBahamutHost: () => false,
      isBilibiliHost: () => true,
      isBilibiliLiveHost: () => false,
      parseBilibiliVideoPath: () => null,
    },
    location: {
      href: `https://www.bilibili.com/bangumi/play/ep${currentEpId ?? ""}`,
      origin: "https://www.bilibili.com",
      hostname: "www.bilibili.com",
      pathname: `/bangumi/play/ep${currentEpId ?? ""}`,
      search: "",
    },
    querySelector: () => null,
    querySelectorAll: () => items,
  });
  return Object.assign(playlist, { clicked });
}

function setupBilibili(currentBvid) {
  const items = ["BV1", "BV2"].map((bvid, i) => ({
    dataset: { key: bvid },
    textContent: `第${i + 1}集`,
    classList: { contains: () => false },
    getAttribute: () => null,
    contains: () => false,
    querySelectorAll: () => [],
  }));
  return loadPlaylist({
    site: {
      isYouTubeHost: () => false,
      isBahamutHost: () => false,
      isBilibiliHost: () => true,
      isBilibiliLiveHost: () => false,
      parseBilibiliVideoPath: () =>
        currentBvid ? { bvid: currentBvid } : null,
    },
    location: {
      href: `https://www.bilibili.com/video/${currentBvid ?? ""}`,
      origin: "https://www.bilibili.com",
      hostname: "www.bilibili.com",
      pathname: `/video/${currentBvid ?? ""}`,
      search: "",
    },
    querySelector: (selector) => (selector === ".video-pod__list" ? {} : null),
    querySelectorAll: (selector) =>
      selector ===
      ".video-pod__item, .cur-list li, .multi-page li, .multi-page-list li, .ep-list li, .episode-list li, .season-list li, .ep-item, .ep-sub-list-item, .section-ep-item, .bpx-player-ctrl-eplist-item"
        ? items
        : [],
  });
}

test("detects and selects a generic episode list in a labeled navigation region", () => {
  const { playlist, links, clicked } = setup({ includeOutsideLink: true });
  const info = playlist.getPlaylist();

  assert.equal(playlist.hasPlaylist(), true);
  assert.equal(info.items.length, 4);
  assert.equal(info.items[0].title, "第1集");
  assert.equal(info.items[0].duration, "41:42");
  assert.equal(info.currentIndex, 0);
  assert.equal(info.currentIndexKnown, true);
  assert.equal(playlist.getNextItemState(), "available");

  let prepared = false;
  playlist.selectPlaylistItem(1, () => {
    prepared = true;
  });
  assert.equal(prepared, true);
  assert.deepEqual(clicked, [links[1].href]);
});

test("hides next when the current episode is last", () => {
  const { playlist } = setup({ currentEpisode: 4 });

  assert.equal(playlist.getNextItemState(), "unavailable");
});

test("uses known current indices for Bahamut and Bilibili next state", () => {
  assert.equal(setupBahamut("ep-1").playlist.getNextItemState(), "available");
  assert.equal(setupBahamut("ep-2").playlist.getNextItemState(), "unavailable");
  assert.equal(setupBahamut("missing").playlist.getNextItemState(), "unknown");

  assert.equal(setupBilibili("BV1").getNextItemState(), "available");
  assert.equal(setupBilibili("BV2").getNextItemState(), "unavailable");
  assert.equal(setupBilibili("missing").getNextItemState(), "unknown");

  const bangumiFirst = setupBilibiliBangumi("476877");
  assert.equal(bangumiFirst.hasPlaylist(), true);
  assert.equal(bangumiFirst.getNextItemState(), "available");
  const bangumiLast = setupBilibiliBangumi("476878");
  assert.equal(bangumiLast.getNextItemState(), "unavailable");
});

test("Bahamut selection preserves playback state before following an episode link", () => {
  const { playlist, links, clicked } = setupBahamut("ep-1");
  let prepared = false;

  playlist.selectPlaylistItem(1, () => {
    prepared = true;
  });

  assert.equal(prepared, true);
  assert.deepEqual(clicked, [links[1].href]);
});

test("Bilibili Bangumi selection clicks the target element without hard reload", () => {
  const bangumi = setupBilibiliBangumi("476877");
  let prepared = false;
  bangumi.selectPlaylistItem(1, () => {
    prepared = true;
  });
  assert.equal(prepared, true);
  assert.deepEqual(bangumi.clicked, ["476878"]);
});

test("next playback selects the following generic episode", () => {
  const selected = [];
  const root = {
    PipCompanion: {
      site: { isYouTubeHost: () => false },
      util: { getMessage: () => "" },
      ContentPlaylist: {
        getNextItemState: () => "available",
        getPlaylist: () => ({ items: [{}, {}], currentIndex: 0 }),
        selectPlaylistItem(i) {
          selected.push(i);
        },
      },
    },
  };
  const context = {
    globalThis: root,
    location: { hostname: "video.example.test" },
    document: { querySelector: () => null },
    state: {},
  };
  vm.runInNewContext(
    ts.transpileModule(playbackSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  root.PipCompanion.ContentPlayback.playNextVideo();

  assert.deepEqual(selected, [1]);
});

test("clicks a semantic next-lesson link outside the player without a playlist", () => {
  let clicked = false;
  const nextLesson = {
    disabled: false,
    textContent: "Next lesson",
    matches: () => false,
    getAttribute: () => null,
    getClientRects: () => [{}],
    click() {
      clicked = true;
    },
  };
  const main = {
    querySelectorAll: (selector) =>
      selector === "a[href], button, [role='button']" ? [nextLesson] : [],
  };
  const root = {
    PipCompanion: {
      site: {
        isYouTubeHost: () => false,
        isBahamutHost: () => false,
        isBilibiliHost: () => false,
        isBilibiliLiveHost: () => false,
      },
      util: { getMessage: () => "" },
      ContentPlaylist: {
        getNextItemState: () => "unknown",
        getPlaylist: () => assert.fail("must not inspect a playlist"),
      },
    },
  };
  const context = {
    globalThis: root,
    location: { hostname: "video.example.test" },
    document: {
      querySelector: () => null,
      querySelectorAll: (selector) =>
        selector === "main, article" ? [main] : [],
    },
    state: {},
    window: {
      clearTimeout() {},
      clearInterval() {},
      setTimeout: () => 1,
    },
  };
  vm.runInNewContext(
    ts.transpileModule(playbackSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  root.PipCompanion.ContentPlayback.playNextVideo();

  assert.equal(clicked, true);
});

test("does not play next when the playlist confirms there is no next item", () => {
  const root = {
    PipCompanion: {
      site: { isYouTubeHost: () => false },
      util: { getMessage: () => "" },
      ContentPlaylist: {
        getNextItemState: () => "unavailable",
        getPlaylist: () => null,
        selectPlaylistItem() {
          assert.fail("must not select an item after the last episode");
        },
      },
    },
  };
  const context = {
    globalThis: root,
    location: { hostname: "video.example.test" },
    document: { querySelector: () => null },
    state: {},
  };
  vm.runInNewContext(
    ts.transpileModule(playbackSource, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText,
    context,
  );

  root.PipCompanion.ContentPlayback.playNextVideo();
});

test("requires a list container and a uniquely identifiable current episode", () => {
  const noList = setup({ hasList: false }).playlist;
  const ambiguousPath = setup({ duplicateCurrentPath: true }).playlist;
  const ariaCurrentResolvesAmbiguousPath = setup({
    duplicateCurrentPath: true,
    currentMarkerEpisode: 2,
  }).playlist;
  const markedInfo = ariaCurrentResolvesAmbiguousPath.getPlaylist();

  assert.equal(noList.getPlaylist(), null);
  assert.equal(ambiguousPath.getPlaylist(), null);
  assert.equal(markedInfo.currentIndex, 1);
});

test("does not treat unrelated or non-current navigation links as a playlist", () => {
  const unrelated = setup({ heading: "推薦內容" }).playlist;
  const noCurrentEpisode = setup({ currentEpisode: 5 }).playlist;

  assert.equal(unrelated.getPlaylist(), null);
  assert.equal(unrelated.hasPlaylist(), false);
  assert.equal(noCurrentEpisode.getPlaylist(), null);
  assert.equal(noCurrentEpisode.getNextItemState(), "unknown");
});
