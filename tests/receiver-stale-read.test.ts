import test from "node:test";
import assert from "node:assert/strict";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { buildCommand, checksum, readCommand } from "../src/protocol";

// Reproduces browser evidence: the 07/84 angle read repeatedly exposes the
// identical, already completed 04/83 debounce response until a new read SET.
function completed(request: Uint8Array, patch: Record<number, number> = {}) {
  const response = request.slice();
  response[0] = 1;
  for (const [offset, value] of Object.entries(patch)) response[Number(offset)] = value;
  const sum = checksum(response);
  response[62] = sum & 255;
  response[63] = sum >> 8;
  return response;
}

const DEBOUNCE = readCommand(4, 3, 3);
const ANGLE = readCommand(7, 4, 2);
const EXPECTED_GLOBAL = {
  pollingRate: 8000, debounce: 0, angleSnap: true,
  rippleControl: false, motionSync: false,
};
// Recovery needs 30 real timer polls plus fixed 50 ms waits on both sides of
// the resend. Leave scheduling headroom under the parallel suite; deadline
// rejection tests retain their deliberately short budgets.
const RECOVERY_TIMEOUT_MS = 1000;

function staleReceiver(options: {
  category?: number;
  register?: number;
  productId?: number;
  releaseAfterSend?: number;
  timeoutMs?: number;
  stale?: (previous: Uint8Array, poll: number) => Uint8Array;
  corruptDebounce?: boolean;
  sendErrorOn?: number;
  receiveErrorOn?: number;
  disconnectOn?: number;
} = {}) {
  let previous = completed(buildCommand(DEBOUNCE));
  let request = new Uint8Array(64);
  const reports: Uint8Array[] = [];
  const pollsBeforeSend: number[] = [];
  let sends = 0;
  let polls = 0;
  let totalPolls = 0;
  const isTarget = (packet: Uint8Array) => packet[1] === (options.category ?? 7) && packet[2] === (options.register ?? 0x84);
  const device: HidDevice = {
    vendorId: 0x3710,
    productId: options.productId ?? 0x5403,
    productName: "8K Dongle",
    opened: true,
    collections: [{ usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] }],
    async open() { this.opened = true; },
    async close() { this.opened = false; },
    async sendFeatureReport(reportId, data) {
      assert.equal(reportId, 0);
      request = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push(request);
      if (isTarget(request)) {
        pollsBeforeSend.push(polls);
        polls = 0;
        sends++;
        if (sends === options.sendErrorOn) throw new Error("simulated stale SET failure");
      }
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      if (isTarget(request)) {
        polls++;
        totalPolls++;
        if (totalPolls === options.receiveErrorOn) throw new Error("simulated stale GET failure");
        if (totalPolls === options.disconnectOn) await client.disconnect();
        if (sends < (options.releaseAfterSend ?? 2)) {
          const stale = options.stale?.(previous.slice(), totalPolls) ?? previous.slice();
          return new DataView(stale.buffer, stale.byteOffset, stale.byteLength);
        }
      }
      const patch: Record<number, number> = request[1] === 1 && request[2] === 0x89 ? { 7: 64 }
        : request[1] === 7 && request[2] === 0x84 ? { 7: 1 }
        : request[1] === 2 && request[2] === 0x86 ? { 6: 1 }
        : request[1] === 2 && request[2] === 0x82 ? { 6: 1, 7: 1 }
        : {};
      const response = completed(request, patch);
      if (options.corruptDebounce && request[1] === 4 && request[2] === 0x83) response[62] ^= 1;
      previous = response.slice();
      return new DataView(response.buffer, response.byteOffset, response.byteLength);
    },
  };
  const client = new PulsarHidClient({ timeoutMs: options.timeoutMs ?? 300, pollIntervalMs: 1 });
  client.device = device;
  return { client, device, reports, pollsBeforeSend, targetReports: () => reports.filter(isTarget) };
}

test("8K global read recovers an exact completed debounce response stalled at angle 07/84", async () => {
  const fake = staleReceiver({ timeoutMs: RECOVERY_TIMEOUT_MS });
  try {
    assert.deepEqual(await fake.client.readGlobalSettings(), EXPECTED_GLOBAL);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
    assert.equal(fake.targetReports().length, 2);
    assert.deepEqual(fake.targetReports()[0], fake.targetReports()[1]);
    assert.ok(fake.reports.every((packet) => (packet[2] & 0x80) !== 0));
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, stale] of [
  ["changed payload with valid checksum", (previous: Uint8Array) => completed(previous, { 12: 9 })],
  ["corrupt checksum", (previous: Uint8Array) => { previous[62] ^= 1; return previous; }],
  ["pending status on the old response", (previous: Uint8Array) => completed(previous, { 0: 2 })],
  ["an older polling reply instead of the latest debounce reply", () => completed(buildCommand(readCommand(1, 9, 2)), { 7: 64 })],
] as const) {
  test(`8K cached-response recovery ignores ${label}`, async () => {
    const fake = staleReceiver({ stale });
    try {
      await assert.rejects(fake.client.readGlobalSettings(), /响应超时 \(7:84\)/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a different response interrupts consecutive cached-response polling", async () => {
  const fake = staleReceiver({
    stale: (previous, poll) => poll % 30 ? previous : completed(previous, { 12: 9 }),
  });
  try {
    await assert.rejects(fake.client.readGlobalSettings(), /响应超时 \(7:84\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("8K cached-response recovery resends a stalled read at most once", async () => {
  const fake = staleReceiver({ releaseAfterSend: Infinity, timeoutMs: RECOVERY_TIMEOUT_MS });
  try {
    await assert.rejects(fake.client.readGlobalSettings(), /响应超时 \(7:84\)/);
    assert.equal(fake.targetReports().length, 2);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
  } finally {
    await fake.client.dispose();
  }
});

for (const [productId, label] of [[0x5402, "1K receiver"], [0x3401, "wired mouse"]] as const) {
  test(`${label} cannot resend a read because of cached 8K responses`, async () => {
    const fake = staleReceiver({ productId });
    try {
      await assert.rejects(fake.client.readGlobalSettings(), /响应超时 \(7:84\)/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("public transact does not recover cached responses even after a successful prior read", async () => {
  const fake = staleReceiver();
  try {
    await fake.client.transact(DEBOUNCE);
    await assert.rejects(fake.client.transact(ANGLE), /响应超时 \(7:84\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("a real global setting write is never resent when it receives a cached read response", async () => {
  const fake = staleReceiver({ category: 7, register: 4 });
  try {
    await fake.client.transact(DEBOUNCE);
    await assert.rejects(fake.client.writeGlobalSettings(
      { ...EXPECTED_GLOBAL, angleSnap: false }, EXPECTED_GLOBAL,
    ), /响应超时 \(7:4\)/);
    assert.equal(fake.targetReports().length, 1);
    assert.equal(fake.targetReports()[0][2], 4);
  } finally {
    await fake.client.dispose();
  }
});

test("the first read cannot recover a stale response that this client never completed", async () => {
  const fake = staleReceiver({ category: 2, register: 0x86 });
  try {
    await assert.rejects(fake.client.readActiveProfile(), /响应超时 \(2:86\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("a completed response with invalid checksum cannot seed the recovery cache", async () => {
  const fake = staleReceiver({ category: 2, register: 0x86, corruptDebounce: true });
  try {
    await assert.rejects(fake.client.transact(DEBOUNCE), /校验和/);
    await assert.rejects(fake.client.readActiveProfile(), /响应超时 \(2:86\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("disconnecting and reopening the same receiver invalidates its previous completed response", async () => {
  const fake = staleReceiver({ category: 2, register: 0x86 });
  try {
    await fake.client.transact(DEBOUNCE);
    await fake.client.disconnect();
    await fake.device.open();
    fake.client.device = fake.device;
    await assert.rejects(fake.client.readActiveProfile(), /响应超时 \(2:86\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("a replacement receiver cannot reuse another device's completed response", async () => {
  const fake = staleReceiver({ category: 2, register: 0x86 });
  try {
    await fake.client.transact(DEBOUNCE);
    fake.client.device = { ...fake.device };
    await assert.rejects(fake.client.readActiveProfile(), /响应超时 \(2:86\)/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

test("queued reads use the most recently completed response from their own queue", async () => {
  const fake = staleReceiver({ category: 2, register: 0x82, timeoutMs: RECOVERY_TIMEOUT_MS });
  try {
    const active = fake.client.readActiveProfile();
    const ids = fake.client.readProfileIds();
    assert.deepEqual(await Promise.all([active, ids]), [1, [1]]);
    assert.equal(fake.targetReports().length, 2);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, options, expected, sends] of [
  ["retry SET failure", { sendErrorOn: 2, timeoutMs: RECOVERY_TIMEOUT_MS }, /simulated stale SET failure/, 2],
  ["GET failure", { receiveErrorOn: 10 }, /simulated stale GET failure/, 1],
  ["disconnect", { disconnectOn: 10 }, /断开连接/, 1],
] as const) {
  test(`cached-response recovery stops at ${label}`, async () => {
    const fake = staleReceiver(options);
    try {
      await assert.rejects(fake.client.readGlobalSettings(), expected);
      assert.equal(fake.targetReports().length, sends);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const [status, expected] of [[4, /不支持或拒绝/], [5, /状态 05/]] as const) {
  test(`status ${status} stops a read even after 29 cached responses`, async () => {
    const fake = staleReceiver({
      stale: (previous, poll) => poll < 30 ? previous : completed(buildCommand(ANGLE), { 0: status }),
    });
    try {
      await assert.rejects(fake.client.readGlobalSettings(), expected);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("cached-response recovery honors the original explicit deadline", async () => {
  const fake = staleReceiver({ timeoutMs: 60 });
  try {
    await assert.rejects(fake.client.readGlobalSettings(), /超时/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});
