import { t } from "./i18n";
import {
  PROFILE_COUNT,
  integerInRange,
  validateGlobal,
  validateProfile,
  type DeviceSnapshot,
  type GlobalSettings,
  type ProfileSettings,
  type Rgb,
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

type ImmediateProfileField =
  | "lod"
  | "activeStage"
  | "brightness"
  | "ledEffect"
  | "breatheSpeed";
type ImmediateProfileChange = {
  [Field in ImmediateProfileField]: {
    kind: Field;
    value: ProfileSettings[Field];
  };
}[ImmediateProfileField];

export type ImmediateChange =
  | ImmediateGlobalChange
  | ImmediateProfileChange
  | {
      kind: "dpiLayout";
      dpiStages: ProfileSettings["dpiStages"];
      activeStage: number;
    }
  | { kind: "color"; stage: number; value: Rgb }
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
        throw new Error(t("不支持立即应用此设置"));
      validateGlobal(snapshot.global);
      Object.assign(next.global, { [change.field]: change.value });
      validateGlobal(next.global);
      break;
    case "lod":
    case "activeStage":
    case "brightness":
    case "ledEffect":
    case "breatheSpeed":
      validateProfile(snapshot.profile);
      Object.assign(next.profile, { [change.kind]: change.value });
      validateProfile(next.profile);
      break;
    case "dpiLayout":
      validateProfile(snapshot.profile);
      next.profile.dpiStages = clone(change.dpiStages);
      next.profile.activeStage = change.activeStage;
      validateProfile(next.profile);
      break;
    case "color":
      validateProfile(snapshot.profile);
      integerInRange(
        change.stage,
        1,
        next.profile.dpiStages.length,
        t("DPI 档位"),
      );
      next.profile.dpiStages[change.stage - 1].color = clone(change.value);
      validateProfile(next.profile);
      break;
    case "dpi": {
      validateProfile(snapshot.profile);
      integerInRange(
        change.stage,
        1,
        next.profile.dpiStages.length,
        t("DPI 档位"),
      );
      if (change.x === undefined && change.y === undefined)
        throw new Error(t("请选择要修改的 DPI 轴"));
      const stage = next.profile.dpiStages[change.stage - 1];
      if (change.x !== undefined) stage.x = change.x;
      if (change.y !== undefined) stage.y = change.y;
      validateProfile(next.profile);
      break;
    }
    default:
      throw new Error(t("不支持立即应用此设置"));
  }
  return next;
}

/** Merge acknowledged edits only while their submitted values remain current. */
export function mergeImmediateSettings(
  draft: WorkspaceProfile,
  actual: DeviceSnapshot,
  change: ImmediateChange,
): WorkspaceProfile {
  if (draft.profile.profile !== actual.profile.profile)
    throw new Error(t("立即应用的配置与当前编辑配置不一致"));
  const next = clone(draft);
  switch (change.kind) {
    case "global":
      if (!globalFields.includes(change.field))
        throw new Error(t("不支持立即应用此设置"));
      if (same(next.global[change.field], change.value))
        Object.assign(next.global, {
          [change.field]: actual.global[change.field],
        });
      break;
    case "lod":
    case "activeStage":
    case "brightness":
    case "ledEffect":
    case "breatheSpeed":
      if (same(next.profile[change.kind], change.value))
        Object.assign(next.profile, {
          [change.kind]: actual.profile[change.kind],
        });
      break;
    case "dpiLayout":
      if (
        same(next.profile.dpiStages, change.dpiStages) &&
        next.profile.activeStage === change.activeStage
      ) {
        next.profile.dpiStages = clone(actual.profile.dpiStages);
        next.profile.activeStage = actual.profile.activeStage;
        next.dpiLayoutPending = false;
      }
      break;
    case "color":
      integerInRange(
        change.stage,
        1,
        actual.profile.dpiStages.length,
        t("DPI 档位"),
      );
      if (same(next.profile.dpiStages[change.stage - 1]?.color, change.value))
        next.profile.dpiStages[change.stage - 1].color = clone(
          actual.profile.dpiStages[change.stage - 1].color,
        );
      break;
    case "dpi": {
      integerInRange(
        change.stage,
        1,
        actual.profile.dpiStages.length,
        t("DPI 档位"),
      );
      const stage = next.profile.dpiStages[change.stage - 1];
      const readback = actual.profile.dpiStages[change.stage - 1];
      if (stage) {
        if (change.x !== undefined && same(stage.x, change.x))
          stage.x = readback.x;
        if (change.y !== undefined && same(stage.y, change.y))
          stage.y = readback.y;
      }
      break;
    }
    default:
      throw new Error(t("不支持立即应用此设置"));
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
    t("配置编号"),
  );
  if (baseline.activeProfile !== profile)
    throw new Error(t("请先切换到目标设备配置，再立即应用设置"));
  if (
    change.kind === "global" &&
    next.global.pollingRate > client.maxPollingRate
  )
    throw new Error(t("当前连接最高支持 1000 Hz；更高轮询率需要 8K 接收器"));
  if (
    same(next.global, baseline.global) &&
    same(next.profile, baseline.profile)
  )
    return next;

  if ((await client.readActiveProfile()) !== profile)
    throw new Error(t("活动配置已经变化，请重新读取后再应用"));
  // A physical DPI button or another session can change settings after the
  // last snapshot. In particular, DPI writes replace a whole stage block.
  const fresh =
    change.kind === "global"
      ? await client.readGlobalSettings()
      : await client.readProfile(profile);
  if ((await client.readActiveProfile()) !== profile)
    throw new Error(t("活动配置已经变化，请重新读取后再应用"));
  if (
    !same(fresh, change.kind === "global" ? baseline.global : baseline.profile)
  )
    throw new Error(t("设备设置已经变化，请重新读取后再应用"));
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
    throw new Error(t("活动配置在写入期间发生变化，请重新读取"));
  return next;
}
