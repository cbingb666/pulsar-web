import test from "node:test";
import assert from "node:assert/strict";
import {
  applyImmediateSetting,
  buildImmediateSettings,
  mergeImmediateSettings,
  type ImmediateChange,
  type ImmediateSettingsClient,
} from "../src/immediate-settings";
import {
  defaultGlobal,
  defaultProfile,
  type DeviceSnapshot,
  type GlobalSettings,
  type ProfileSettings,
} from "../src/protocol";
import { clone, type WorkspaceProfile } from "../src/workspace";

function snapshot(): DeviceSnapshot {
  return {
    global: defaultGlobal(),
    profile: defaultProfile(2),
    activeProfile: 2,
    availableProfiles: [1, 2, 3, 4, 5, 6],
    power: { batteryPercent: 90, charging: false, sleepSeconds: 60 },
    firmwareVersion: "00.00.10.16",
    warnings: [],
  };
}

function workspace(actual: DeviceSnapshot): WorkspaceProfile {
  return {
    name: "我的配置",
    global: clone(actual.global),
    profile: clone(actual.profile),
  };
}

function fakeClient(baseline: DeviceSnapshot) {
  const calls: string[] = [];
  let state = clone(baseline);
  const client: ImmediateSettingsClient = {
    maxPollingRate: 1000,
    async readActiveProfile() {
      calls.push("active");
      return state.activeProfile!;
    },
    async readGlobalSettings() {
      calls.push("readGlobal");
      return clone(state.global);
    },
    async readProfile(profile) {
      calls.push("readProfile");
      assert.equal(profile, state.profile.profile);
      return clone(state.profile);
    },
    async writeGlobalSettings(next, previous, profile) {
      calls.push("global");
      assert.deepEqual(previous, state.global);
      assert.equal(profile, state.activeProfile);
      state.global = clone(next);
      return clone(state.global);
    },
    async writeProfile(next, previous) {
      calls.push("profile");
      assert.deepEqual(previous, state.profile);
      state.profile = clone(next);
      return clone(state.profile);
    },
  };
  return {
    client,
    calls,
    getState: () => clone(state),
    setState: (next: DeviceSnapshot) => {
      state = clone(next);
    },
  };
}

test("single-field changes clone device state and leave unrelated hardware settings intact", () => {
  const baseline = snapshot();
  const before = clone(baseline);
  const changes: ImmediateChange[] = [
    { kind: "global", field: "pollingRate", value: 500 },
    { kind: "global", field: "debounce", value: 9 },
    { kind: "global", field: "angleSnap", value: !baseline.global.angleSnap },
    {
      kind: "global",
      field: "rippleControl",
      value: !baseline.global.rippleControl,
    },
    { kind: "global", field: "motionSync", value: !baseline.global.motionSync },
    { kind: "lod", value: 1.2 },
    { kind: "activeStage", value: 5 },
    { kind: "brightness", value: 100 },
    { kind: "ledEffect", value: "breathe" },
    { kind: "breatheSpeed", value: 80 },
    { kind: "color", stage: 2, value: [20, 40, 60] },
    {
      kind: "dpiLayout",
      dpiStages: baseline.profile.dpiStages.slice(0, 4),
      activeStage: 3,
    },
    { kind: "dpi", stage: 3, x: 1700 },
    { kind: "dpi", stage: 3, y: 1800 },
    { kind: "dpi", stage: 3, x: 1900, y: 2000 },
  ];
  for (const change of changes) {
    const expected = clone(baseline);
    if (change.kind === "global")
      Object.assign(expected.global, { [change.field]: change.value });
    else if (change.kind === "dpi") {
      if (change.x !== undefined)
        expected.profile.dpiStages[change.stage - 1].x = change.x;
      if (change.y !== undefined)
        expected.profile.dpiStages[change.stage - 1].y = change.y;
    } else if (change.kind === "color")
      expected.profile.dpiStages[change.stage - 1].color = clone(change.value);
    else if (change.kind === "dpiLayout") {
      expected.profile.dpiStages = clone(change.dpiStages);
      expected.profile.activeStage = change.activeStage;
    } else Object.assign(expected.profile, { [change.kind]: change.value });
    const actual = buildImmediateSettings(baseline, change);
    assert.deepEqual(actual, expected);
    assert.notEqual(actual.profile.buttons, baseline.profile.buttons);
  }
  assert.deepEqual(baseline, before);
});

test("removing and adding DPI stages saves only the explicit layout and clears its pending flag", async () => {
  let baseline = snapshot();
  baseline.profile.activeStage = 6;
  const fake = fakeClient(baseline);
  const draft = workspace(baseline);
  draft.pending = true;
  draft.dpiLayoutPending = true;
  draft.profile.buttons[5] = { type: 2, a1: 1, a2: 6 };
  draft.profile.brightness = 80;
  draft.global.debounce = 10;
  const changes: Extract<ImmediateChange, { kind: "dpiLayout" }>[] = [
    {
      kind: "dpiLayout",
      dpiStages: baseline.profile.dpiStages.slice(0, 5),
      activeStage: 5,
    },
    {
      kind: "dpiLayout",
      dpiStages: [
        ...baseline.profile.dpiStages.slice(0, 5),
        { x: 1200, y: 1600, color: [25, 50, 75] },
      ],
      activeStage: 5,
    },
  ];
  for (const change of changes) {
    const actual = await applyImmediateSetting(fake.client, baseline, change);
    assert.deepEqual(actual.profile.dpiStages, change.dpiStages);
    assert.equal(actual.profile.activeStage, 5);
    assert.deepEqual(actual.profile.buttons, baseline.profile.buttons);
    assert.equal(actual.profile.brightness, baseline.profile.brightness);
    assert.deepEqual(actual.global, baseline.global);
    assert.deepEqual(actual.power, baseline.power);
    const submitted = clone(draft);
    submitted.profile.dpiStages = clone(change.dpiStages);
    submitted.profile.activeStage = change.activeStage;
    const merged = mergeImmediateSettings(submitted, actual, change);
    assert.deepEqual(merged.profile.dpiStages, change.dpiStages);
    assert.equal(merged.profile.activeStage, 5);
    assert.equal(merged.dpiLayoutPending, false);
    assert.equal(merged.pending, true);
    assert.deepEqual(merged.profile.buttons, draft.profile.buttons);
    assert.equal(merged.profile.brightness, 80);
    assert.equal(merged.global.debounce, 10);
    baseline = actual;
  }
  assert.deepEqual(fake.calls, [
    "active",
    "readProfile",
    "active",
    "profile",
    "active",
    "active",
    "readProfile",
    "active",
    "profile",
    "active",
  ]);
  assert.equal(draft.dpiLayoutPending, true);
  assert.equal(draft.profile.dpiStages.length, 6);
});

test("stage colors and lighting save without flushing other drafts or clearing an imported layout", async () => {
  const baseline = snapshot();
  const draft = workspace(baseline);
  draft.pending = true;
  draft.dpiLayoutPending = true;
  draft.profile.buttons[5] = { type: 2, a1: 1, a2: 6 };
  draft.profile.dpiStages[0].x = Number.NaN;
  draft.global.debounce = 10;
  const before = clone(draft);
  const changes: ImmediateChange[] = [
    { kind: "color", stage: 2, value: [20, 40, 60] },
    { kind: "brightness", value: 100 },
    { kind: "ledEffect", value: "breathe" },
    { kind: "breatheSpeed", value: 80 },
  ];
  for (const change of changes) {
    const fake = fakeClient(baseline);
    const actual = await applyImmediateSetting(fake.client, baseline, change);
    const expectedDevice = clone(baseline);
    const expectedDraft = clone(draft);
    if (change.kind === "color") {
      expectedDevice.profile.dpiStages[change.stage - 1].color = clone(
        change.value,
      );
      expectedDraft.profile.dpiStages[change.stage - 1].color = clone(
        change.value,
      );
    } else if (
      change.kind === "brightness" ||
      change.kind === "ledEffect" ||
      change.kind === "breatheSpeed"
    ) {
      Object.assign(expectedDevice.profile, { [change.kind]: change.value });
      Object.assign(expectedDraft.profile, { [change.kind]: change.value });
    } else throw new Error("Expected color or lighting edit");
    assert.deepEqual(fake.getState(), expectedDevice);
    assert.deepEqual(
      mergeImmediateSettings(expectedDraft, actual, change),
      expectedDraft,
    );
    assert.deepEqual(fake.calls, [
      "active",
      "readProfile",
      "active",
      "profile",
      "active",
    ]);
  }
  assert.deepEqual(draft, before);
});

test("immediate save preserves pending bindings, LED, other globals, DPI axes and stages", async () => {
  const baseline = snapshot();
  const draft = workspace(baseline);
  draft.profile.buttons[5] = { type: 2, a1: 1, a2: 6 };
  draft.profile.brightness = 80;
  draft.profile.ledEffect = "breathe";
  draft.profile.dpiStages[1].color = [30, 60, 90];
  draft.profile.dpiStages[1].y = 900;
  draft.profile.dpiStages[1].x = 1200;
  draft.profile.dpiStages[3].x = 3330;
  draft.global.debounce = 10;
  draft.pending = true;
  const before = clone(draft);
  const fake = fakeClient(baseline);
  const change: ImmediateChange = { kind: "dpi", stage: 2, x: 1200 };
  const actual = await applyImmediateSetting(fake.client, baseline, change);
  assert.deepEqual(fake.getState().profile.buttons, baseline.profile.buttons);
  assert.deepEqual(fake.getState().power, baseline.power);
  assert.deepEqual(fake.getState().global, baseline.global);
  assert.deepEqual(fake.getState().profile.dpiStages[1], {
    ...baseline.profile.dpiStages[1],
    x: 1200,
  });
  const merged = mergeImmediateSettings(draft, actual, change);
  const expected = clone(draft);
  expected.profile.dpiStages[1].x = 1200;
  assert.deepEqual(merged, expected);
  assert.deepEqual(draft, before);
  assert.equal(merged.pending, true);
});

test("merge updates only fields the user explicitly saved, retaining even invalid unrelated drafts", () => {
  const baseline = snapshot();
  const draft = workspace(baseline);
  draft.profile.dpiStages[0].x = Number.NaN;
  draft.profile.buttons[1] = { type: 0, a1: 0, a2: 0 };
  draft.profile.lod = 0;
  draft.global.debounce = 8;
  const change: ImmediateChange = {
    kind: "global",
    field: "debounce",
    value: 8,
  };
  const actual = buildImmediateSettings(baseline, change);
  const merged = mergeImmediateSettings(draft, actual, change);
  assert.equal(merged.global.debounce, 8);
  assert.equal(Number.isNaN(merged.profile.dpiStages[0].x), true);
  assert.deepEqual(merged.profile.buttons[1], draft.profile.buttons[1]);
  assert.equal(merged.profile.lod, 0);
  assert.equal(merged.pending, true);
});

test("merging the only pending edit clears pending without losing the workspace name", () => {
  const baseline = snapshot();
  const draft = workspace(baseline);
  draft.pending = true;
  draft.profile.activeStage = 4;
  const change: ImmediateChange = { kind: "activeStage", value: 4 };
  const merged = mergeImmediateSettings(
    draft,
    buildImmediateSettings(baseline, change),
    change,
  );
  assert.equal(merged.pending, false);
  assert.equal(merged.name, draft.name);
});

test("late readback retains newer global, profile, and lighting edits and recomputes pending", () => {
  const baseline = snapshot();
  const cases: {
    change: ImmediateChange;
    edit: (draft: WorkspaceProfile) => void;
  }[] = [
    {
      change: { kind: "global", field: "debounce", value: 8 },
      edit: (draft) => { draft.global.debounce = 10; },
    },
    {
      change: { kind: "global", field: "motionSync", value: true },
      edit: (draft) => { draft.global.motionSync = false; },
    },
    {
      change: { kind: "lod", value: 1.2 },
      edit: (draft) => { draft.profile.lod = 1.4; },
    },
    {
      change: { kind: "activeStage", value: 4 },
      edit: (draft) => { draft.profile.activeStage = 5; },
    },
    {
      change: { kind: "brightness", value: 100 },
      edit: (draft) => { draft.profile.brightness = 120; },
    },
    {
      change: { kind: "ledEffect", value: "breathe" },
      edit: (draft) => { draft.profile.ledEffect = "off"; },
    },
    {
      change: { kind: "breatheSpeed", value: 80 },
      edit: (draft) => { draft.profile.breatheSpeed = 100; },
    },
  ];
  for (const { change, edit } of cases) {
    const actual = buildImmediateSettings(baseline, change);
    const draft = workspace(actual);
    edit(draft);
    const before = clone(draft);
    const merged = mergeImmediateSettings(draft, actual, change);
    assert.deepEqual(merged, { ...before, pending: true });
    assert.deepEqual(draft, before);
  }
});

test("late DPI and color readback preserves newer input, including an incomplete numeric edit", () => {
  const baseline = snapshot();
  const change: ImmediateChange = { kind: "dpi", stage: 2, x: 1000, y: 1200 };
  const actual = buildImmediateSettings(baseline, change);
  const draft = workspace(actual);
  draft.profile.dpiStages[1].x = Number.NaN;
  draft.pending = true;
  const merged = mergeImmediateSettings(draft, actual, change);
  assert.equal(Number.isNaN(merged.profile.dpiStages[1].x), true);
  assert.equal(merged.profile.dpiStages[1].y, 1200);
  assert.equal(merged.pending, true);
  assert.deepEqual(merged.profile.buttons, draft.profile.buttons);

  const colorChange: ImmediateChange = { kind: "color", stage: 2, value: [20, 40, 60] };
  const colorActual = buildImmediateSettings(baseline, colorChange);
  const colorDraft = workspace(colorActual);
  colorDraft.profile.dpiStages[1].color = [5, 10, 15];
  const colorMerged = mergeImmediateSettings(colorDraft, colorActual, colorChange);
  assert.deepEqual(colorMerged.profile.dpiStages[1].color, [5, 10, 15]);
  assert.equal(colorMerged.pending, true);
});

test("late layout readback cannot erase a newer layout, active stage, color, or incomplete DPI value", () => {
  const baseline = snapshot();
  const change: ImmediateChange = {
    kind: "dpiLayout",
    dpiStages: baseline.profile.dpiStages.slice(0, 5),
    activeStage: 5,
  };
  const actual = buildImmediateSettings(baseline, change);
  const edits = [
    (draft: WorkspaceProfile) => {
      draft.profile.dpiStages.pop();
      draft.profile.activeStage = 4;
    },
    (draft: WorkspaceProfile) => { draft.profile.activeStage = 4; },
    (draft: WorkspaceProfile) => { draft.profile.dpiStages[0].color = [1, 2, 3]; },
    (draft: WorkspaceProfile) => { draft.profile.dpiStages[0].x = Number.NaN; },
  ];
  for (const edit of edits) {
    const draft = workspace(actual);
    draft.dpiLayoutPending = true;
    draft.pending = true;
    edit(draft);
    const before = clone(draft);
    const merged = mergeImmediateSettings(draft, actual, change);
    assert.deepEqual(merged, before);
    assert.equal(merged.dpiLayoutPending, true);
    assert.equal(merged.pending, true);
    assert.deepEqual(draft, before);
  }
});

test("readback for a removed DPI stage leaves the newer layout intact", () => {
  const baseline = snapshot();
  for (const change of [
    { kind: "dpi", stage: 6, x: 500 },
    { kind: "color", stage: 6, value: [20, 40, 60] },
  ] satisfies ImmediateChange[]) {
    const actual = buildImmediateSettings(baseline, change);
    const draft = workspace(actual);
    draft.profile.dpiStages = draft.profile.dpiStages.slice(0, 4);
    draft.dpiLayoutPending = true;
    draft.pending = true;
    const merged = mergeImmediateSettings(draft, actual, change);
    assert.deepEqual(merged, draft);
  }
});

test("only an explicit layout save clears an imported DPI layout's pending state", () => {
  const baseline = snapshot();
  const draft = {
    ...workspace(baseline),
    dpiLayoutPending: true,
    pending: true,
  };
  for (const change of [
    { kind: "global", field: "pollingRate", value: 500 },
    { kind: "dpi", stage: 1, x: 500 },
    { kind: "color", stage: 1, value: [20, 40, 60] },
    { kind: "brightness", value: 80 },
  ] satisfies ImmediateChange[]) {
    const actual = buildImmediateSettings(baseline, change);
    const submitted = {
      ...workspace(actual),
      dpiLayoutPending: true,
      pending: true,
    };
    const merged = mergeImmediateSettings(
      submitted,
      actual,
      change,
    );
    assert.equal(merged.pending, true);
    assert.equal(merged.dpiLayoutPending, true);
  }
  const confirmed = mergeImmediateSettings(draft, baseline, {
    kind: "dpiLayout",
    dpiStages: clone(baseline.profile.dpiStages),
    activeStage: baseline.profile.activeStage,
  });
  assert.equal(confirmed.pending, false);
  assert.equal(confirmed.dpiLayoutPending, false);
});

test("validation rejects invalid changes before any device I/O", async () => {
  const invalid = [
    { kind: "global", field: "pollingRate", value: 300 },
    { kind: "global", field: "pollingRate", value: 8000 },
    { kind: "global", field: "debounce", value: 16 },
    { kind: "global", field: "motionSync", value: 1 },
    { kind: "global", field: "debounceRelease", value: 1 },
    { kind: "lod", value: 1.05 },
    { kind: "lod", value: Number.NaN },
    { kind: "activeStage", value: 7 },
    { kind: "dpi", stage: 0, x: 800 },
    { kind: "dpi", stage: 7, y: 800 },
    { kind: "dpi", stage: 2 },
    { kind: "dpi", stage: 2, x: 55 },
    { kind: "dpi", stage: 2, y: 32010 },
    { kind: "dpi", stage: 2, x: Number.NaN },
    { kind: "brightness", value: -1 },
    { kind: "brightness", value: 256 },
    { kind: "ledEffect", value: "rainbow" },
    { kind: "breatheSpeed", value: Number.NaN },
    { kind: "breatheSpeed", value: 256 },
    { kind: "color", stage: 0, value: [20, 40, 60] },
    { kind: "color", stage: 7, value: [20, 40, 60] },
    { kind: "color", stage: 2, value: [20, 256, 60] },
    { kind: "color", stage: 2, value: [20, 40] },
    { kind: "dpiLayout", dpiStages: [], activeStage: 1 },
    { kind: "dpiLayout", dpiStages: defaultProfile().dpiStages, activeStage: 0 },
    {
      kind: "dpiLayout",
      dpiStages: defaultProfile().dpiStages.slice(0, 5),
      activeStage: 6,
    },
    {
      kind: "dpiLayout",
      dpiStages: [...defaultProfile().dpiStages, defaultProfile().dpiStages[0]],
      activeStage: 1,
    },
    {
      kind: "dpiLayout",
      dpiStages: [{ x: 55, y: 800, color: [20, 40, 60] }],
      activeStage: 1,
    },
    { kind: "reset" },
  ];
  for (const change of invalid) {
    const baseline = snapshot();
    const fake = fakeClient(baseline);
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, change as ImmediateChange),
    );
    assert.deepEqual(fake.calls, [], JSON.stringify(change));
    assert.deepEqual(fake.getState(), baseline);
  }
});

test("unchanged settings do not write or issue unnecessary reads", async () => {
  const baseline = snapshot();
  const fake = fakeClient(baseline);
  for (const change of [
    { kind: "global", field: "debounce", value: baseline.global.debounce },
    { kind: "lod", value: baseline.profile.lod },
    { kind: "activeStage", value: baseline.profile.activeStage },
    { kind: "dpi", stage: 1, x: baseline.profile.dpiStages[0].x },
    { kind: "brightness", value: baseline.profile.brightness },
    { kind: "ledEffect", value: baseline.profile.ledEffect },
    { kind: "breatheSpeed", value: baseline.profile.breatheSpeed },
    { kind: "color", stage: 1, value: clone(baseline.profile.dpiStages[0].color) },
    {
      kind: "dpiLayout",
      dpiStages: clone(baseline.profile.dpiStages),
      activeStage: baseline.profile.activeStage,
    },
  ] satisfies ImmediateChange[])
    assert.deepEqual(
      await applyImmediateSetting(fake.client, baseline, change),
      baseline,
    );
  assert.deepEqual(fake.calls, []);
});

test("global edits pass the pinned profile and readback is guarded before and after writing", async () => {
  const baseline = snapshot();
  const fake = fakeClient(baseline);
  const next = await applyImmediateSetting(fake.client, baseline, {
    kind: "global",
    field: "pollingRate",
    value: 500,
  });
  assert.deepEqual(fake.calls, [
    "active",
    "readGlobal",
    "active",
    "global",
    "active",
  ]);
  assert.equal(next.global.pollingRate, 500);
  assert.deepEqual(next.profile, baseline.profile);
});

test("profile edits read back only the profile, preserving global and power state", async () => {
  const baseline = snapshot();
  const fake = fakeClient(baseline);
  const next = await applyImmediateSetting(fake.client, baseline, {
    kind: "lod",
    value: 1.2,
  });
  assert.deepEqual(fake.calls, [
    "active",
    "readProfile",
    "active",
    "profile",
    "active",
  ]);
  assert.equal(next.profile.lod, 1.2);
  assert.deepEqual(next.global, baseline.global);
  assert.deepEqual(next.power, baseline.power);
});

test("a stored or unknown active profile is rejected before I/O", async () => {
  for (const activeProfile of [1, undefined]) {
    const baseline = { ...snapshot(), activeProfile };
    const fake = fakeClient(baseline);
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, { kind: "lod", value: 1.2 }),
      /请先切换到目标设备配置/,
    );
    assert.deepEqual(fake.calls, []);
  }
});

test("an active profile change before writing prevents writes", async () => {
  const baseline = snapshot();
  const fake = fakeClient(baseline);
  fake.setState({ ...baseline, activeProfile: 3 });
  await assert.rejects(
    applyImmediateSetting(fake.client, baseline, { kind: "lod", value: 1.2 }),
    /活动配置已经变化/,
  );
  assert.deepEqual(fake.calls, ["active"]);
});

test("a profile change during a write rejects success and leaves caller state untouched", async () => {
  for (const change of [
    { kind: "global", field: "debounce", value: 8 },
    { kind: "lod", value: 1.2 },
  ] as const) {
    const baseline = snapshot();
    const before = clone(baseline);
    const fake = fakeClient(baseline);
    const original = fake.client.readActiveProfile;
    let reads = 0;
    fake.client.readActiveProfile = async () => (++reads <= 2 ? original() : 3);
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, change),
      /活动配置在写入期间发生变化/,
    );
    assert.deepEqual(baseline, before);
  }
});

test("external profile changes stop every profile performance write before it can overwrite them", async () => {
  const baseline = snapshot();
  const external = clone(baseline);
  external.profile.activeStage = 5;
  for (const change of [
    { kind: "dpi", stage: 1, x: 500 },
    { kind: "color", stage: 1, value: [20, 40, 60] },
    { kind: "brightness", value: 80 },
    { kind: "ledEffect", value: "breathe" },
    { kind: "breatheSpeed", value: 80 },
    {
      kind: "dpiLayout",
      dpiStages: baseline.profile.dpiStages.slice(0, 4),
      activeStage: 2,
    },
  ] satisfies ImmediateChange[]) {
    const fake = fakeClient(baseline);
    fake.setState(external);
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, change),
      /设备设置已经变化，请重新读取后再应用/,
    );
    assert.deepEqual(fake.calls, ["active", "readProfile", "active"]);
    assert.deepEqual(fake.getState(), external);
  }
});

test("changes to other global settings stop immediate writes until device settings are refreshed", async () => {
  const baseline = snapshot();
  const fake = fakeClient(baseline);
  const external = clone(baseline);
  external.global.motionSync = !baseline.global.motionSync;
  fake.setState(external);
  await assert.rejects(
    applyImmediateSetting(fake.client, baseline, {
      kind: "global",
      field: "debounce",
      value: 8,
    }),
    /设备设置已经变化，请重新读取后再应用/,
  );
  assert.deepEqual(fake.calls, ["active", "readGlobal", "active"]);
  assert.deepEqual(fake.getState(), external);
});

test("an active profile change while reading fresh settings prevents all writes", async () => {
  for (const change of [
    { kind: "global", field: "debounce", value: 8 },
    { kind: "lod", value: 1.2 },
  ] as const) {
    const baseline = snapshot();
    const fake = fakeClient(baseline);
    const original = fake.client.readActiveProfile;
    let reads = 0;
    fake.client.readActiveProfile = async () =>
      ++reads === 1 ? original() : 3;
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, change),
      /活动配置已经变化/,
    );
    assert.deepEqual(fake.getState(), baseline);
    assert.equal(
      fake.calls.includes("global") || fake.calls.includes("profile"),
      false,
    );
  }
});

test("failed writes propagate without changing the baseline or reporting a saved value", async () => {
  const baseline = snapshot();
  const before = clone(baseline);
  const fake = fakeClient(baseline);
  fake.client.writeProfile = async (next: ProfileSettings) => {
    next.lod = 1.9;
    throw new Error("device readback mismatch");
  };
  for (const change of [
    { kind: "lod", value: 1.2 },
    { kind: "color", stage: 1, value: [20, 40, 60] },
    { kind: "brightness", value: 80 },
    { kind: "ledEffect", value: "breathe" },
    { kind: "breatheSpeed", value: 80 },
    {
      kind: "dpiLayout",
      dpiStages: baseline.profile.dpiStages.slice(0, 4),
      activeStage: 2,
    },
  ] satisfies ImmediateChange[])
    await assert.rejects(
      applyImmediateSetting(fake.client, baseline, change),
      /device readback mismatch/,
    );
  fake.client.writeGlobalSettings = async (next: GlobalSettings) => {
    next.debounce = 0;
    throw new Error("disconnected");
  };
  await assert.rejects(
    applyImmediateSetting(fake.client, baseline, {
      kind: "global",
      field: "debounce",
      value: 8,
    }),
    /disconnected/,
  );
  assert.deepEqual(baseline, before);
});

test("merge rejects a different profile instead of copying settings into another draft", () => {
  const baseline = snapshot();
  const draft = workspace(baseline);
  draft.profile.profile = 3;
  assert.throws(
    () => mergeImmediateSettings(draft, baseline, { kind: "lod", value: 1.2 }),
    /配置不一致/,
  );
});
