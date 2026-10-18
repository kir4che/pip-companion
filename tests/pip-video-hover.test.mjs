import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.createSourceFile(
  "index.ts",
  readFileSync(new URL("../src/content/index.ts", import.meta.url), "utf8"),
  ts.ScriptTarget.ES2022,
  true,
);
const helper = source.statements.find(
  (statement) =>
    ts.isFunctionDeclaration(statement) &&
    statement.name?.text === "isPointerHoveringVideo",
);
assert.ok(helper);
const context = {};
vm.runInNewContext(
  ts.transpileModule(
    ts.createPrinter().printNode(ts.EmitHint.Unspecified, helper, source),
    {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    },
  ).outputText,
  context,
);

test("page hover does not block PiP switching; video and player hover do", () => {
  const html = { matches: () => true, parentElement: null };
  const body = { matches: () => true, parentElement: html };
  const player = { matches: () => false, parentElement: body };
  const video = {
    ownerDocument: { body, documentElement: html },
    matches: () => false,
    parentElement: player,
  };

  assert.equal(context.isPointerHoveringVideo(video), false);
  player.matches = () => true;
  assert.equal(context.isPointerHoveringVideo(video), true);
  player.matches = () => false;
  video.matches = () => true;
  assert.equal(context.isPointerHoveringVideo(video), true);
});
