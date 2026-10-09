import { access, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { createServer } from "node:net";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const VIEWPORT = { width: 1920, height: 1080 };
const DEVICE_SCALE_FACTOR = Number(process.env.SOCIAL_PREVIEW_SCALE ?? 2);
if (!Number.isFinite(DEVICE_SCALE_FACTOR) || DEVICE_SCALE_FACTOR < 1)
  throw new Error("SOCIAL_PREVIEW_SCALE 必須是大於等於 1 的數字");
const VARIANTS = [
  {
    name: "en",
    source: "docs/social-preview/pip-companion-social-preview.en.html",
    output: "docs/images/pip-companion-social-preview.png",
  },
  {
    name: "zh-TW",
    source: "docs/social-preview/pip-companion-social-preview.zh-TW.html",
    output: "docs/images/pip-companion-social-preview.zh-TW.png",
  },
];

function sleep(milliseconds) {
  return new Promise((resolvePromise) =>
    setTimeout(resolvePromise, milliseconds),
  );
}

async function stopProcess(process) {
  if (!process || process.exitCode !== null || process.signalCode !== null)
    return;

  await new Promise((resolvePromise) => {
    let settled = false;
    const resolveOnce = () => {
      if (settled) return;
      settled = true;
      resolvePromise();
    };
    process.once("exit", resolveOnce);
    process.kill();
    setTimeout(resolveOnce, 2000);
  });
}

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    process.env.LOCALAPPDATA &&
      join(process.env.LOCALAPPDATA, "Google/Chrome/Application/chrome.exe"),
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }

  throw new Error(
    "找不到 Google Chrome 或 Chromium。可透過 CHROME_PATH 指定執行檔位置。",
  );
}

async function getFreePort() {
  const server = createServer();
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("無法取得 Chrome remote debugging port");
  }
  const port = address.port;
  await new Promise((resolvePromise) => server.close(resolvePromise));
  return port;
}

async function waitForDebugger(port) {
  const url = `http://127.0.0.1:${port}/json/version`;
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch {
      // Chrome 尚未啟動完成。
    }
    await sleep(100);
  }
  throw new Error("Chrome remote debugging 啟動逾時");
}

class DevToolsClient {
  #nextId = 0;
  #pending = new Map();
  #socket;
  #ready;

  constructor(url) {
    const WebSocketConstructor = globalThis.WebSocket;
    if (typeof WebSocketConstructor !== "function")
      throw new Error("目前 Node.js 不支援 WebSocket");

    this.#socket = new WebSocketConstructor(url);
    this.#ready = new Promise((resolvePromise, reject) => {
      this.#socket.addEventListener("open", resolvePromise, { once: true });
      this.#socket.addEventListener(
        "error",
        () => reject(new Error("無法連線至 Chrome DevTools Protocol")),
        { once: true },
      );
    });
    this.#socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id === undefined) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async command(method, params = {}) {
    await this.#ready;
    const id = ++this.#nextId;
    return new Promise((resolvePromise, reject) => {
      this.#pending.set(id, { resolve: resolvePromise, reject });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.#socket.close();
  }
}

async function evaluate(client, expression) {
  const result = await client.command("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error("宣傳圖 HTML 執行時發生錯誤");
  return result.result.value;
}

async function waitForPageReady(client) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const ready = await evaluate(
      client,
      `(() => ({
        document: document.readyState,
        fonts: document.fonts ? document.fonts.status : "loaded",
        images: [...document.images].every((image) => image.complete),
      }))()`,
    );
    if (
      ready.document === "complete" &&
      ready.fonts === "loaded" &&
      ready.images
    )
      return;
    await sleep(50);
  }
  throw new Error("宣傳圖 HTML 載入資源逾時");
}

async function createChromeProfile() {
  const profile = await mkdtemp(
    join(tmpdir(), "pip-companion-social-preview-"),
  );
  const defaultProfile = join(profile, "Default");
  await mkdir(defaultProfile, { recursive: true });
  await writeFile(
    join(defaultProfile, "Preferences"),
    JSON.stringify({
      webkit: {
        webprefs: {
          default_font_size: 16,
          default_fixed_font_size: 13,
          minimum_font_size: 0,
          minimum_logical_font_size: 0,
        },
      },
    }),
  );
  return profile;
}

async function renderVariant(client, variant) {
  const source = pathToFileURL(join(PROJECT_ROOT, variant.source)).href;
  await client.command("Page.navigate", { url: source });
  await waitForPageReady(client);

  const poster = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(".poster");
      if (!(element instanceof HTMLElement))
        throw new Error("找不到 .poster 元素");
      const rect = element.getBoundingClientRect();
      return {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      };
    })()`,
  );

  if (!poster || poster.width <= 0 || poster.height <= 0)
    throw new Error(`${variant.name} 宣傳圖尺寸無效`);

  const screenshot = await client.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...poster, scale: 1 },
  });
  await mkdir(join(PROJECT_ROOT, "docs/images"), { recursive: true });
  await writeFile(
    join(PROJECT_ROOT, variant.output),
    Buffer.from(screenshot.data, "base64"),
  );
  console.log(
    `${variant.name}: ${Math.round(poster.width)} × ${Math.round(poster.height)} → ${variant.output}`,
  );
}

const requestedNames = new Set(process.argv.slice(2));
const variants = requestedNames.size
  ? VARIANTS.filter((variant) => requestedNames.has(variant.name))
  : VARIANTS;
if (!variants.length)
  throw new Error(
    `可用語言：${VARIANTS.map((variant) => variant.name).join(", ")}`,
  );

const chromePath = await findChrome();
const port = await getFreePort();
const profile = await createChromeProfile();
let chrome;
let client;

try {
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
      "--allow-file-access-from-files",
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      `--force-device-scale-factor=${DEVICE_SCALE_FACTOR}`,
      `--window-size=${VIEWPORT.width},${VIEWPORT.height}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "ignore"] },
  );

  await waitForDebugger(port);
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const target = targets.find((item) => item.type === "page");
  if (!target?.webSocketDebuggerUrl)
    throw new Error("找不到 Chrome page target");

  client = new DevToolsClient(target.webSocketDebuggerUrl);
  await client.command("Page.enable");
  await client.command("Runtime.enable");
  await client.command("Emulation.setDeviceMetricsOverride", {
    width: VIEWPORT.width,
    height: VIEWPORT.height,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    mobile: false,
  });

  for (const variant of variants) await renderVariant(client, variant);
} finally {
  client?.close();
  await stopProcess(chrome);
  await rm(profile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}
