import { validateMacroEvent } from "./macros";
import type { Macro, MacroEvent } from "./macros";

// Derived from the supplied Fusion 1.0.5.4 executable, not guessed from USB HID.
// MainForm.f8hSzE51ql writes events; rn7S0ocQy7 reads them. See docs/macro-protocol.md.
export const NATIVE_MACRO_MAX_EVENTS = 1000;
export const NATIVE_MACRO_MAX_REPEAT = 255;

const keyCodes: Record<string, number> = {
  Enter: 40,
  Escape: 41,
  Backspace: 42,
  Tab: 43,
  Space: 44,
  Minus: 45,
  Equal: 46,
  BracketLeft: 47,
  BracketRight: 48,
  Backslash: 49,
  Semicolon: 51,
  Quote: 52,
  Backquote: 53,
  Comma: 54,
  Period: 55,
  Slash: 56,
  CapsLock: 57,
  PrintScreen: 70,
  ScrollLock: 71,
  Pause: 72,
  Insert: 73,
  Home: 74,
  PageUp: 75,
  Delete: 76,
  End: 77,
  PageDown: 78,
  ArrowRight: 79,
  ArrowLeft: 80,
  ArrowDown: 81,
  ArrowUp: 82,
  NumLock: 83,
  NumpadDivide: 84,
  NumpadMultiply: 85,
  NumpadSubtract: 86,
  NumpadAdd: 87,
  NumpadEnter: 88,
  Numpad0: 98,
  NumpadDecimal: 99,
  ContextMenu: 101,
  KanaMode: 136,
  IntlYen: 137,
  Convert: 138,
  NonConvert: 139,
  Lang1: 144,
  Lang2: 145,
};
for (let index = 0; index < 26; index++)
  keyCodes[`Key${String.fromCharCode(65 + index)}`] = 4 + index;
for (let digit = 1; digit <= 9; digit++) {
  keyCodes[`Digit${digit}`] = 29 + digit;
  keyCodes[`Numpad${digit}`] = 88 + digit;
}
keyCodes.Digit0 = 39;
for (let key = 1; key <= 12; key++) keyCodes[`F${key}`] = 57 + key;

const modifiers: Record<string, number> = {
  ControlLeft: 1,
  ShiftLeft: 2,
  AltLeft: 4,
  MetaLeft: 8,
  ControlRight: 16,
  ShiftRight: 32,
  AltRight: 64,
  MetaRight: 128,
};
const keysByCode = new Map(
  Object.entries(keyCodes).map(([code, value]) => [value, code]),
);
const modifiersByMask = new Map(
  Object.entries(modifiers).map(([code, value]) => [value, code]),
);
// Browser button order is left, middle, right, back, forward; native order is bits.
const mouseMasks = [1, 4, 2, 8, 16];

export function encodeNativeMacro(macro: Pick<Macro, "events">): number[] {
  if (!Array.isArray(macro.events) || macro.events.length === 0)
    throw new Error("空宏不能写入设备，请先添加事件。");
  const bytes: number[] = [];
  let eventCount = 0;
  for (const candidate of macro.events) {
    const event = validateMacroEvent(candidate);
    if (event.type === "delay") {
      // Fusion's >16-bit encoder and decoder disagree. Repeated unambiguous
      // u16 delays preserve duration without relying on either disputed opcode.
      let remaining = event.durationMs;
      do {
        const duration = Math.min(remaining, 65535);
        if (duration <= 255) bytes.push(12, duration);
        else bytes.push(13, duration & 255, duration >>> 8);
        remaining -= duration;
        eventCount++;
      } while (remaining > 0);
    } else if (event.type === "key") {
      const modifier = modifiers[event.code];
      const code = keyCodes[event.code];
      if (modifier !== undefined)
        bytes.push(event.action === "down" ? 5 : 6, modifier);
      else if (code !== undefined)
        bytes.push(event.action === "down" ? 3 : 4, code);
      else
        throw new Error(
          `键码 ${event.code} 尚未在原生软件中验证，不能写入设备。`,
        );
      eventCount++;
    } else if (event.type === "mouse") {
      bytes.push(event.action === "down" ? 1 : 2, mouseMasks[event.button]);
      eventCount++;
    } else {
      bytes.push(11, event.direction === "up" ? 1 : 255);
      eventCount++;
    }
    if (eventCount > NATIVE_MACRO_MAX_EVENTS)
      throw new Error(
        `转换后超过原生软件的 ${NATIVE_MACRO_MAX_EVENTS} 个事件上限。`,
      );
  }
  return bytes;
}

export function decodeNativeMacro(
  data: readonly number[] | Uint8Array,
): MacroEvent[] {
  if (
    data.length > NATIVE_MACRO_MAX_EVENTS * 5 ||
    Array.from(data).some(
      (value) => !Number.isInteger(value) || value < 0 || value > 255,
    )
  ) {
    throw new Error("设备宏字节流格式无效或超出原生容量。");
  }
  const events: MacroEvent[] = [];
  let offset = 0;
  function read(): number {
    if (offset >= data.length) throw new Error("设备宏数据被截断。");
    return data[offset++];
  }
  while (offset < data.length) {
    const opcode = read();
    if (opcode === 12) events.push({ type: "delay", durationMs: read() });
    else if (opcode === 13) {
      const low = read();
      events.push({ type: "delay", durationMs: low + 256 * read() });
    } else if (opcode === 3 || opcode === 4) {
      const value = read();
      const code = keysByCode.get(value);
      if (!code)
        throw new Error(`设备宏包含尚未验证的键码 0x${value.toString(16)}。`);
      events.push({ type: "key", action: opcode === 3 ? "down" : "up", code });
    } else if (opcode === 5 || opcode === 6) {
      const mask = read();
      const code = modifiersByMask.get(mask);
      if (!code)
        throw new Error(
          `设备宏包含尚未验证的修饰键组合 0x${mask.toString(16)}。`,
        );
      events.push({ type: "key", action: opcode === 5 ? "down" : "up", code });
    } else if (opcode === 1 || opcode === 2) {
      const mask = read();
      const button = mouseMasks.indexOf(mask);
      if (button === -1)
        throw new Error(
          `设备宏包含尚未验证的鼠标按键组合 0x${mask.toString(16)}。`,
        );
      events.push({
        type: "mouse",
        action: opcode === 1 ? "down" : "up",
        button,
      });
    } else if (opcode === 11) {
      const value = read();
      if (value !== 1 && value !== 255)
        throw new Error("设备宏包含尚未验证的滚轮步进值。");
      events.push({ type: "wheel", direction: value === 1 ? "up" : "down" });
    } else if ([8, 19, 20, 33, 34, 35].includes(opcode)) {
      throw new Error(
        `设备宏使用尚有编码歧义的指令 0x${opcode.toString(16)}，暂不导入，原始数据未修改。`,
      );
    } else
      throw new Error(
        `设备宏包含未知指令 0x${opcode.toString(16)}（偏移 ${offset - 1}）。`,
      );
    if (events.length > NATIVE_MACRO_MAX_EVENTS)
      throw new Error("设备宏超出原生事件数量上限。");
  }
  return events;
}

export interface NativeMacroBinding {
  type: 4 | 5 | 6;
  a1: number;
  a2: number;
  a3?: number;
}

export function macroBinding(
  id: number,
  macro: Pick<Macro, "loopMode" | "repeatCount">,
): NativeMacroBinding {
  if (!Number.isInteger(id) || id < 1 || id > 65535)
    throw new Error("设备宏 ID 必须在 1–65535 之间。");
  const a1 = id & 255;
  const a2 = id >>> 8;
  if (macro.loopMode === "whilePressed") return { type: 5, a1, a2 };
  if (macro.loopMode === "toggle") return { type: 6, a1, a2 };
  if (macro.loopMode !== "once" && macro.loopMode !== "repeat")
    throw new Error("宏循环方式无效。");
  const repeat = macro.loopMode === "once" ? 1 : macro.repeatCount;
  if (
    !Number.isInteger(repeat) ||
    repeat < 1 ||
    repeat > NATIVE_MACRO_MAX_REPEAT
  )
    throw new Error("原生宏的重复次数必须在 1–255 之间。");
  return { type: 4, a1, a2, a3: repeat };
}

export function decodeMacroBinding(
  binding: NativeMacroBinding,
): Pick<Macro, "loopMode" | "repeatCount"> & { deviceId: number } {
  for (const value of [binding.a1, binding.a2])
    if (!Number.isInteger(value) || value < 0 || value > 255)
      throw new Error("宏绑定中的设备 ID 无效。");
  const deviceId = binding.a1 + binding.a2 * 256;
  if (deviceId === 0) throw new Error("宏绑定中的设备 ID 不能为零。");
  if (binding.type === 5)
    return { deviceId, loopMode: "whilePressed", repeatCount: 1 };
  if (binding.type === 6)
    return { deviceId, loopMode: "toggle", repeatCount: 1 };
  if (
    binding.type !== 4 ||
    !Number.isInteger(binding.a3) ||
    binding.a3! < 1 ||
    binding.a3! > 255
  )
    throw new Error("宏绑定中的循环配置无效。");
  return {
    deviceId,
    loopMode: binding.a3 === 1 ? "once" : "repeat",
    repeatCount: binding.a3!,
  };
}
