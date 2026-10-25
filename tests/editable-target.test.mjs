import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

function transpile(file) {
  return ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText;
}

class MockNode {
  constructor(nodeType = 1) {
    this.nodeType = nodeType;
    this.parentElement = null;
  }
}

class MockElement extends MockNode {
  constructor(tagName, attributes = {}) {
    super(1);
    this.tagName = tagName.toUpperCase();
    this.attributes = { ...attributes };
    this.isContentEditable = false;
    this.shadowRoot = null;
  }

  getAttribute(name) {
    return this.attributes[name.toLowerCase()] ?? null;
  }

  setAttribute(name, value) {
    this.attributes[name.toLowerCase()] = String(value);
  }

  closest(selector) {
    const tokens = selector.split(",").map((s) => s.trim().toLowerCase());
    let cur = this;
    while (cur) {
      if (cur instanceof MockElement) {
        const tag = cur.tagName.toLowerCase();
        const role = cur.getAttribute("role")?.toLowerCase();
        const hasCe = cur.getAttribute("contenteditable") !== null;
        for (const token of tokens) {
          if (token === tag) return cur;
          if (token === "[contenteditable]" && hasCe) return cur;
          if (role && token === `[role='${role}']`) return cur;
        }
      }
      cur = cur.parentElement;
    }
    return null;
  }
}

class MockHTMLElement extends MockElement {}

class MockHTMLInputElement extends MockHTMLElement {
  constructor(type = "text") {
    super("input", { type });
    this.type = type;
  }
}

class MockHTMLTextAreaElement extends MockHTMLElement {
  constructor() {
    super("textarea");
  }
}

class MockHTMLSelectElement extends MockHTMLElement {
  constructor() {
    super("select");
  }
}

function createUtilsContext(documentMock = {}) {
  const context = {
    navigator: { platform: "MacIntel" },
    URL,
    Node: MockNode,
    Element: MockElement,
    HTMLElement: MockHTMLElement,
    HTMLInputElement: MockHTMLInputElement,
    HTMLTextAreaElement: MockHTMLTextAreaElement,
    HTMLSelectElement: MockHTMLSelectElement,
    document: documentMock,
  };
  vm.createContext(context);
  vm.runInContext(transpile("../src/shared/utils.ts"), context);
  return context.PipCompanion.util;
}

test("isEditableTarget detects standard text inputs, textareas, and selects", () => {
  const util = createUtilsContext();

  const textInput = new MockHTMLInputElement("text");
  assert.equal(util.isEditableTarget(textInput), true);

  const defaultInput = new MockHTMLInputElement("");
  assert.equal(util.isEditableTarget(defaultInput), true);

  const searchInput = new MockHTMLInputElement("search");
  assert.equal(util.isEditableTarget(searchInput), true);

  const textarea = new MockHTMLTextAreaElement();
  assert.equal(util.isEditableTarget(textarea), true);

  const select = new MockHTMLSelectElement();
  assert.equal(util.isEditableTarget(select), true);
});

test("isEditableTarget ignores non-text inputs like buttons, ranges, and checkboxes", () => {
  const util = createUtilsContext();

  assert.equal(util.isEditableTarget(new MockHTMLInputElement("range")), false);
  assert.equal(
    util.isEditableTarget(new MockHTMLInputElement("checkbox")),
    false,
  );
  assert.equal(util.isEditableTarget(new MockHTMLInputElement("radio")), false);
  assert.equal(
    util.isEditableTarget(new MockHTMLInputElement("button")),
    false,
  );
  assert.equal(
    util.isEditableTarget(new MockHTMLInputElement("submit")),
    false,
  );
});

test("isEditableTarget detects contenteditable elements and their descendants", () => {
  const util = createUtilsContext();

  const ceElement = new MockHTMLElement("div");
  ceElement.isContentEditable = true;
  assert.equal(util.isEditableTarget(ceElement), true);

  const ceAttr = new MockHTMLElement("div", { contenteditable: "" });
  assert.equal(util.isEditableTarget(ceAttr), true);

  const cePlaintext = new MockHTMLElement("div", {
    contenteditable: "plaintext-only",
  });
  assert.equal(util.isEditableTarget(cePlaintext), true);

  // Child inside contenteditable container
  const child = new MockHTMLElement("span");
  child.parentElement = ceAttr;
  assert.equal(util.isEditableTarget(child), true);

  // Text node inside contenteditable container
  const textNode = new MockNode(3);
  textNode.parentElement = ceElement;
  assert.equal(util.isEditableTarget(textNode), true);
});

test("isEditableTarget detects ARIA textbox, searchbox, and combobox", () => {
  const util = createUtilsContext();

  const textbox = new MockHTMLElement("div", { role: "textbox" });
  assert.equal(util.isEditableTarget(textbox), true);

  const searchbox = new MockHTMLElement("div", { role: "searchbox" });
  assert.equal(util.isEditableTarget(searchbox), true);

  const combobox = new MockHTMLElement("div", { role: "combobox" });
  assert.equal(util.isEditableTarget(combobox), true);
});

test("isEditableTarget returns false for regular non-editable elements", () => {
  const util = createUtilsContext();

  const video = new MockHTMLElement("video");
  assert.equal(util.isEditableTarget(video), false);

  const button = new MockHTMLElement("button");
  assert.equal(util.isEditableTarget(button), false);

  const container = new MockHTMLElement("div");
  assert.equal(util.isEditableTarget(container), false);
});

test("isEditableTarget detects editable elements in composedPath (Shadow DOM / Web Components)", () => {
  const util = createUtilsContext();

  // Shadow host (e.g. <bili-comments> or <ytd-searchbox>)
  const shadowHost = new MockHTMLElement("bili-comments");
  const innerInput = new MockHTMLInputElement("text");

  // Keydown event retargeted to shadowHost at window, but composedPath contains innerInput
  const event = {
    target: shadowHost,
    composedPath: () => [innerInput, shadowHost],
  };

  assert.equal(util.isEditableTarget(event), true);
});

test("isEditableTarget detects deep activeElement across Shadow DOM roots", () => {
  const host = new MockHTMLElement("ytd-commentbox");
  const innerEditor = new MockHTMLElement("div", { role: "textbox" });
  host.shadowRoot = { activeElement: innerEditor };

  const util = createUtilsContext({ activeElement: host });

  // Event with retargeted host or window
  const event = {
    target: host,
    composedPath: () => [host],
  };

  assert.equal(util.isEditableTarget(event), true);
});

test("onPageKeyDown skips danmaku toggle and preserves key event when target is editable", () => {
  let danmakuToggled = false;
  let defaultPrevented = false;
  let propagationStopped = false;

  const util = createUtilsContext();
  const innerCommentBox = new MockHTMLElement("div", {
    contenteditable: "true",
  });
  const shadowHost = new MockHTMLElement("bili-comments");

  const keyEvent = {
    code: "KeyD",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    target: shadowHost,
    composedPath: () => [innerCommentBox, shadowHost],
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  };

  // Simulating onPageKeyDown logic
  function handleKeyDown(e) {
    if (e.repeat || e.isComposing || e.keyCode === 229) return;
    if (util.isEditableTarget(e)) return;

    if (e.code === "KeyD") {
      e.preventDefault();
      e.stopPropagation();
      danmakuToggled = true;
    }
  }

  handleKeyDown(keyEvent);

  assert.equal(
    danmakuToggled,
    false,
    "Danmaku should NOT be toggled when typing in comment box",
  );
  assert.equal(
    defaultPrevented,
    false,
    "preventDefault should NOT be called so character 'd' can be typed",
  );
  assert.equal(
    propagationStopped,
    false,
    "stopPropagation should NOT be called",
  );
});

test("onPageKeyDown triggers danmaku toggle and prevents default when target is non-editable video player", () => {
  let danmakuToggled = false;
  let defaultPrevented = false;
  let propagationStopped = false;

  const util = createUtilsContext();
  const videoElement = new MockHTMLElement("video");

  const keyEvent = {
    code: "KeyD",
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    repeat: false,
    isComposing: false,
    target: videoElement,
    composedPath: () => [videoElement],
    preventDefault() {
      defaultPrevented = true;
    },
    stopPropagation() {
      propagationStopped = true;
    },
  };

  function handleKeyDown(e) {
    if (e.repeat || e.isComposing || e.keyCode === 229) return;
    if (util.isEditableTarget(e)) return;

    if (e.code === "KeyD") {
      e.preventDefault();
      e.stopPropagation();
      danmakuToggled = true;
    }
  }

  handleKeyDown(keyEvent);

  assert.equal(
    danmakuToggled,
    true,
    "Danmaku should be toggled when pressing 'D' on video player",
  );
  assert.equal(
    defaultPrevented,
    true,
    "preventDefault should be called for shortcut on video player",
  );
  assert.equal(
    propagationStopped,
    true,
    "stopPropagation should be called for shortcut on video player",
  );
});
