import test from "node:test";
import assert from "node:assert/strict";
import { saveAutoConnect, shouldAutoConnect } from "../src/connection-preference";

test("manual disconnect persists across module reloads until manually re-enabled", async () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    },
  });
  assert.equal(shouldAutoConnect(), true);
  assert.equal(saveAutoConnect(false), true);
  // A fresh module has no in-memory state from the prior page.
  const modulePath = "../src/connection-preference.ts?reload";
  const reloaded = await import(modulePath);
  assert.equal(reloaded.shouldAutoConnect(), false);
  assert.equal(reloaded.saveAutoConnect(true), true);
  assert.equal(shouldAutoConnect(), true);
  values.clear();
  assert.equal(shouldAutoConnect(), true);
});

test("unavailable browser storage prevents automatic connection and reports unsaved choices", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    get() {
      throw new Error("Storage blocked");
    },
  });
  assert.equal(shouldAutoConnect(), false);
  assert.equal(saveAutoConnect(false), false);
  assert.equal(saveAutoConnect(true), false);
});

test("a failed preference write preserves a previously saved manual disconnect", () => {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: () => "disabled",
      setItem: () => {
        throw new Error("Quota exceeded");
      },
    },
  });
  assert.equal(saveAutoConnect(true), false);
  assert.equal(shouldAutoConnect(), false);
});
