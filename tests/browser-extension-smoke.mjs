import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { chromium } from "playwright";

/* global chrome, document, isSecureContext, location, window */

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const chromeExecutable = process.env.CHROME_PATH || chromium.executablePath();
const smokeVideo = readFileSync(join(root, "tests/fixtures/pip-smoke.webm"));

function referencedManifestFiles(manifest) {
  return [
    ...Object.values(manifest.icons ?? {}),
    manifest.action?.default_popup,
    manifest.background?.service_worker,
    manifest.options_ui?.page,
    ...(manifest.content_scripts ?? []).flatMap((entry) => [
      ...(entry.js ?? []),
      ...(entry.css ?? []),
    ]),
    ...(manifest.web_accessible_resources ?? []).flatMap(
      (entry) => entry.resources ?? [],
    ),
  ].filter(Boolean);
}

function fixtureHtml() {
  return `<!doctype html>
<html><head><title>Extension smoke fixture</title></head>
<body><main id="route" data-route="initial"><video id="source-video" controls></video><div id="subtitle-caption" style="position:absolute;bottom:20px;left:30px;width:400px">Smoke caption</div></main>
<script>
  const video = document.querySelector("#source-video");
  video.src = "/pip-smoke.webm";
  video.loop = true;
  video.muted = true;
  video.playsInline = true;
  video.autoplay = true;
  video.play().catch(() => {});
  window.navigateSmokeRoute = () => {
    history.pushState({}, "", "/spa/next");
    document.querySelector("#route").dataset.route = "next";
    window.dispatchEvent(new PopStateEvent("popstate"));
  };
</script></body></html>`;
}

test("built extension smoke: manifest, popup messaging, PiP lifecycle and SPA stability", async (t) => {
  const workDir = mkdtempSync(join(tmpdir(), "pip-companion-browser-smoke-"));
  const extensionDir = join(workDir, "extension");
  const userDataDir = join(workDir, "chrome-profile");
  t.after(() => rmSync(workDir, { recursive: true, force: true }));

  execFileSync(process.execPath, [join(root, "scripts/build.mjs")], {
    cwd: root,
    env: { ...process.env, BUILD_OUT_DIR: extensionDir },
    stdio: "pipe",
  });
  execFileSync(
    process.execPath,
    [
      join(root, "node_modules/typescript/bin/tsc"),
      "-p",
      "tsconfig.json",
      "--outDir",
      extensionDir,
    ],
    { cwd: root, stdio: "pipe" },
  );

  const manifestPath = join(extensionDir, "manifest.json");
  const productionManifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  await t.test(
    "build output contains every manifest resource and API permission",
    () => {
      for (const path of referencedManifestFiles(productionManifest))
        assert.ok(
          existsSync(join(extensionDir, path)),
          `missing manifest resource: ${path}`,
        );

      for (const permission of ["storage", "activeTab", "scripting"])
        assert.ok(
          productionManifest.permissions.includes(permission),
          `missing permission: ${permission}`,
        );
      for (const host of [
        "https://api.bilibili.com/*",
        "https://www.bilibili.com/*",
        "https://api.gamer.com.tw/*",
        "wss://irc-ws.chat.twitch.tv/*",
        "https://aisubtitle.hdslb.com/*",
      ])
        assert.ok(
          productionManifest.host_permissions.includes(host),
          `missing host permission: ${host}`,
        );
      for (const host of [
        "https://api.cognitive.microsofttranslator.com/*",
        "https://translation.googleapis.com/*",
        "https://api-free.deepl.com/*",
        "https://api.deepl.com/*",
      ])
        assert.ok(
          productionManifest.optional_host_permissions.includes(host),
          `missing optional host permission: ${host}`,
        );
    },
  );

  if (!chromeExecutable)
    throw new Error(
      "Install Playwright Chromium with `npx playwright install chromium`, or set CHROME_PATH.",
    );

  const testManifest = {
    ...productionManifest,
    host_permissions: [
      ...productionManifest.host_permissions,
      "http://127.0.0.1/*",
    ],
  };
  writeFileSync(manifestPath, `${JSON.stringify(testManifest, null, 2)}\n`);

  const server = createServer((request, res) => {
    if (request.url === "/pip-smoke.webm") {
      res.writeHead(200, {
        "content-type": "video/webm",
        "content-length": smokeVideo.byteLength,
        "cache-control": "no-store",
      });
      res.end(smokeVideo);
      return;
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end(fixtureHtml());
  });
  await new Promise((resolveListen) =>
    server.listen(0, "127.0.0.1", resolveListen),
  );
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const fixtureUrl = `http://127.0.0.1:${address.port}/`;
  t.after(() => server.close());

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromeExecutable,
    headless: false,
    args: [
      `--disable-extensions-except=${extensionDir}`,
      `--load-extension=${extensionDir}`,
      "--no-first-run",
      "--no-default-browser-check",
    ],
  });
  t.after(() => context.close());

  let serviceWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().includes("/background/index.js"));
  if (!serviceWorker)
    serviceWorker = await context.waitForEvent("serviceworker", {
      predicate: (worker) => worker.url().includes("/background/index.js"),
      timeout: 15000,
    });
  const extensionId = new URL(serviceWorker.url()).host;
  const fixturePage = await context.newPage();
  const contentScriptErrors = [];
  fixturePage.on("pageerror", (err) => contentScriptErrors.push(err.message));
  await fixturePage.goto(fixtureUrl);
  await fixturePage.waitForFunction(() => {
    const video = document.querySelector("video");
    return video?.readyState >= 2 && video.currentTime > 0;
  });
  const pipSupport = await fixturePage.evaluate(() => ({
    available: Boolean(window.documentPictureInPicture),
    secure: isSecureContext,
    url: location.href,
    userAgent: navigator.userAgent,
  }));
  assert.equal(
    pipSupport.available,
    true,
    `the browser fixture must support Document Picture-in-Picture: ${JSON.stringify(pipSupport)}`,
  );
  const originalParentId = await fixturePage
    .locator("#source-video")
    .evaluate((video) => video.parentElement.id);

  const popupPage = await context.newPage();
  await popupPage.addInitScript(() => {
    window.close = () => {};
  });
  await popupPage.goto(`chrome-extension://${extensionId}/popup.html`);
  await popupPage.waitForSelector("#open-pip");
  assert.equal(
    await popupPage.locator("#follow-playback-pip-toggle").count(),
    0,
  );
  await popupPage.evaluate(
    async ({ tabUrl }) => {
      const [tab] = await chrome.tabs.query({ url: tabUrl });
      if (tab?.id === undefined) throw new Error("fixture tab not found");
      Object.defineProperty(chrome.tabs, "query", {
        configurable: true,
        value: async (queryInfo) =>
          queryInfo?.url === tabUrl ||
          (queryInfo?.active && queryInfo.currentWindow)
            ? [{ id: tab.id, url: tabUrl }]
            : [],
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        func: () => {
          const metrics = {
            messageListeners: 0,
            activeIntervals: 0,
            activeObservers: 0,
          };
          const addListener = chrome.runtime.onMessage.addListener.bind(
            chrome.runtime.onMessage,
          );
          chrome.runtime.onMessage.addListener = function (listener) {
            metrics.messageListeners++;
            return addListener(listener);
          };
          const nativeSetInterval = globalThis.setInterval.bind(globalThis);
          const nativeClearInterval = globalThis.clearInterval.bind(globalThis);
          const intervals = new Set();
          const trackedSetInterval = (...args) => {
            const id = nativeSetInterval(...args);
            intervals.add(id);
            metrics.activeIntervals = intervals.size;
            return id;
          };
          const trackedClearInterval = (id) => {
            intervals.delete(id);
            metrics.activeIntervals = intervals.size;
            return nativeClearInterval(id);
          };
          globalThis.setInterval = trackedSetInterval;
          globalThis.clearInterval = trackedClearInterval;
          window.setInterval = trackedSetInterval;
          window.clearInterval = trackedClearInterval;
          const NativeMutationObserver = globalThis.MutationObserver;
          globalThis.MutationObserver = class extends NativeMutationObserver {
            constructor(callback) {
              super(callback);
              this.__smokeObserved = false;
            }
            observe(...args) {
              if (!this.__smokeObserved) {
                this.__smokeObserved = true;
                metrics.activeObservers++;
              }
              return super.observe(...args);
            }
            disconnect() {
              if (this.__smokeObserved) {
                this.__smokeObserved = false;
                metrics.activeObservers--;
              }
              return super.disconnect();
            }
          };
          globalThis.__pipSmokeMetrics = metrics;
        },
      });
    },
    { tabUrl: fixtureUrl },
  );

  await popupPage.locator("#open-pip").click();
  await popupPage
    .waitForFunction(
      () =>
        chrome.runtime
          .sendMessage({ type: "GET_PIP_STATE" })
          .then((state) => state?.pipOpen === true),
      undefined,
      { timeout: 15000 },
    )
    .catch(async (err) => {
      const status = await popupPage
        .locator("#status")
        .textContent()
        .catch(() => "popup closed");
      throw new Error(`popup did not open PiP (${status}): ${err.message}`);
    });
  await fixturePage
    .waitForFunction(
      () => {
        const video =
          window.documentPictureInPicture?.window?.document.querySelector(
            "video",
          );
        return video?.readyState >= 2 && video.currentTime > 0;
      },
      undefined,
      {
        timeout: 5000,
      },
    )
    .catch(async (err) => {
      const pageState = await fixturePage.evaluate(() => ({
        available: Boolean(window.documentPictureInPicture),
        pipOpen: Boolean(window.documentPictureInPicture?.window),
        videoConnected: document.querySelector("#source-video")?.isConnected,
        videoParent:
          document.querySelector("#source-video")?.parentElement?.tagName,
      }));
      const status = await popupPage.locator("#status").textContent();
      throw new Error(
        `PiP window missing; fixture=${JSON.stringify(pageState)}, popup=${status}: ${err.message}`,
      );
    });

  await popupPage.evaluate(
    async ({ tabUrl }) => {
      const deadline = Date.now() + 5000;
      for (;;) {
        const [tab] = await chrome.tabs.query({ url: tabUrl });
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "ISOLATED",
          func: () => globalThis.__pipSmokeMetrics?.activeIntervals ?? 0,
        });
        if (result.result >= 1 || Date.now() >= deadline) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    },
    { tabUrl: fixtureUrl },
  );

  const baselineMetrics = await popupPage.evaluate(
    async ({ tabUrl }) => {
      const [tab] = await chrome.tabs.query({ url: tabUrl });
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        func: () => ({ ...globalThis.__pipSmokeMetrics }),
      });
      return result.result;
    },
    { tabUrl: fixtureUrl },
  );
  assert.equal(baselineMetrics.messageListeners, 1);
  assert.ok(baselineMetrics.activeIntervals >= 1);
  assert.ok(baselineMetrics.activeObservers >= 1);
  assert.deepEqual(
    contentScriptErrors,
    [],
    "content scripts must load without uncaught errors",
  );
  assert.equal(
    await popupPage.evaluate(
      async ({ tabUrl }) => {
        const [tab] = await chrome.tabs.query({ url: tabUrl });
        const [result] = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          world: "ISOLATED",
          func: () => typeof globalThis.PipCompanion?.ContentSubtitles,
        });
        return result.result;
      },
      { tabUrl: fixtureUrl },
    ),
    "object",
    "every injected content script module must register on PipCompanion",
  );

  await fixturePage.evaluate(() => window.navigateSmokeRoute());
  await fixturePage.waitForFunction(
    () => document.querySelector("#route")?.dataset.route === "next",
  );
  await delay(1200);
  const afterSpaMetrics = await popupPage.evaluate(
    async ({ tabUrl }) => {
      const [tab] = await chrome.tabs.query({ url: tabUrl });
      const [result] = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        world: "ISOLATED",
        func: () => ({ ...globalThis.__pipSmokeMetrics }),
      });
      return result.result;
    },
    { tabUrl: fixtureUrl },
  );
  assert.deepEqual(
    afterSpaMetrics,
    baselineMetrics,
    "SPA navigation must not register duplicate observers, intervals or runtime listeners",
  );

  const rapidCycle = await popupPage.evaluate(
    async ({ tabUrl }) => {
      const [tab] = await chrome.tabs.query({ url: tabUrl });
      if (tab?.id === undefined) throw new Error("fixture tab not found");
      const closing = chrome.runtime.sendMessage({ type: "CLOSE_ALL_PIP" });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const openStarted = performance.now();
      const opening = chrome.tabs.sendMessage(tab.id, { type: "OPEN_PIP" });
      const [closeResult, openResult] = await Promise.all([closing, opening]);
      return {
        closeResult,
        openResult,
        openElapsed: performance.now() - openStarted,
      };
    },
    { tabUrl: fixtureUrl },
  );
  assert.equal(rapidCycle.closeResult?.ok, true);
  assert.equal(rapidCycle.openResult?.ok, true);
  assert.ok(
    rapidCycle.openElapsed < 1000,
    `PiP open response took ${rapidCycle.openElapsed.toFixed(0)}ms`,
  );
  await popupPage.waitForFunction(
    () =>
      chrome.runtime
        .sendMessage({ type: "GET_PIP_STATE" })
        .then((state) => state?.pipOpen === true),
    undefined,
    { timeout: 15000 },
  );
  await fixturePage.waitForFunction(
    () => {
      const video =
        window.documentPictureInPicture?.window?.document.querySelector(
          "video",
        );
      return video?.readyState >= 2 && video.currentTime > 0;
    },
    undefined,
    { timeout: 5000 },
  );
  assert.equal(
    await fixturePage.evaluate(() =>
      Boolean(
        window.documentPictureInPicture?.window?.document.querySelector(
          "#source-video",
        )?.currentTime > 0,
      ),
    ),
    true,
  );

  await fixturePage.bringToFront();
  await fixturePage.mouse.move(1000, 700);
  for (const replaceContainer of [false, true]) {
    await fixturePage.evaluate(async (replaceContainer) => {
      const pipWindow = window.documentPictureInPicture.window;
      window.__replacementPipWindow = pipWindow;
      const previous = pipWindow.document.querySelector("#source-video");
      previous.pause();
      previous.id = "previous-video";
      let player = document.querySelector("#route");
      if (replaceContainer) {
        const replacementPlayer = document.createElement("main");
        replacementPlayer.id = "route";
        player.replaceWith(replacementPlayer);
        player = replacementPlayer;
      }
      const replacement = document.createElement("video");
      replacement.id = "source-video";
      replacement.src = "/pip-smoke.webm";
      replacement.loop = true;
      replacement.muted = true;
      replacement.playsInline = true;
      player.append(replacement);
      await replacement.play();
    }, replaceContainer);

    await fixturePage.waitForFunction(() => {
      const pipWindow = window.documentPictureInPicture.window;
      const video = pipWindow?.document.querySelector("#source-video");
      return (
        pipWindow === window.__replacementPipWindow &&
        video?.readyState >= 2 &&
        !video.paused &&
        video.currentTime > 0 &&
        !pipWindow.document.querySelector("#previous-video")
      );
    });

    const renderedFrames = await fixturePage.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const video =
            window.documentPictureInPicture.window.document.querySelector(
              "#source-video",
            );
          const timeout = window.setTimeout(
            () =>
              reject(new Error("replacement video produced no new PiP frames")),
            5000,
          );
          video.requestVideoFrameCallback((_now, first) => {
            video.requestVideoFrameCallback((_next, second) => {
              window.clearTimeout(timeout);
              resolve(second.presentedFrames > first.presentedFrames);
            });
          });
        }),
    );
    assert.equal(renderedFrames, true);
    const hasVisiblePixels = await fixturePage.evaluate(() => {
      const video =
        window.documentPictureInPicture.window.document.querySelector(
          "#source-video",
        );
      const canvas = document.createElement("canvas");
      canvas.width = 32;
      canvas.height = 18;
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      return data.some((channel, i) => i % 4 !== 3 && channel > 50);
    });
    assert.equal(
      hasVisiblePixels,
      true,
      "replacement PiP video must not be black",
    );

    await fixturePage.evaluate(() => {
      const pipWindow = window.documentPictureInPicture.window;
      window.__pausedReplacement =
        pipWindow.document.querySelector("#source-video");
      window.__pausedReplacement.pause();
    });
    await delay(2300);
    assert.equal(
      await fixturePage.evaluate(() => {
        const video =
          window.documentPictureInPicture.window.document.querySelector(
            "video",
          );
        return video === window.__pausedReplacement && video.paused;
      }),
      true,
      "pausing after replacement must retain the replacement video in PiP",
    );
    await fixturePage.evaluate(() => window.__pausedReplacement.play());
  }

  const beforeClose = await fixturePage.evaluate(() => {
    const video =
      window.documentPictureInPicture?.window?.document.querySelector(
        "#source-video",
      );
    return { currentTime: video?.currentTime ?? 0, paused: video?.paused };
  });
  assert.equal(beforeClose.paused, false);

  await popupPage.locator("#open-pip").click();
  await popupPage.waitForFunction(
    () =>
      chrome.runtime
        .sendMessage({ type: "GET_PIP_STATE" })
        .then((state) => state?.pipOpen === false),
    undefined,
    { timeout: 15000 },
  );
  await fixturePage.waitForFunction(
    () => !window.documentPictureInPicture?.window,
  );
  await fixturePage
    .waitForFunction(
      () => {
        const video = document.querySelector("#source-video");
        return (
          video?.paused === true &&
          video.readyState >= 2 &&
          video.currentTime > 0
        );
      },
      undefined,
      { timeout: 5000 },
    )
    .catch(async (err) => {
      const state = await fixturePage.evaluate(() => {
        const video = document.querySelector("#source-video");
        return {
          paused: video?.paused,
          time: video?.currentTime,
          readyState: video?.readyState,
          parent: video?.parentElement.id,
        };
      });
      throw new Error(
        `replacement restore failed: ${JSON.stringify(state)}: ${err.message}`,
      );
    });
  assert.equal(
    await fixturePage
      .locator("#source-video")
      .evaluate((video) => video.parentElement.id),
    originalParentId,
  );
  assert.equal(
    await fixturePage
      .locator("#source-video")
      .evaluate((video) => video.isConnected),
    true,
  );

  const pausedTime = await fixturePage
    .locator("#source-video")
    .evaluate((video) => video.currentTime);
  await delay(1000);
  assert.equal(
    await fixturePage
      .locator("#source-video")
      .evaluate((video) => video.paused),
    true,
  );
  assert.equal(
    await fixturePage
      .locator("#source-video")
      .evaluate((video) => video.currentTime),
    pausedTime,
  );

  const optionsPage = await context.newPage();
  await optionsPage.goto(
    `chrome-extension://${extensionId}/${productionManifest.options_ui.page}`,
  );
  const pauseToggle = optionsPage.locator("#pause-on-pip-close-toggle");
  await pauseToggle.waitFor();
  await optionsPage.waitForFunction(
    () => !document.querySelector("#pause-on-pip-close-toggle").disabled,
  );
  assert.equal(await pauseToggle.isChecked(), true);
  assert.equal(
    await optionsPage.locator("#follow-playback-pip-toggle").count(),
    1,
  );
  for (const pauseOnPipClose of [false, true]) {
    await pauseToggle.setChecked(pauseOnPipClose);
    await optionsPage.waitForFunction(
      (expected) =>
        chrome.storage.local
          .get("pauseOnPipClose")
          .then((stored) => stored.pauseOnPipClose === expected),
      pauseOnPipClose,
    );
    await optionsPage.reload();
    await optionsPage.waitForFunction(
      () => !document.querySelector("#pause-on-pip-close-toggle").disabled,
    );
    assert.equal(await pauseToggle.isChecked(), pauseOnPipClose);

    await popupPage.locator("#open-pip").click();
    await fixturePage.waitForFunction(() =>
      window.documentPictureInPicture?.window?.document.querySelector(
        "#source-video",
      ),
    );
    await fixturePage.evaluate(async () => {
      const pipWindow = window.documentPictureInPicture.window;
      await pipWindow.document.querySelector("#source-video").play();
      pipWindow.close();
    });
    await fixturePage.waitForFunction(
      (expected) =>
        !window.documentPictureInPicture?.window &&
        document.querySelector("#source-video")?.paused === expected,
      pauseOnPipClose,
    );
    await delay(500);
    assert.equal(
      await fixturePage
        .locator("#source-video")
        .evaluate((video) => video.paused),
      pauseOnPipClose,
    );
    assert.equal(
      await fixturePage
        .locator("#source-video")
        .evaluate((video) => video.parentElement.id),
      originalParentId,
    );
    await popupPage.waitForFunction(() =>
      chrome.runtime
        .sendMessage({ type: "GET_PIP_STATE" })
        .then((result) => result?.pipOpen === false),
    );
  }
});
