import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname } from "node:path";

const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup/popup.html", "popup.html"],
  ["src/popup/popup.css", "popup.css"],
  ["src/content/floating-comments.css", "content/floating-comments.css"],
];

const out = "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [from, to] of staticFiles) {
  const destination = `${out}/${to}`;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(from, destination);
}
cpSync("assets", `${out}/assets`, { recursive: true });

console.log(`copied static files to ${out}/`);
