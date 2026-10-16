import {
  cpSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { contentScriptFiles } from "./content-script-files.mjs";

const staticFiles = [
  ["manifest.json", "manifest.json"],
  ["src/popup/index.html", "popup.html"],
  ["src/popup/index.css", "popup.css"],
  ["src/options/index.html", "ui/options/index.html"],
  ["src/options/index.css", "ui/options/index.css"],
  [
    "src/content/floating-comments/index.css",
    "content/floating-comments/index.css",
  ],
];

const out = process.env.BUILD_OUT_DIR || "dist";
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const [from, to] of staticFiles) {
  const destination = `${out}/${to}`;
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(from, destination);
}
cpSync("assets", `${out}/assets`, { recursive: true });
cpSync("_locales", `${out}/_locales`, { recursive: true });
const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.content_scripts[0].js = contentScriptFiles;
writeFileSync(`${out}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const locales = Object.fromEntries(
  ["en", "zh_TW", "zh_CN"].map((locale) => [
    locale,
    JSON.parse(readFileSync(`_locales/${locale}/messages.json`, "utf8")),
  ]),
);
mkdirSync(`${out}/shared`, { recursive: true });
writeFileSync(
  `${out}/shared/locales.js`,
  `globalThis.PipCompanion = globalThis.PipCompanion || {};\nglobalThis.PipCompanion.locales = ${JSON.stringify(locales)};\n`,
);

console.log(`copied static files to ${out}/`);
