import {
  createMacro,
  validateMacroEvent,
  type Macro,
  type MacroEvent,
} from "./macros";
import { encodeNativeMacro } from "./macro-codec";

// Fusion 1.0.5.4 MainForm.ExportListViewToCSV / DbgcQTtOC6 use unquoted
// ImageIndex,Text[,KeyCode] rows. Text is authoritative; the extra keycode
// can be either Windows virtual-key or HID usage depending on how it was made.
const names: Record<string, string> = {
  Escape: "Esc",
  Enter: "Enter",
  Backspace: "BackSpace",
  Tab: "Tab",
  Space: "Space",
  Minus: "-",
  Equal: "=",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Backquote: "`",
  Comma: ",",
  Period: ".",
  Slash: "/",
  CapsLock: "Caps",
  PrintScreen: "Print",
  ScrollLock: "Scroll",
  Pause: "Pause",
  Insert: "Insert",
  Home: "Home",
  PageUp: "Page Up",
  Delete: "Delete",
  End: "End",
  PageDown: "Page Down",
  ArrowRight: "Right",
  ArrowLeft: "Left",
  ArrowDown: "Down",
  ArrowUp: "Up",
  NumLock: "Num Lock",
  NumpadDivide: "Pad /",
  NumpadMultiply: "Pad *",
  NumpadSubtract: "Pad -",
  NumpadAdd: "Pad +",
  NumpadEnter: "NumEnter",
  NumpadDecimal: "Pad .",
  ContextMenu: "Apps",
  ControlLeft: "LCtrl",
  ShiftLeft: "LShift",
  AltLeft: "LAlt",
  MetaLeft: "LWin",
  ControlRight: "RCtrl",
  ShiftRight: "RShift",
  AltRight: "RAlt",
  MetaRight: "RWin",
  KanaMode: "かたかなひらがなローマ字",
  IntlYen: "￥",
  Convert: "変換",
  NonConvert: "無変換",
  Lang1: "KanaMode",
  Lang2: "HanjaMode",
};
for (let i = 0; i < 26; i++)
  names[`Key${String.fromCharCode(65 + i)}`] = String.fromCharCode(65 + i);
for (let i = 0; i < 10; i++) {
  names[`Digit${i}`] = String(i);
  names[`Numpad${i}`] = `Pad ${i}`;
}
for (let i = 1; i <= 12; i++) names[`F${i}`] = `F${i}`;
const browserCodes = new Map(
  Object.entries(names).map(([code, name]) => [name.toLowerCase(), code]),
);
for (let i = 0; i < 10; i++) browserCodes.set(`d${i}`, `Digit${i}`);
const mouseNames = [
  "LeftButton",
  "MiddleButton",
  "RightButton",
  "BackwardButton",
  "ForwardButton",
];

export function importFusionCsv(text: string, name = "导入的宏"): Macro {
  if (text.length > 2_000_000) throw new Error("CSV 文件超过 2 MB");
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (!lines[0]?.startsWith("ImageIndex,"))
    throw new Error("不是 Pulsar Fusion 宏 CSV 文件");
  if (lines.length > 1001) throw new Error("原版宏最多支持 1000 个事件");
  const events: MacroEvent[] = [];
  lines.slice(1).forEach((line, index) => {
    const comma = line.indexOf(",");
    const image = Number(line.slice(0, comma));
    const rest = line.slice(comma + 1);
    const label = rest.split(",")[0].trim();
    let event: MacroEvent;
    if (comma < 0) throw new Error(`第 ${index + 2} 行格式无效`);
    if (image === 0) {
      const match = label.match(/^(\d+(?:\.\d+)?)\s*s$/);
      if (!match) throw new Error(`第 ${index + 2} 行延迟格式无效`);
      event = {
        type: "delay",
        durationMs: Math.round(Number(match[1]) * 1000),
      };
    } else if (image === 1 || image === 2) {
      const code = rest.startsWith(",")
        ? "Comma"
        : browserCodes.get(label.toLowerCase());
      if (!code)
        throw new Error(`第 ${index + 2} 行包含不支持的键名：${label}`);
      event = { type: "key", action: image === 1 ? "down" : "up", code };
    } else if (image === 3) {
      const mouse = label.match(
        /^(LeftButton|MiddleButton|RightButton|BackwardButton|ForwardButton) (Down|Up)$/i,
      );
      if (mouse)
        event = {
          type: "mouse",
          action: mouse[2].toLowerCase() === "down" ? "down" : "up",
          button: mouseNames.findIndex(
            (n) => n.toLowerCase() === mouse[1].toLowerCase(),
          ),
        };
      else if (/Mouse Point: Wheel(Up|Down)=/.test(label))
        event = {
          type: "wheel",
          direction: label.includes("WheelUp") ? "up" : "down",
        };
      else throw new Error(`第 ${index + 2} 行包含尚未验证的鼠标移动事件`);
    } else throw new Error(`第 ${index + 2} 行事件类型 ${image} 不受支持`);
    events.push(validateMacroEvent(event));
  });
  if (!events.length) throw new Error("CSV 中没有宏事件");
  const macro = {
    ...createMacro(name.replace(/\.csv$/i, "").slice(0, 64) || "导入的宏"),
    events,
  };
  encodeNativeMacro(macro);
  return macro;
}

export function exportFusionCsv(macro: Macro): string {
  encodeNativeMacro(macro);
  const rows = ["ImageIndex,Event,KeyCode"];
  for (const event of macro.events) {
    if (event.type === "delay") rows.push(`0,${event.durationMs / 1000} s`);
    else if (event.type === "key") {
      const name = names[event.code];
      if (!name) throw new Error(`原版 CSV 不支持键码 ${event.code}`);
      if (name === ",")
        throw new Error(
          "原版 CSV 不转义逗号键，无法可靠导入原程序；请使用 JSON 导出",
        );
      rows.push(`${event.action === "down" ? 1 : 2},${name}`);
    } else if (event.type === "mouse")
      rows.push(
        `3,${mouseNames[event.button]} ${event.action === "down" ? "Down" : "Up"}`,
      );
    else
      rows.push(
        `3,Mouse Point: Wheel${event.direction === "up" ? "Up=1" : "Down=-1"}`,
      );
  }
  return rows.join("\r\n") + "\r\n";
}
