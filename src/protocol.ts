/** Sonix protocol implementation. Evidence and upstream MIT attribution: docs/protocol.md. */
export const REPORT_SIZE = 64;
export const VENDOR_ID = 0x3710;
export const SUPPORTED_PRODUCT_IDS = [0x3401, 0x5402, 0x5403] as const;
export const BUTTON_IDS = [1, 2, 3, 4, 5, 11] as const;
export const POLLING_RATES = [125, 250, 500, 1000, 2000, 4000, 8000] as const;
export const DPI_MIN = 50;
export const DPI_MAX = 32000;
export const MAX_DPI_STAGES = 6;
export const PROFILE_COUNT = 6;
export type Rgb = [number, number, number];
export interface ButtonBinding {
  type: number;
  a1: number;
  a2: number;
  a3?: number;
}
export interface DpiStage {
  x: number;
  y: number;
  color: Rgb;
}
export interface GlobalSettings {
  pollingRate: number;
  debounce: number;
  debounceRelease?: number;
  angleSnap: boolean;
  rippleControl: boolean;
  motionSync: boolean;
}
export interface ProfileSettings {
  profile: number;
  dpiStages: DpiStage[];
  activeStage: number;
  lod: number;
  brightness: number;
  ledEffect: "off" | "steady" | "breathe";
  breatheSpeed: number;
  buttons: Record<number, ButtonBinding>;
}
export interface PowerStatus {
  batteryPercent?: number;
  charging: boolean;
  sleepSeconds?: number;
  lowPowerPercent?: number;
  receiverIndicator?: 1 | 2;
}
export interface DeviceSnapshot {
  global: GlobalSettings;
  profile: ProfileSettings;
  power?: PowerStatus;
  activeProfile?: number;
  availableProfiles?: number[];
  firmwareVersion?: string;
  warnings: string[];
}
export interface Command {
  category: number;
  register: number;
  sub: number;
  profile: number;
  payload?: number[];
  echo?: number;
  echoBytes?: Record<number, number>;
  timeoutMs?: number;
}

export function integerInRange(
  value: number,
  min: number,
  max: number,
  label: string,
): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new Error(`${label} must be an integer between ${min} and ${max}`);
  return value;
}
export function checksum(bytes: Uint8Array): number {
  if (bytes.length < 62) throw new Error("Protocol packet is too short");
  return bytes.slice(0, 62).reduce((sum, byte) => sum + byte, 0) & 0xffff;
}
export function buildPacket(
  category: number,
  register: number,
  sub: number,
  profile = 0,
  payload: number[] = [],
): Uint8Array<ArrayBuffer> {
  if (payload.length > 55)
    throw new Error("Payload exceeds the 55-byte packet limit");
  const packet = new Uint8Array(REPORT_SIZE);
  [category, register, sub, profile, ...payload].forEach((value) =>
    integerInRange(value, 0, 255, "Packet byte"),
  );
  packet[1] = category;
  packet[2] = register;
  packet[3] = sub;
  packet[6] = profile;
  packet.set(payload, 7);
  const sum = checksum(packet);
  packet[62] = sum & 255;
  packet[63] = sum >> 8;
  return packet;
}
export function buildCommand(command: Command): Uint8Array<ArrayBuffer> {
  return buildPacket(
    command.category,
    command.register,
    command.sub,
    command.profile,
    command.payload,
  );
}
export function readCommand(
  category: number,
  register: number,
  sub: number,
  profile = 0,
  payload: number[] = [],
  echo?: number,
): Command {
  return { category, register: register | 0x80, sub, profile, payload, echo };
}
export function matchesReply(reply: Uint8Array, command: Command): boolean {
  // The DPI bulk read has a different response sub-register. Do not compare byte 3.
  return (
    reply.length === REPORT_SIZE &&
    reply[0] === 1 &&
    reply[1] === command.category &&
    reply[2] === command.register &&
    (command.profile === 0 || reply[6] === command.profile) &&
    (command.echo === undefined || reply[7] === command.echo) &&
    Object.entries(command.echoBytes ?? {}).every(
      ([index, value]) => reply[Number(index)] === value,
    )
  );
}
export function parseDpiStages(
  reply: Uint8Array,
): Pick<ProfileSettings, "activeStage" | "dpiStages"> {
  if (reply.length !== REPORT_SIZE)
    throw new Error("Invalid DPI response length");
  const count = integerInRange(reply[8], 1, MAX_DPI_STAGES, "DPI stage count");
  const activeStage = integerInRange(reply[7], 1, count, "Active DPI stage");
  const view = new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
  const dpiStages = Array.from({ length: count }, (_, index) => {
    const offset = 9 + index * 5;
    if (reply[offset] !== index + 1) throw new Error("Invalid DPI stage index");
    const x = view.getUint16(offset + 1, true),
      y = view.getUint16(offset + 3, true);
    integerInRange(x, DPI_MIN, DPI_MAX, "DPI X");
    integerInRange(y, DPI_MIN, DPI_MAX, "DPI Y");
    return { x, y, color: [0, 0, 0] as Rgb };
  });
  return { activeStage, dpiStages };
}
export function dpiPayload(stages: DpiStage[], activeStage: number): number[] {
  integerInRange(stages.length, 1, MAX_DPI_STAGES, "DPI stage count");
  integerInRange(activeStage, 1, stages.length, "Active DPI stage");
  const payload = [activeStage, stages.length];
  stages.forEach(({ x, y }, index) => {
    integerInRange(x, DPI_MIN, DPI_MAX, "DPI X");
    integerInRange(y, DPI_MIN, DPI_MAX, "DPI Y");
    if (x % 10 || y % 10) throw new Error("DPI must use 10 DPI increments");
    payload.push(index + 1, x & 255, x >> 8, y & 255, y >> 8);
  });
  return payload;
}
export function validateProfile(profile: ProfileSettings): void {
  integerInRange(profile.profile, 1, PROFILE_COUNT, "Profile");
  dpiPayload(profile.dpiStages, profile.activeStage);
  if (
    !Number.isFinite(profile.lod) ||
    profile.lod < 0.7 ||
    profile.lod > 2 ||
    Math.abs(profile.lod * 10 - Math.round(profile.lod * 10)) > 1e-8
  )
    throw new Error(
      "Lift-off distance must be 0.7–2.0 mm in 0.1 mm increments",
    );
  integerInRange(profile.brightness, 0, 255, "Brightness");
  integerInRange(profile.breatheSpeed, 0, 255, "Breathe speed");
  if (!["off", "steady", "breathe"].includes(profile.ledEffect))
    throw new Error("Invalid LED effect");
  for (const stage of profile.dpiStages) {
    if (!Array.isArray(stage.color) || stage.color.length !== 3)
      throw new Error("Invalid RGB color");
    stage.color.forEach((value) => integerInRange(value, 0, 255, "RGB color"));
  }
  if (
    !profile.buttons ||
    Array.isArray(profile.buttons) ||
    typeof profile.buttons !== "object" ||
    BUTTON_IDS.some((id) => !Object.hasOwn(profile.buttons, id))
  )
    throw new Error("Profile must include every physical button binding");
  for (const [button, binding] of Object.entries(profile.buttons)) {
    if (!binding || typeof binding !== "object" || Array.isArray(binding))
      throw new Error("Invalid button binding");
    if (!BUTTON_IDS.includes(Number(button) as (typeof BUTTON_IDS)[number]))
      throw new Error("Unknown physical button");
    [binding.type, binding.a1, binding.a2, binding.a3 ?? 0].forEach((value) =>
      integerInRange(value, 0, 255, "Button binding"),
    );
    if (![0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14, 255].includes(binding.type))
      throw new Error("Unsupported button binding type");
    if (
      [4, 5, 6].includes(binding.type) &&
      (binding.a1 | (binding.a2 << 8)) === 0
    )
      throw new Error("Macro binding must reference a valid macro ID");
    if (binding.type === 4)
      integerInRange(binding.a3 ?? 0, 1, 255, "Macro repeat count");
    if (binding.type === 9 && binding.a1 === 7) {
      integerInRange(binding.a3 ?? -1, 0, 255, "DPI lock low byte");
      const dpi = (binding.a2 << 8) | (binding.a3 ?? 0);
      integerInRange(dpi, DPI_MIN, DPI_MAX, "DPI lock");
      if (dpi % 10) throw new Error("DPI lock must use 10 DPI increments");
    }
    if (
      binding.type !== 4 &&
      !(binding.type === 9 && binding.a1 === 7) &&
      binding.a3 !== undefined
    )
      throw new Error("This button action does not support a third argument");
  }
  if (
    !Object.values(profile.buttons).some(
      (binding) => binding.type === 1 && binding.a1 === 1,
    )
  )
    throw new Error("Keep at least one button assigned to left click");
}
export function validateGlobal(settings: GlobalSettings): void {
  if (
    !POLLING_RATES.includes(
      settings.pollingRate as (typeof POLLING_RATES)[number],
    )
  )
    throw new Error("Unsupported polling rate");
  integerInRange(settings.debounce, 0, 15, "Debounce");
  for (const key of ["angleSnap", "rippleControl", "motionSync"] as const)
    if (typeof settings[key] !== "boolean") throw new Error(`Invalid ${key}`);
}
export const BUTTON_ACTIONS: {
  id: string;
  label: string;
  binding: ButtonBinding;
}[] = [
  ["left", "左键", 1, 1, 0],
  ["right", "右键", 1, 2, 0],
  ["middle", "中键", 1, 3, 0],
  ["forward", "前进", 1, 5, 0],
  ["back", "后退", 1, 4, 0],
  ["scrollUp", "向上滚动", 3, 1, 0],
  ["scrollDown", "向下滚动", 3, 255, 0],
  ["dpiUp", "DPI +", 9, 1, 0],
  ["dpiDown", "DPI −", 9, 2, 0],
  ["dpiCycle", "切换 DPI", 9, 3, 0],
  ["profileCycle", "向上循环配置", 8, 3, 0],
  ["profileCycleDown", "向下循环配置", 8, 4, 0],
  ["doubleClick", "双击", 14, 1, 0],
  ["playPause", "播放 / 暂停", 13, 0xcd, 0],
  ["nextTrack", "下一曲", 13, 0xb5, 0],
  ["previousTrack", "上一曲", 13, 0xb6, 0],
  ["mute", "静音", 13, 0xe2, 0],
  ["volumeUp", "音量 +", 13, 0xe9, 0],
  ["volumeDown", "音量 −", 13, 0xea, 0],
  ["mediaStop", "停止播放", 13, 0xb7, 0],
  ["mediaPlayer", "媒体播放器", 13, 0x83, 1],
  ["calculator", "计算器", 13, 0x92, 1],
  ["myPC", "我的电脑", 13, 0x94, 1],
  ["home", "浏览器主页", 13, 0x23, 2],
  ["refresh", "刷新", 13, 0x27, 2],
  ["email", "电子邮件", 13, 0x8a, 1],
  ["explorer", "资源管理器", 13, 0x96, 1],
  ["brightnessUp", "屏幕亮度 +", 13, 0x6f, 0],
  ["brightnessDown", "屏幕亮度 −", 13, 0x70, 0],
  ["copy", "复制", 13, 0x1b, 2],
  ["cut", "剪切", 13, 0x1c, 2],
  ["paste", "粘贴", 13, 0x1d, 2],
  ["switchApps", "切换应用", 13, 0xa3, 1],
  ["disabled", "禁用", 0, 0, 0],
].map(([id, label, type, a1, a2]) => ({
  id: String(id),
  label: String(label),
  binding: { type: Number(type), a1: Number(a1), a2: Number(a2) },
}));
export function defaultProfile(profile = 1): ProfileSettings {
  const colors: Rgb[] = [
    [10, 10, 220],
    [0, 0, 220],
    [10, 200, 10],
    [200, 200, 0],
    [200, 96, 0],
    [200, 80, 128],
  ];
  return {
    profile,
    dpiStages: [400, 800, 1600, 3200, 6400, 12800].map((dpi, index) => ({
      x: dpi,
      y: dpi,
      color: colors[index],
    })),
    activeStage: 2,
    lod: 1,
    brightness: 255,
    ledEffect: "steady",
    breatheSpeed: 50,
    buttons: {
      1: { type: 1, a1: 1, a2: 0 },
      2: { type: 1, a1: 2, a2: 0 },
      3: { type: 1, a1: 3, a2: 0 },
      4: { type: 1, a1: 4, a2: 0 },
      5: { type: 1, a1: 5, a2: 0 },
      11: { type: 9, a1: 3, a2: 0 },
    },
  };
}
export function defaultGlobal(): GlobalSettings {
  return {
    pollingRate: 1000,
    debounce: 3,
    angleSnap: false,
    rippleControl: false,
    motionSync: false,
  };
}
export function bindingLabel(binding: ButtonBinding): string {
  const known = BUTTON_ACTIONS.find(
    (action) =>
      action.binding.type === binding.type &&
      action.binding.a1 === binding.a1 &&
      action.binding.a2 === binding.a2,
  );
  if (binding.type === 9 && binding.a1 === 7)
    return `DPI 锁定 ${(binding.a2 << 8) | (binding.a3 ?? 0)}`;
  if ([4, 5, 6].includes(binding.type))
    return `宏 ${binding.a1 | (binding.a2 << 8)} · ${["I", "II", "III"][binding.type - 4]}${binding.type === 4 ? ` × ${binding.a3 ?? 1}` : ""}`;
  return (
    known?.label ??
    (binding.type === 2
      ? `快捷键 ${binding.a1.toString(16)} + ${binding.a2.toString(16)}`
      : `原始映射 ${binding.type}:${binding.a1}:${binding.a2}`)
  );
}

export type DeviceNotification =
  | { type: "profile"; profile: number }
  | { type: "dpi"; stage: number; dpi: number }
  | { type: "signal"; percent: number }
  | { type: "online"; online: boolean }
  | { type: "battery"; charging: boolean; percent: number };
/** Report 5 events from the separate notification interface; data excludes report ID. */
export function parseInputReport(
  reportId: number,
  data: Uint8Array,
): DeviceNotification | null {
  if (reportId !== 5 || data.length < 2) return null;
  if (data[0] === 1 && data[1] >= 1 && data[1] <= PROFILE_COUNT)
    return { type: "profile", profile: data[1] };
  if (
    data[0] === 5 &&
    data.length >= 4 &&
    data[1] >= 1 &&
    data[1] <= MAX_DPI_STAGES
  )
    return { type: "dpi", stage: data[1], dpi: data[2] | (data[3] << 8) };
  if (data[0] === 13 && data[1] <= 100)
    return { type: "signal", percent: data[1] };
  if (data[0] === 8) return { type: "online", online: data[1] === 1 };
  if (data[0] === 7 && data.length >= 3 && data[2] <= 100)
    return { type: "battery", charging: data[1] === 1, percent: data[2] };
  return null;
}

export function dpiLockBinding(dpi: number): ButtonBinding {
  integerInRange(dpi, DPI_MIN, DPI_MAX, "DPI lock");
  if (dpi % 10) throw new Error("DPI lock must use 10 DPI increments");
  return { type: 9, a1: 7, a2: dpi >> 8, a3: dpi & 255 };
}
