import {
  PROFILE_COUNT,
  defaultGlobal,
  defaultProfile,
  validateGlobal,
  validateProfile,
  type GlobalSettings,
  type ProfileSettings,
} from "./protocol";
export interface WorkspaceProfile {
  pending?: boolean;
  name: string;
  global: GlobalSettings;
  profile: ProfileSettings;
}
export interface ProfileFile {
  format: "pulsar-fusion-web";
  version: 1;
  device: "xlite-v4";
  name: string;
  global: GlobalSettings;
  profile: ProfileSettings;
}
export const clone = <T>(value: T): T => structuredClone(value);
export function makeProfile(index: number): WorkspaceProfile {
  return {
    name: `配置 ${index}`,
    global: defaultGlobal(),
    profile: defaultProfile(index),
  };
}
export function parseProfileFile(
  text: string,
  profileIndex: number,
): WorkspaceProfile {
  if (text.length > 200_000) throw new Error("配置文件过大");
  const file = JSON.parse(text) as ProfileFile;
  if (
    file.format !== "pulsar-fusion-web" ||
    file.version !== 1 ||
    file.device !== "xlite-v4"
  )
    throw new Error("请选择此 Web 版导出的 Xlite v4 配置文件");
  if (typeof file.name !== "string" || file.name.length > 80)
    throw new Error("配置名称无效");
  validateGlobal(file.global);
  validateProfile(file.profile);
  return {
    pending: true,
    name: file.name,
    global: clone(file.global),
    profile: { ...clone(file.profile), profile: profileIndex },
  };
}
export function exportProfileFile(item: WorkspaceProfile): string {
  validateGlobal(item.global);
  validateProfile(item.profile);
  return JSON.stringify(
    {
      format: "pulsar-fusion-web",
      version: 1,
      device: "xlite-v4",
      name: item.name,
      global: item.global,
      profile: item.profile,
    } satisfies ProfileFile,
    null,
    2,
  );
}
export function loadWorkspace(): WorkspaceProfile[] {
  let raw: unknown;
  try {
    raw = JSON.parse(localStorage.getItem("pulsar-workspace-v1") ?? "null");
  } catch {
    raw = null;
  }
  return Array.from({ length: PROFILE_COUNT }, (_, index) => {
    try {
      const p = Array.isArray(raw) ? raw[index] : null;
      if (!p) return makeProfile(index + 1);
      return {
        ...parseProfileFile(
          JSON.stringify({
            format: "pulsar-fusion-web",
            version: 1,
            device: "xlite-v4",
            ...p,
          }),
          index + 1,
        ),
        pending: p.pending === true,
      };
    } catch {
      return makeProfile(index + 1);
    }
  });
}
export function saveWorkspace(profiles: WorkspaceProfile[]): void {
  const previous = loadWorkspace();
  const valid = profiles.map((item, index) => {
    try {
      validateGlobal(item.global);
      validateProfile(item.profile);
      return item;
    } catch {
      return previous[index] ?? makeProfile(index + 1);
    }
  });
  localStorage.setItem("pulsar-workspace-v1", JSON.stringify(valid));
}
export function download(name: string, text: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function keyboardBinding(event: {
  code: string;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  metaKey: boolean;
}) {
  const keys: Record<string, number> = {
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
  };
  let key = keys[event.code];
  if (/^Key[A-Z]$/.test(event.code)) key = event.code.charCodeAt(3) - 61;
  if (/^Digit[0-9]$/.test(event.code))
    key = event.code === "Digit0" ? 39 : Number(event.code.slice(5)) + 29;
  if (/^F([1-9]|1[0-2])$/.test(event.code))
    key = Number(event.code.slice(1)) + 57;
  if (!key) return null;
  return {
    type: 2,
    a1:
      (event.ctrlKey ? 1 : 0) |
      (event.shiftKey ? 2 : 0) |
      (event.altKey ? 4 : 0) |
      (event.metaKey ? 8 : 0),
    a2: key,
  };
}
