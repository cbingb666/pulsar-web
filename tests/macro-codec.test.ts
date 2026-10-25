import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeMacroBinding,
  decodeNativeMacro,
  encodeNativeMacro,
  macroBinding,
  NATIVE_MACRO_MAX_EVENTS,
} from "../src/macro-codec.ts";
import type { MacroEvent } from "../src/macros.ts";

test("encodes a Ctrl+A chord into native modifier/key commands with little-endian delay", () => {
  const events: MacroEvent[] = [
    { type: "key", code: "ControlLeft", action: "down" },
    { type: "key", code: "KeyA", action: "down" },
    { type: "delay", durationMs: 300 },
    { type: "key", code: "KeyA", action: "up" },
    { type: "key", code: "ControlLeft", action: "up" },
  ];
  // MainForm writer uses 5/6 for modifier masks, 3/4 for HID keys, 13 for LE u16.
  const expected = [5, 1, 3, 4, 13, 44, 1, 4, 4, 6, 1];
  assert.deepEqual(encodeNativeMacro({ events }), expected);
  assert.deepEqual(decodeNativeMacro(expected), events);
});

test("preserves the browser/native right-middle distinction and wheel direction", () => {
  const events: MacroEvent[] = [
    { type: "mouse", button: 1, action: "down" },
    { type: "mouse", button: 1, action: "up" },
    { type: "mouse", button: 2, action: "down" },
    { type: "mouse", button: 2, action: "up" },
    { type: "wheel", direction: "up" },
    { type: "wheel", direction: "down" },
  ];
  const expected = [1, 4, 2, 4, 1, 2, 2, 2, 11, 1, 11, 255];
  assert.deepEqual(encodeNativeMacro({ events }), expected);
  assert.deepEqual(decodeNativeMacro(expected), events);
});

test("long delays use only verified opcodes while preserving exact duration", () => {
  const bytes = encodeNativeMacro({
    events: [
      { type: "delay", durationMs: 0 },
      { type: "delay", durationMs: 255 },
      { type: "delay", durationMs: 256 },
      { type: "delay", durationMs: 65535 },
      { type: "delay", durationMs: 70000 },
    ],
  });
  assert.deepEqual(
    bytes,
    [12, 0, 12, 255, 13, 0, 1, 13, 255, 255, 13, 255, 255, 13, 113, 17],
  );
  const duration = decodeNativeMacro(bytes).reduce(
    (sum, event) => sum + (event.type === "delay" ? event.durationMs : 0),
    0,
  );
  assert.equal(duration, 0 + 255 + 256 + 65535 + 70000);
});

test("rejects unknown, ambiguous, malformed and oversized device content without partial decoding", () => {
  assert.throws(() => decodeNativeMacro([3]), /截断/);
  assert.throws(() => decodeNativeMacro([13, 1]), /截断/);
  assert.throws(() => decodeNativeMacro([8, 0, 0, 0, 0]), /暂不支持/);
  assert.throws(() => decodeNativeMacro([34, 1, 2, 3]), /暂不支持/);
  assert.throws(() => decodeNativeMacro([1, 3]), /组合/);
  assert.throws(() => decodeNativeMacro([5, 3]), /组合/);
  assert.throws(() => decodeNativeMacro([3, 200]), /键码/);
  assert.throws(() => decodeNativeMacro([11, 2]), /步进/);
  assert.throws(() => decodeNativeMacro([0]), /未知/);
  assert.throws(() => decodeNativeMacro([256]), /格式/);
  assert.throws(() => encodeNativeMacro({ events: [] }), /空宏/);
  assert.throws(
    () =>
      encodeNativeMacro({
        events: [{ type: "key", code: "F24", action: "down" }],
      }),
    /暂不支持/,
  );
  assert.throws(
    () =>
      encodeNativeMacro({
        events: Array.from({ length: NATIVE_MACRO_MAX_EVENTS }, () => ({
          type: "delay",
          durationMs: 65536,
        })),
      }),
    /1000/,
  );
});

test("native loop behavior is encoded in button assignment, separately from macro events", () => {
  const once = macroBinding(0x1234, { loopMode: "once", repeatCount: 10 });
  const repeat = macroBinding(0x1234, { loopMode: "repeat", repeatCount: 255 });
  const held = macroBinding(0x1234, {
    loopMode: "whilePressed",
    repeatCount: 1,
  });
  const toggle = macroBinding(0x1234, { loopMode: "toggle", repeatCount: 1 });
  assert.deepEqual(once, { type: 4, a1: 0x34, a2: 0x12, a3: 1 });
  assert.deepEqual(repeat, { type: 4, a1: 0x34, a2: 0x12, a3: 255 });
  assert.deepEqual(held, { type: 5, a1: 0x34, a2: 0x12 });
  assert.deepEqual(toggle, { type: 6, a1: 0x34, a2: 0x12 });
  assert.deepEqual(decodeMacroBinding(repeat), {
    deviceId: 0x1234,
    loopMode: "repeat",
    repeatCount: 255,
  });
  assert.throws(
    () => macroBinding(0, { loopMode: "once", repeatCount: 1 }),
    /ID/,
  );
  assert.throws(
    () => macroBinding(1, { loopMode: "repeat", repeatCount: 256 }),
    /255/,
  );
  assert.throws(() => decodeMacroBinding({ type: 4, a1: 1, a2: 0 }), /循环/);
});
