import test from "node:test";
import assert from "node:assert/strict";
import {
  MACRO_LIMITS,
  macroDurationMs,
  moveMacroEvent,
  parseMacros,
  serializeMacros,
  validateMacros,
} from "../src/macros.ts";
import type { Macro } from "../src/macros.ts";

const macro: Macro = {
  id: "one",
  name: "测试宏",
  loopMode: "repeat",
  repeatCount: 3,
  events: [
    { type: "key", code: "KeyA", action: "down" },
    { type: "delay", durationMs: 75 },
    { type: "key", code: "KeyA", action: "up" },
    { type: "mouse", button: 4, action: "down" },
    { type: "mouse", button: 4, action: "up" },
  ],
};

test("macro export/import preserves key, mouse, delay and playback settings", () => {
  assert.deepEqual(parseMacros(serializeMacros([macro])), [macro]);
  assert.equal(macroDurationMs(macro), 75);
});

test("rejects malformed or unsupported imported files without accepting partial contents", () => {
  assert.throws(() => parseMacros("{"), /JSON/);
  assert.throws(
    () =>
      parseMacros(
        JSON.stringify({ format: "other", version: 1, macros: [macro] }),
      ),
    /版本/,
  );
  assert.throws(() => validateMacros([macro, macro]), /重复/);
  assert.throws(
    () =>
      validateMacros([
        { ...macro, events: [{ type: "delay", durationMs: -1 }] },
      ]),
    /延迟/,
  );
  assert.throws(
    () =>
      validateMacros([
        { ...macro, events: [{ type: "delay", durationMs: 1.5 }] },
      ]),
    /延迟/,
  );
  assert.throws(
    () =>
      validateMacros([
        { ...macro, events: [{ type: "mouse", button: 5, action: "down" }] },
      ]),
    /鼠标/,
  );
  assert.throws(
    () =>
      validateMacros([
        {
          ...macro,
          events: [{ type: "key", code: "KeyA", action: "execute" }],
        },
      ]),
    /按键/,
  );
  assert.throws(
    () => validateMacros([{ ...macro, loopMode: "shell" }]),
    /循环/,
  );
  assert.throws(
    () => validateMacros([{ ...macro, repeatCount: 0 }]),
    /重复次数/,
  );
  assert.throws(() => validateMacros([{ ...macro, name: "" }]), /宏名称/);
});

test("bounds imported resource usage and permits maximum valid delay", () => {
  assert.throws(
    () => parseMacros(" ".repeat(MACRO_LIMITS.fileBytes + 1)),
    /2 MB/,
  );
  assert.throws(
    () =>
      validateMacros([
        {
          ...macro,
          events: Array.from({ length: MACRO_LIMITS.events + 1 }, () => ({
            type: "delay",
            durationMs: 0,
          })),
        },
      ]),
    /事件/,
  );
  assert.doesNotThrow(() =>
    validateMacros([
      {
        ...macro,
        events: [{ type: "delay", durationMs: MACRO_LIMITS.delayMs }],
      },
    ]),
  );
});

test("moving an event preserves chronology and does not mutate the prior sequence", () => {
  const original = structuredClone(macro.events);
  const moved = moveMacroEvent(macro.events, 1, 1);
  assert.deepEqual(moved, [
    original[0],
    original[2],
    original[1],
    original[3],
    original[4],
  ]);
  assert.deepEqual(macro.events, original);
  assert.equal(moveMacroEvent(macro.events, 0, -1), macro.events);
  assert.equal(
    moveMacroEvent(macro.events, macro.events.length - 1, 1),
    macro.events,
  );
});
