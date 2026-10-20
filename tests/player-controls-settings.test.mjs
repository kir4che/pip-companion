import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/player-controls-settings.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createSettingsModule() {
  const context = {
    globalThis: {},
    PipCompanion: {},
  };
  context.globalThis = context;
  vm.runInNewContext(source, context);
  return context.PipCompanion.playerControlsSettings;
}

test("playerControlsSettings defines 10 control items with default visible true", () => {
  const settings = createSettingsModule();
  assert.equal(settings.STORAGE_KEY, "playerControls");
  assert.equal(settings.CONTROL_IDS.length, 10);
  assert.equal(settings.DEFAULT_CONTROLS_CONFIG.length, 10);

  const expectedIds = [
    "danmaku-send",
    "play",
    "next",
    "time",
    "progress",
    "volume",
    "speed",
    "translation",
    "playlist",
    "danmaku-search",
  ];
  assert.deepEqual([...settings.CONTROL_IDS], expectedIds);

  for (const item of settings.DEFAULT_CONTROLS_CONFIG)
    assert.equal(item.visible, true);
});

test("normalize handles null, undefined and non-array inputs with default config", () => {
  const settings = createSettingsModule();
  const def = settings.DEFAULT_CONTROLS_CONFIG;

  assert.deepEqual(settings.normalize(undefined), def);
  assert.deepEqual(settings.normalize(null), def);
  assert.deepEqual(settings.normalize({}), def);
  assert.deepEqual(settings.normalize("invalid"), def);
});

test("normalize preserves custom order and visibility, filters invalid items, and fills missing items", () => {
  const settings = createSettingsModule();
  const input = [
    { id: "volume", visible: false },
    { id: "play", visible: true },
    { id: "invalid-id", visible: true },
    { id: "volume", visible: true },
  ];

  const normalized = settings.normalize(input);
  assert.equal(normalized[0].id, "volume");
  assert.equal(normalized[0].visible, false);
  assert.equal(normalized[1].id, "play");
  assert.equal(normalized[1].visible, true);
  assert.equal(normalized.length, 10);
  assert.equal(
    normalized.some((i) => i.id === "invalid-id"),
    false,
  );

  const allIds = normalized.map((i) => i.id);
  assert.deepEqual(new Set(allIds).size, 10);
});

test("getItemName returns localized message key or fallback to id", () => {
  const settings = createSettingsModule();
  const messages = {
    optionsPlayerControlsItemPlay: "播放 / 暫停",
    optionsPlayerControlsItemVolume: "音量控制",
  };
  const t = (key) => messages[key] || key;

  assert.equal(settings.getItemName("play", t), "播放 / 暫停");
  assert.equal(settings.getItemName("volume", t), "音量控制");
});

const optionsSource = ts.transpileModule(
  readFileSync(
    new URL("../src/options/player-controls-options.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

class MockElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.children = [];
    this.classList = {
      classes: new Set(),
      add: (c) => this.classList.classes.add(c),
      remove: (c) => this.classList.classes.delete(c),
      toggle: (c, force) => {
        if (force === undefined) {
          if (this.classList.classes.has(c)) this.classList.classes.delete(c);
          else this.classList.classes.add(c);
        } else if (force) this.classList.classes.add(c);
        else this.classList.classes.delete(c);
      },
      contains: (c) => this.classList.classes.has(c),
    };
    this.listeners = new Map();
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.title = "";
    this.innerHTML = "";
    this.textContent = "";
  }

  append(...nodes) {
    this.children.push(...nodes);
  }

  replaceChildren(...nodes) {
    this.children = [...nodes];
  }

  addEventListener(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  trigger(event, data = {}) {
    const list = this.listeners.get(event) || [];
    for (const fn of list)
      fn({
        preventDefault: () => {},
        stopPropagation: () => {},
        ...data,
      });
  }

  setAttribute() {}

  getBoundingClientRect() {
    return { top: 0, left: 0, width: 60, height: 28 };
  }

  remove() {
    if (this.parentNode && this.parentNode.children) {
      const idx = this.parentNode.children.indexOf(this);
      if (idx !== -1) this.parentNode.children.splice(idx, 1);
    }
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
  }
}

test("player-controls-options requires clicking save to commit changes to storage", async () => {
  const settings = createSettingsModule();

  const elements = {
    "#player-controls-active-list": new MockElement(),
    "#player-controls-hidden-list": new MockElement(),
    "#player-controls-active-empty": new MockElement(),
    "#player-controls-save": new MockElement("button"),
    "#player-controls-reset": new MockElement("button"),
    "#player-controls-revert": new MockElement("button"),
    "#player-controls-unsaved-badge": new MockElement(),
  };

  const document = {
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: () => [],
    createElement: (tag) => new MockElement(tag),
    body: new MockElement("body"),
  };

  const storedData = {};
  const storageSets = [];
  const fakeStorage = {
    get: async (key) => ({ [key]: storedData[key] }),
    set: async (obj) => {
      storageSets.push(obj);
      Object.assign(storedData, obj);
    },
  };

  const context = {
    globalThis: {},
    PipCompanion: { playerControlsSettings: settings },
    document,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(optionsSource, context);

  let statusMessage = "";
  const controller = context.PipCompanion.optionsPlayerControlsOptions.create({
    storage: fakeStorage,
    settings,
    t: (key) => key,
    showStatus: (msg) => {
      statusMessage = msg;
    },
  });

  await controller.load();

  assert.equal(elements["#player-controls-active-list"].children.length, 10);
  assert.equal(elements["#player-controls-hidden-list"].children.length, 0);
  assert.equal(storageSets.length, 0, "載入時不會寫入 storage");

  const firstActiveItem = elements["#player-controls-active-list"].children[0];
  firstActiveItem.trigger("dragstart");
  elements["#player-controls-hidden-list"].trigger("drop");

  assert.equal(elements["#player-controls-active-list"].children.length, 9);
  assert.equal(elements["#player-controls-hidden-list"].children.length, 1);
  assert.equal(
    elements["#player-controls-unsaved-badge"].hidden,
    false,
    "應顯示未儲存變更提示",
  );
  assert.equal(storageSets.length, 0, "未按儲存前不可寫入 storage");

  elements["#player-controls-save"].trigger("click");
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(storageSets.length, 1, "按下儲存按鈕後才寫入 storage");
  assert.equal(
    storageSets[0].playerControls.filter((i) => i.visible).length,
    9,
  );
  assert.equal(statusMessage, "optionsPlayerControlsSaved");
  assert.equal(
    elements["#player-controls-unsaved-badge"].hidden,
    true,
    "儲存成功後未儲存提示隱藏",
  );
});

test("player-controls-options adds hidden item back at its default relative position", async () => {
  const settings = createSettingsModule();

  const elements = {
    "#player-controls-active-list": new MockElement(),
    "#player-controls-hidden-list": new MockElement(),
    "#player-controls-active-empty": new MockElement(),
    "#player-controls-save": new MockElement("button"),
    "#player-controls-reset": new MockElement("button"),
    "#player-controls-revert": new MockElement("button"),
    "#player-controls-unsaved-badge": new MockElement(),
  };

  const document = {
    querySelector: (selector) => elements[selector] || null,
    querySelectorAll: () => [],
    createElement: (tag) => new MockElement(tag),
    body: new MockElement("body"),
  };

  const fakeStorage = {
    get: async () => ({}),
    set: async () => {},
  };

  const context = {
    globalThis: {},
    PipCompanion: { playerControlsSettings: settings },
    document,
    setTimeout,
    clearTimeout,
  };
  context.globalThis = context;
  vm.runInNewContext(optionsSource, context);

  const controller = context.PipCompanion.optionsPlayerControlsOptions.create({
    storage: fakeStorage,
    settings,
    t: (key) => key,
    showStatus: () => {},
  });

  await controller.load();

  const activeChildren = () =>
    elements["#player-controls-active-list"].children;
  const hiddenChildren = () =>
    elements["#player-controls-hidden-list"].children;

  // 拖曳隱藏 time 與 volume
  const timeItem = activeChildren().find((el) => el.dataset.id === "time");
  timeItem.trigger("dragstart");
  elements["#player-controls-hidden-list"].trigger("drop");

  const volumeItem = activeChildren().find((el) => el.dataset.id === "volume");
  volumeItem.trigger("dragstart");
  elements["#player-controls-hidden-list"].trigger("drop");

  assert.equal(activeChildren().length, 8);
  assert.equal(hiddenChildren().length, 2);

  // 加回 volume（預設應插在 progress 之後、speed 之前，而非末尾）
  const hiddenVolume = hiddenChildren().find(
    (el) => el.dataset.id === "volume",
  );
  hiddenVolume.children[2].trigger("click");

  const currentIdsAfterVolume = activeChildren().map((el) => el.dataset.id);
  const volumeIdx = currentIdsAfterVolume.indexOf("volume");
  const progressIdx = currentIdsAfterVolume.indexOf("progress");
  const speedIdx = currentIdsAfterVolume.indexOf("speed");

  assert.equal(volumeIdx > progressIdx, true, "volume 應在 progress 之後");
  assert.equal(volumeIdx < speedIdx, true, "volume 應在 speed 之前");
  assert.notEqual(
    volumeIdx,
    currentIdsAfterVolume.length - 1,
    "volume 不應被加在最後",
  );

  // 加回 time（預設應插在 next 之後、progress 之前）
  const hiddenTime = hiddenChildren().find((el) => el.dataset.id === "time");
  hiddenTime.children[2].trigger("click");

  const currentIdsAfterTime = activeChildren().map((el) => el.dataset.id);
  const timeIdx = currentIdsAfterTime.indexOf("time");
  const nextIdx = currentIdsAfterTime.indexOf("next");
  const progressIdx2 = currentIdsAfterTime.indexOf("progress");

  assert.equal(timeIdx > nextIdx, true, "time 應在 next 之後");
  assert.equal(timeIdx < progressIdx2, true, "time 應在 progress 之前");
});
