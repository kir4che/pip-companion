import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { contentScriptFiles } from "../scripts/content-script-files.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function collectBindingNames(name, into) {
  if (ts.isIdentifier(name)) into.add(name.text);
  else if (ts.isObjectBindingPattern(name) || ts.isArrayBindingPattern(name))
    for (const element of name.elements)
      if (ts.isBindingElement(element)) collectBindingNames(element.name, into);
}

function isBindingName(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (ts.isVariableDeclaration(parent) || ts.isParameter(parent))
    return parent.name === node;
  if (ts.isBindingElement(parent)) return parent.name === node;
  if (
    ts.isFunctionDeclaration(parent) ||
    ts.isClassDeclaration(parent) ||
    ts.isInterfaceDeclaration(parent) ||
    ts.isTypeAliasDeclaration(parent) ||
    ts.isEnumDeclaration(parent) ||
    ts.isFunctionExpression(parent) ||
    ts.isClassExpression(parent)
  )
    return parent.name === node;
  if (
    ts.isImportSpecifier(parent) ||
    ts.isImportClause(parent) ||
    ts.isNamespaceImport(parent)
  )
    return true;
  if (ts.isCatchClause(parent))
    return parent.variableDeclaration?.name === node;
  return false;
}

function isValueReference(node) {
  const parent = node.parent;
  if (
    (ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent)) &&
    parent.name === node
  )
    return false;
  if (isBindingName(node)) return false;
  for (let current = node.parent; current; current = current.parent)
    if (ts.isTypeNode(current)) return false;
  return true;
}

const scripts = contentScriptFiles
  .map((file) => `src/${file.replace(/\.js$/, ".ts")}`)
  .filter((file) => existsSync(resolve(root, file)));

const parsed = scripts.map((file) => {
  const source = ts.createSourceFile(
    file,
    readFileSync(resolve(root, file), "utf8"),
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.TS,
  );
  const declared = new Set();
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations)
        collectBindingNames(declaration.name, declared);
    else if (
      (ts.isFunctionDeclaration(statement) ||
        ts.isClassDeclaration(statement) ||
        ts.isEnumDeclaration(statement)) &&
      statement.name
    )
      declared.add(statement.name.text);
  }
  const bound = new Set();
  const collectBound = (node) => {
    if (ts.isIdentifier(node) && isBindingName(node)) bound.add(node.text);
    ts.forEachChild(node, collectBound);
  };
  collectBound(source);
  return { file, declared, bound, source };
});

const declaredAt = new Map();
parsed.forEach(({ declared }, i) => {
  for (const name of declared)
    if (!declaredAt.has(name)) declaredAt.set(name, i);
});

test("content scripts only read globals declared by earlier content scripts", () => {
  const violations = [];
  parsed.forEach(({ file, bound, source }, i) => {
    const visit = (node) => {
      if (
        ts.isIdentifier(node) &&
        isValueReference(node) &&
        !bound.has(node.text)
      ) {
        const declaredIndex = declaredAt.get(node.text);
        if (declaredIndex !== undefined && declaredIndex > i) {
          const line =
            source.getLineAndCharacterOfPosition(node.getStart(source)).line +
            1;
          violations.push(
            `${file}:${line} reads ${node.text}, declared later in ${parsed[declaredIndex].file}`,
          );
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  });

  assert.deepEqual(
    violations,
    [],
    "content scripts share one global scope but are evaluated in injection order, and a microtask started by an earlier file can run in between. Publish the value on PipCompanion (like shared/*.js), declare it in content/state.ts, or compute it in the same file.",
  );
});
