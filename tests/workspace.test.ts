import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeProfile,
  exportProfileFile,
  parseProfileFile,
  loadWorkspace,
  saveWorkspace,
  keyboardBinding,
} from "../src/workspace";
const values = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  },
  configurable: true,
});
test("profile import preserves mappings and axes while retargeting destination slot", () => {
  const original = makeProfile(1);
  original.profile.dpiStages[0] = { x: 410, y: 820, color: [3, 6, 9] };
  original.profile.buttons[5] = { type: 4, a1: 17, a2: 0, a3: 3 };
  const imported = parseProfileFile(exportProfileFile(original), 6);
  assert.equal(imported.profile.profile, 6);
  assert.deepEqual(imported.profile.buttons, original.profile.buttons);
  assert.deepEqual(imported.profile.dpiStages, original.profile.dpiStages);
  assert.equal(imported.pending, true);
});
test("invalid transient input cannot replace prior valid stored configuration", () => {
  values.clear();
  const profiles = Array.from({ length: 6 }, (_, i) => makeProfile(i + 1));
  profiles[0].profile.dpiStages[0].x = 410;
  profiles[1].name = "工作";
  saveWorkspace(profiles);
  profiles[0].profile.dpiStages[0].x = 0;
  saveWorkspace(profiles);
  const restored = loadWorkspace();
  assert.equal(restored[0].profile.dpiStages[0].x, 410);
  assert.equal(restored[1].name, "工作");
});
test("one corrupt slot does not discard other saved slots and old five-slot caches migrate", () => {
  values.clear();
  const profiles = Array.from({ length: 5 }, (_, i) => makeProfile(i + 1));
  profiles[1].name = "自定义";
  const raw: any[] = profiles;
  raw[0] = { broken: true };
  localStorage.setItem("pulsar-workspace-v1", JSON.stringify(raw));
  const restored = loadWorkspace();
  assert.equal(restored.length, 6);
  assert.equal(restored[1].name, "自定义");
  assert.equal(restored[0].profile.dpiStages[0].x, 400);
});
test("keyboard capture maps physical key code and modifier mask", () => {
  assert.deepEqual(
    keyboardBinding({
      code: "KeyC",
      ctrlKey: true,
      shiftKey: true,
      altKey: false,
      metaKey: false,
    }),
    { type: 2, a1: 3, a2: 6 },
  );
});
