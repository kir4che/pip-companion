"use strict";

type StorageAreaAdapter = {
  get(
    keys?: string | string[] | Record<string, unknown>,
  ): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
};

function createStorageAreaAdapter(
  area: chrome.storage.StorageArea,
): StorageAreaAdapter {
  return {
    get: (keys) => area.get(keys),
    set: (items) => area.set(items),
    remove: (keys) => area.remove(keys),
  };
}

globalThis.PipCompanion = globalThis.PipCompanion || ({} as PipCompanionGlobal);
globalThis.PipCompanion.storage = {
  local: createStorageAreaAdapter(chrome.storage.local),
  session: createStorageAreaAdapter(chrome.storage.session),
};
