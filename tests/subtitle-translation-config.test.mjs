import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(
    new URL("../src/shared/subtitle-translation-config.ts", import.meta.url),
    "utf8",
  ),
  { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
).outputText;

function getConfigApi() {
  const context = { PipCompanion: {} };
  vm.runInNewContext(source, context);
  return context.PipCompanion.subtitleTranslationConfig;
}

test("normalizes translation config values and limits credential lengths", () => {
  const api = getConfigApi();
  assert.equal(
    JSON.stringify(
      api.normalize({
        provider: "google",
        microsoftKey: "ms",
        microsoftRegion: "eastus",
        googleKey: "google",
        deeplKey: "deepl",
      }),
    ),
    JSON.stringify({
      provider: "google",
      microsoftKey: "ms",
      microsoftRegion: "eastus",
      googleKey: "google",
      deeplKey: "deepl",
    }),
  );
  assert.equal(api.normalize({ provider: "other" }).provider, "microsoft");
  assert.equal(
    api.normalize({ microsoftKey: "x".repeat(4097) }).microsoftKey,
    "",
  );
  assert.equal(
    api.normalize({ microsoftRegion: "x".repeat(101) }).microsoftRegion,
    "",
  );
});

test("selects provider credentials and origins", () => {
  const api = getConfigApi();
  const config = api.normalize({
    microsoftKey: "ms",
    googleKey: "google",
    deeplKey: "free:fx",
  });
  assert.equal(api.getProviderApiKey(config, "microsoft"), "ms");
  assert.equal(api.getProviderApiKey(config, "google"), "google");
  assert.equal(api.getProviderApiKey(config, "deepl"), "free:fx");
  assert.equal(
    api.getProviderOrigins("microsoft", "")[0],
    "https://api.cognitive.microsofttranslator.com/*",
  );
  assert.equal(
    api.getProviderOrigins("google", "")[0],
    "https://translation.googleapis.com/*",
  );
  assert.equal(
    api.getProviderOrigins("deepl", "free:fx")[0],
    "https://api-free.deepl.com/*",
  );
  assert.equal(
    api.getProviderOrigins("deepl", "paid")[0],
    "https://api.deepl.com/*",
  );
});
