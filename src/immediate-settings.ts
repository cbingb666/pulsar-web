import {
  PROFILE_COUNT,
  integerInRange,
  validateGlobal,
  validateProfile,
  type DeviceSnapshot,
  type GlobalSettings,
  type ProfileSettings,
} from "./protocol";
import { clone, type WorkspaceProfile } from "./workspace";

type ImmediateGlobalField =
  "pollingRate" | "debounce" | "angleSnap" | "rippleControl" | "motionSync";
type ImmediateGlobalChange = {
  [Field in ImmediateGlobalField]: {
    kind: "global";
    field: Field;
    value: GlobalSettings[Field];
  };
}[ImmediateGlobalField];

export type ImmediateChange =
  | ImmediateGlobalChange
  | { kind: "lod"; value: number }
  | { kind: "activeStage"; value: number }
  | ({ kind: "dpi"; stage: number } & (
      { x: number; y?: number } | { x?: number; y: number }
    ));

export interface ImmediateSettingsClient {
  readonly maxPollingRate: number;
  readActiveProfile(): Promise<number>;
  readGlobalSettings(): Promise<GlobalSettings>;
  readProfile(profile: number): Promise<ProfileSettings>;
  writeGlobalSettings(
    next: GlobalSettings,
    previous: GlobalSettings,
    profile: number,
  ): Promise<GlobalSettings>;
  writeProfile(
    next: ProfileSettings,
    previous: ProfileSettings,
  ): Promise<ProfileSettings>;
}

const globalFields: readonly ImmediateGlobalField[] = [
  "pollingRate",
  "debounce",
  "angleSnap",
  "rippleControl",
  "motionSync",
];

function same(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (
    !left ||
    !right ||
    typeof left !== "object" ||
    typeof right !== "object" ||
    Array.isArray(left) !== Array.isArray(right)
  )
    return false;
  const a = left as Record<string, unknown>;
  const b = right as Record<string, unknown>;
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every((key) => Object.hasOwn(b, key) && same(a[key], b[key]))
  );
}

/** Build a single edit from device readback, never from the editable workspace. */
export function buildImmediateSettings(
  snapshot: DeviceSnapshot,
  change: ImmediateChange,
): DeviceSnapshot {
  const next = clone(snapshot);
  switch (change.kind) {
    case "global":
      if (!globalFields.includes(change.field))
        throw new Error("不支持立即应用此设置");
      validateGlobal(snapshot.global);
      Object.assign(next.global, { [change.field]: change.value });
      validateGlobal(next.global);
      break;
    case "lod":
      validateProfile(snapshot.profile);
      next.profile.lod = change.value;
      validateProfile(next.profile);
      break;
    case "activeStage":
      validateProfile(snapshot.profile);
      next.profile.activeStage = change.value;
      validateProfile(next.profile);
      break;
    case "dpi": {
      validateProfile(snapshot.profile);
      integerInRange(
        change.stage,
        1,
        next.profile.dpiStages.length,
        "DPI stage",
      );
      if (change.x === undefined && change.y === undefined)
        throw new Error("请选择要修改的 DPI 轴");
      const stage = next.profile.dpiStages[change.stage - 1];
      if (change.x !== undefined) stage.x = change.x;
      if (change.y !== undefined) stage.y = change.y;
      validateProfile(next.profile);
      break;
    }
    default:
      throw new Error("不支持立即应用此设置");
  }
  return next;
}

/** Keep other pending edits, including incomplete inputs, after device readback. */
export function mergeImmediateSettings(
  draft: WorkspaceProfile,
  actual: DeviceSnapshot,
  change: ImmediateChange,
): WorkspaceProfile {
  if (draft.profile.profile !== actual.profile.profile)
    throw new Error("立即应用的配置与当前编辑配置不一致");
  const next = clone(draft);
  switch (change.kind) {
    case "global":
      if (!globalFields.includes(change.field))
        throw new Error("不支持立即应用此设置");
      Object.assign(next.global, {
        [change.field]: actual.global[change.field],
      });
      break;
    case "lod":
      next.profile.lod = actual.profile.lod;
      break;
    case "activeStage":
      next.profile.activeStage = actual.profile.activeStage;
      break;
    case "dpi": {
      integerInRange(
        change.stage,
        1,
        Math.min(
          next.profile.dpiStages.length,
          actual.profile.dpiStages.length,
        ),
        "DPI stage",
      );
      const stage = next.profile.dpiStages[change.stage - 1];
      const readback = actual.profile.dpiStages[change.stage - 1];
      if (change.x !== undefined) stage.x = readback.x;
      if (change.y !== undefined) stage.y = readback.y;
      break;
    }
    default:
      throw new Error("不支持立即应用此设置");
  }
  next.pending =
    !!next.dpiLayoutPending ||
    !same(next.global, actual.global) ||
    !same(next.profile, actual.profile);
  return next;
}

/** Write only the chosen field and retain the client's verified device readback. */
export async function applyImmediateSetting(
  client: ImmediateSettingsClient,
  baseline: DeviceSnapshot,
  change: ImmediateChange,
): Promise<DeviceSnapshot> {
  const next = buildImmediateSettings(baseline, change);
  const profile = integerInRange(
    baseline.profile.profile,
    1,
    PROFILE_COUNT,
    "Profile",
  );
  if (baseline.activeProfile !== profile)
    throw new Error("请先切换到目标设备配置，再立即应用设置");
  if (
    change.kind === "global" &&
    next.global.pollingRate > client.maxPollingRate
  )
    throw new Error("当前连接最高支持 1000 Hz；更高轮询率需要 8K 接收器");
  if (
    same(next.global, baseline.global) &&
    same(next.profile, baseline.profile)
  )
    return next;

  if ((await client.readActiveProfile()) !== profile)
    throw new Error("活动配置已经变化，请重新读取后再应用");
  // A physical DPI button or another session can change settings after the
  // last snapshot. In particular, DPI writes replace a whole stage block.
  const fresh =
    change.kind === "global"
      ? await client.readGlobalSettings()
      : await client.readProfile(profile);
  if ((await client.readActiveProfile()) !== profile)
    throw new Error("活动配置已经变化，请重新读取后再应用");
  if (
    !same(fresh, change.kind === "global" ? baseline.global : baseline.profile)
  )
    throw new Error("设备设置已经变化，请重新读取后再应用");
  if (change.kind === "global")
    next.global = await client.writeGlobalSettings(
      next.global,
      clone(baseline.global),
      profile,
    );
  else
    next.profile = await client.writeProfile(
      next.profile,
      clone(baseline.profile),
    );
  if ((await client.readActiveProfile()) !== profile)
    throw new Error("活动配置在写入期间发生变化，请重新读取");
  return next;
}
