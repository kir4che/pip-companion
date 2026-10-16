import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/localized-markup.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function createApi(doc) {
  const context = { PipCompanion: {}, NodeFilter: { SHOW_TEXT: 4 } };
  vm.runInNewContext(source, context);
  return context.PipCompanion.localizedMarkup.create(doc, (key) => `[${key}]`);
}

function createDocument() {
  const text = { textContent: "Hello __MSG_greeting__" };
  const title = { value: "__MSG_title__", ownerElement: null };
  const placeholder = { value: "Search __MSG_search__", ownerElement: null };
  const elements = [{ attributes: [title] }, { attributes: [placeholder] }];
  const attributesByElement = new Map([
    [elements[0], [title]],
    [elements[1], [placeholder]],
  ]);
  title.ownerElement = elements[0];
  placeholder.ownerElement = elements[1];
  return {
    documentElement: { lang: "en" },
    createTreeWalker: () => ({
      currentNode: text,
      nextNode() {
        if (this.seen) return false;
        this.seen = true;
        return true;
      },
    }),
    querySelectorAll: () => elements,
    text,
    title,
    placeholder,
    attributesByElement,
  };
}

test("relocalizes original text and attributes without mutating their sources", () => {
  const doc = createDocument();
  const refresh = createApi(doc);
  refresh();
  assert.equal(doc.text.textContent, "Hello [greeting]");
  assert.equal(doc.title.value, "[title]");
  assert.equal(doc.placeholder.value, "Search [search]");
  refresh();
  assert.equal(doc.text.textContent, "Hello [greeting]");
  assert.equal(doc.placeholder.value, "Search [search]");
});
