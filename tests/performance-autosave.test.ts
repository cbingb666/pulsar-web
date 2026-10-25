import test from "node:test";
import assert from "node:assert/strict";
import { PerformanceAutosave } from "../src/performance-autosave";
import type {
  ImmediateChange,
  ImmediateSettingsClient,
} from "../src/immediate-settings";
import {
  defaultGlobal,
  defaultProfile,
  type DeviceSnapshot,
  type GlobalSettings,
  type ProfileSettings,
} from "../src/protocol";
import { clone } from "../src/workspace";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function snapshot(profile = 2): DeviceSnapshot {
  return {
    global: defaultGlobal(),
    profile: defaultProfile(profile),
    activeProfile: profile,
    availableProfiles: [1, 2, 3, 4, 5, 6],
    warnings: [],
  };
}

function fakeClient(initial: DeviceSnapshot, gate?: ReturnType<typeof deferred>) {
  let state = clone(initial);
  const calls: string[] = [];
  const writes: {
    previous: GlobalSettings | ProfileSettings;
    next: GlobalSettings | ProfileSettings;
  }[] = [];
  const firstWrite = deferred();
  const beforeWrite = async () => {
    if (writes.length === 1) {
      firstWrite.resolve();
      await gate?.promise;
    }
  };
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
      calls.push("writeGlobal");
      assert.equal(profile, state.activeProfile);
      assert.deepEqual(previous, state.global);
      writes.push({ previous: clone(previous), next: clone(next) });
      await beforeWrite();
      state.global = clone(next);
      return clone(state.global);
    },
    async writeProfile(next, previous) {
      calls.push("writeProfile");
      assert.deepEqual(previous, state.profile);
      writes.push({ previous: clone(previous), next: clone(next) });
      await beforeWrite();
      state.profile = clone(next);
      return clone(state.profile);
    },
  };
  return { client, calls, writes, firstWrite, state: () => clone(state) };
}

function harness() {
  const saved: { actual: DeviceSnapshot; change: ImmediateChange }[] = [];
  const errors: { error: unknown; label: string }[] = [];
  const pending: boolean[] = [];
  const idle: (() => void)[] = [];
  const autosave = new PerformanceAutosave({
    onSaved: (actual, change) => saved.push({ actual, change }),
    onError: (error, label) => errors.push({ error, label }),
    onPending: (value) => {
      pending.push(value);
      if (!value) idle.splice(0).forEach((resolve) => resolve());
    },
  });
  return {
    autosave,
    saved,
    errors,
    pending,
    waitForIdle: () =>
      autosave.pending
        ? new Promise<void>((resolve) => idle.push(resolve))
        : Promise.resolve(),
  };
}

test("autosave serializes complete transactions using the previous readback as its next baseline", async () => {
  const initial = snapshot();
  const gate = deferred();
  const fake = fakeClient(initial, gate);
  const h = harness();
  h.autosave.reset(fake.client, initial);
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 100 }, "brightness"), true);
  assert.equal(h.autosave.enqueue({ kind: "ledEffect", value: "breathe" }, "effect"), true);
  await fake.firstWrite.promise;
  assert.equal(h.autosave.pending, true);
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(fake.calls, ["active", "readProfile", "active", "writeProfile"]);

  gate.resolve();
  await h.waitForIdle();
  assert.equal(fake.writes.length, 2);
  assert.deepEqual(fake.writes[1].previous, fake.writes[0].next);
  assert.equal(fake.state().profile.brightness, 100);
  assert.equal(fake.state().profile.ledEffect, "breathe");
  assert.equal(h.saved.length, 2);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.pending, [true, false]);
});

test("rapid edits to the same field retain their FIFO order and final value", async () => {
  const initial = snapshot();
  const gate = deferred();
  const fake = fakeClient(initial, gate);
  const h = harness();
  h.autosave.reset(fake.client, initial);
  for (const value of [80, 120, 160])
    h.autosave.enqueue({ kind: "brightness", value }, "brightness");
  await fake.firstWrite.promise;
  assert.equal(fake.writes.length, 1);
  gate.resolve();
  await h.waitForIdle();
  assert.deepEqual(h.saved.map(({ actual }) => actual.profile.brightness), [80, 120, 160]);
  assert.equal(fake.state().profile.brightness, 160);
  assert.deepEqual(h.errors, []);
});

test("failure drops queued edits and rejects new ones until a fresh reset", async () => {
  const initial = snapshot();
  const gate = deferred();
  const fake = fakeClient(initial, gate);
  const h = harness();
  h.autosave.reset(fake.client, initial);
  h.autosave.enqueue({ kind: "brightness", value: 100 }, "brightness");
  h.autosave.enqueue({ kind: "ledEffect", value: "breathe" }, "effect");
  await fake.firstWrite.promise;
  const failure = new Error("write failed");
  gate.reject(failure);
  await h.waitForIdle();
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(h.saved, []);
  assert.deepEqual(h.errors, [{ error: failure, label: "brightness" }]);
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 120 }, "later"), false);
  assert.equal(h.autosave.pending, false);

  h.autosave.reset(fake.client, fake.state());
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 120 }, "retry"), true);
  await h.waitForIdle();
  assert.equal(fake.state().profile.brightness, 120);
  assert.equal(h.saved.length, 1);
});

test("reset ignores old results and waits for the old transaction before starting the new context", async () => {
  const initial = snapshot();
  const gate = deferred();
  const old = fakeClient(initial, gate);
  const nextBaseline = snapshot(3);
  const next = fakeClient(nextBaseline);
  const h = harness();
  h.autosave.reset(old.client, initial);
  h.autosave.enqueue({ kind: "brightness", value: 100 }, "old");
  h.autosave.enqueue({ kind: "brightness", value: 120 }, "old queued");
  await old.firstWrite.promise;

  h.autosave.reset(next.client, nextBaseline);
  assert.equal(h.autosave.pending, true);
  h.autosave.enqueue({ kind: "global", field: "debounce", value: 9 }, "new");
  assert.deepEqual(next.calls, []);
  assert.deepEqual(h.pending, [true]);
  gate.resolve();
  await h.waitForIdle();
  assert.equal(old.writes.length, 1);
  assert.equal(next.writes.length, 1);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].actual.profile.profile, 3);
  assert.equal(h.saved[0].actual.global.debounce, 9);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.pending, [true, false]);
});

test("an invalidated failure cannot stop queued edits in the replacement context", async () => {
  const initial = snapshot();
  const gate = deferred();
  const old = fakeClient(initial, gate);
  const nextBaseline = snapshot(3);
  const next = fakeClient(nextBaseline);
  const h = harness();
  h.autosave.reset(old.client, initial);
  h.autosave.enqueue({ kind: "brightness", value: 100 }, "old");
  await old.firstWrite.promise;
  h.autosave.reset(next.client, nextBaseline);
  h.autosave.enqueue({ kind: "brightness", value: 120 }, "new");
  gate.reject(new Error("old write failed"));
  await h.waitForIdle();
  assert.deepEqual(h.errors, []);
  assert.equal(h.saved.length, 1);
  assert.equal(h.saved[0].actual.profile.profile, 3);
  assert.equal(next.state().profile.brightness, 120);
});

test("resetting offline clears unsent work while retaining pending until the in-flight transaction settles", async () => {
  const initial = snapshot();
  const gate = deferred();
  const fake = fakeClient(initial, gate);
  const h = harness();
  h.autosave.reset(fake.client, initial);
  h.autosave.enqueue({ kind: "brightness", value: 100 }, "first");
  h.autosave.enqueue({ kind: "brightness", value: 120 }, "queued");
  await fake.firstWrite.promise;
  h.autosave.reset(null, null);
  assert.equal(h.autosave.pending, true);
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 160 }, "offline"), false);
  gate.resolve();
  await h.waitForIdle();
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(h.saved, []);
  assert.deepEqual(h.errors, []);
  assert.deepEqual(h.pending, [true, false]);
});

test("offline initialization, reset and unchanged values never send device commands", async () => {
  const initial = snapshot();
  const fake = fakeClient(initial);
  const h = harness();
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 100 }, "offline"), false);
  h.autosave.reset(fake.client, null);
  assert.equal(h.autosave.enqueue({ kind: "brightness", value: 100 }, "unread"), false);
  h.autosave.reset(fake.client, initial);
  assert.deepEqual(fake.calls, []);
  assert.deepEqual(h.pending, []);
  h.autosave.enqueue({ kind: "brightness", value: initial.profile.brightness }, "unchanged");
  await h.waitForIdle();
  assert.deepEqual(fake.calls, []);
  assert.equal(h.saved.length, 1);
  assert.deepEqual(h.errors, []);
});

test("queued edits and reset baselines are detached from mutable caller data", async () => {
  const initial = snapshot();
  const gate = deferred();
  const fake = fakeClient(initial, gate);
  const h = harness();
  h.autosave.reset(fake.client, initial);
  initial.profile.brightness = 20;
  h.autosave.enqueue({ kind: "brightness", value: 100 }, "brightness");
  const change: ImmediateChange = { kind: "color", stage: 2, value: [20, 40, 60] };
  h.autosave.enqueue(change, "color");
  change.value[0] = 200;
  await fake.firstWrite.promise;
  gate.resolve();
  await h.waitForIdle();
  assert.deepEqual(fake.state().profile.dpiStages[1].color, [20, 40, 60]);
  assert.deepEqual(h.errors, []);
});
