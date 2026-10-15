export type MacroAction = "down" | "up";
export type MacroLoopMode = "once" | "repeat" | "whilePressed" | "toggle";
export type MacroEvent =
  | { type: "key"; action: MacroAction; code: string }
  | { type: "mouse"; action: MacroAction; button: number }
  | { type: "wheel"; direction: "up" | "down" }
  | { type: "delay"; durationMs: number };

export interface Macro {
  id: string;
  name: string;
  events: MacroEvent[];
  loopMode: MacroLoopMode;
  repeatCount: number;
}

export const MACRO_LIMITS = {
  macros: 128,
  events: 2048,
  delayMs: 600_000,
  repeatCount: 65_535,
  fileBytes: 2_000_000,
} as const;
const loopModes: MacroLoopMode[] = ["once", "repeat", "whilePressed", "toggle"];

export function createMacro(name = "新建宏"): Macro {
  return {
    id: crypto.randomUUID(),
    name,
    events: [],
    loopMode: "once",
    repeatCount: 1,
  };
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("宏文件中的数据格式无效。");
  return value as Record<string, unknown>;
}

function integer(
  value: unknown,
  min: number,
  max: number,
  label: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(`${label}必须是 ${min}–${max} 之间的整数。`);
  }
  return value;
}

function textValue(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new Error(`${label}不能为空，且不能超过 ${max} 个字符。`);
  return value;
}

export function validateMacroEvent(value: unknown): MacroEvent {
  const event = record(value);
  if (event.type === "delay")
    return {
      type: "delay",
      durationMs: integer(event.durationMs, 0, MACRO_LIMITS.delayMs, "延迟"),
    };
  if (event.type === "wheel") {
    if (event.direction !== "up" && event.direction !== "down")
      throw new Error("滚轮方向无效。");
    return { type: "wheel", direction: event.direction };
  }
  if (event.action !== "down" && event.action !== "up")
    throw new Error("按键事件必须指定按下或松开。");
  if (event.type === "key") {
    const code = textValue(event.code, 40, "键码");
    if (!/^[A-Za-z][A-Za-z0-9]*$/.test(code))
      throw new Error("键码格式无效，请使用 KeyA、Space 等浏览器键码。");
    return { type: "key", code, action: event.action };
  }
  if (event.type === "mouse")
    return {
      type: "mouse",
      button: integer(event.button, 0, 4, "鼠标按键"),
      action: event.action,
    };
  throw new Error("宏文件包含不支持的事件类型。");
}

export function validateMacros(value: unknown): Macro[] {
  if (!Array.isArray(value) || value.length > MACRO_LIMITS.macros)
    throw new Error(
      `宏列表格式无效，最多支持 ${MACRO_LIMITS.macros} 个本地宏。`,
    );
  const ids = new Set<string>();
  return value.map((item) => {
    const macro = record(item);
    const id = textValue(macro.id, 100, "宏 ID");
    if (ids.has(id)) throw new Error("宏文件包含重复的 ID。");
    ids.add(id);
    if (!loopModes.includes(macro.loopMode as MacroLoopMode))
      throw new Error("宏循环方式无效。");
    if (
      !Array.isArray(macro.events) ||
      macro.events.length > MACRO_LIMITS.events
    )
      throw new Error(`每个宏最多支持 ${MACRO_LIMITS.events} 个本地事件。`);
    return {
      id,
      name: textValue(macro.name, 64, "宏名称"),
      events: macro.events.map(validateMacroEvent),
      loopMode: macro.loopMode as MacroLoopMode,
      repeatCount: integer(
        macro.repeatCount,
        1,
        MACRO_LIMITS.repeatCount,
        "重复次数",
      ),
    };
  });
}

export function parseMacros(json: string): Macro[] {
  if (new TextEncoder().encode(json).length > MACRO_LIMITS.fileBytes)
    throw new Error("宏文件超过 2 MB，无法导入。");
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("无法读取 JSON，请选择本应用导出的宏文件。");
  }
  const document = record(value);
  if (document.format !== "pulsar-fusion-web-macros" || document.version !== 1)
    throw new Error("宏文件格式或版本不受支持。");
  return validateMacros(document.macros);
}

export function serializeMacros(macros: Macro[]): string {
  return JSON.stringify(
    {
      format: "pulsar-fusion-web-macros",
      version: 1,
      macros: validateMacros(macros),
    },
    null,
    2,
  );
}

export function moveMacroEvent(
  events: MacroEvent[],
  index: number,
  direction: -1 | 1,
): MacroEvent[] {
  const destination = index + direction;
  if (
    index < 0 ||
    index >= events.length ||
    destination < 0 ||
    destination >= events.length
  )
    return events;
  const result = [...events];
  [result[index], result[destination]] = [result[destination], result[index]];
  return result;
}

export function describeMacroEvent(event: MacroEvent): string {
  if (event.type === "delay") return `等待 ${event.durationMs} ms`;
  if (event.type === "wheel")
    return `滚轮 · ${event.direction === "up" ? "向上" : "向下"}`;
  const buttonNames = ["左键", "中键", "右键", "后退键", "前进键"];
  const name = event.type === "key" ? event.code : buttonNames[event.button];
  return `${name} · ${event.action === "down" ? "按下" : "松开"}`;
}

export function macroDurationMs(macro: Macro): number {
  return macro.events.reduce(
    (sum, event) => sum + (event.type === "delay" ? event.durationMs : 0),
    0,
  );
}
