import test from "node:test";
import assert from "node:assert/strict";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { buildCommand, checksum, readCommand } from "../src/protocol";

// Browser capture .local/8k-indicator-write-browser.json, entries 90–93:
// 08/09 was sent once, and GET kept exposing the identical preceding 02/86
// completion. The lamp changed despite the missing write acknowledgement.
const CAPTURED_ACTIVE = Uint8Array.from(Buffer.from(
  "0102860100000100000000000000000003e803034006400604d007d00705800c800c060032003200000000000000000000000000000000000000000000004105",
  "hex",
));
const CAPTURED_WRITE = Uint8Array.from(Buffer.from(
  "00080902000001020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000001600",
  "hex",
));

function completed(packet: Uint8Array, patch: Record<number, number> = {}) {
  const response = packet.slice();
  response[0] = 1;
  for (const [offset, value] of Object.entries(patch)) response[Number(offset)] = value;
  const sum = checksum(response);
  response[62] = sum & 255;
  response[63] = sum >> 8;
  return response;
}

function indicatorReceiver(options: {
  initialMode?: 1 | 2;
  productId?: number;
  apply?: boolean;
  writeReply?: (previous: Uint8Array, request: Uint8Array) => Uint8Array;
  sendError?: boolean;
  receiveError?: boolean;
  disconnect?: boolean;
  readbackMode?: number;
  readbackStatus?: number;
  readbackProfile?: number;
  seedStatus?: number;
  batteryPercent?: number;
  connectionChange?: { after: "seed" | "write"; kind: "device" | "epoch" };
} = {}) {
  let mode: number = options.initialMode ?? 1;
  let wrote = false;
  let response: Uint8Array = CAPTURED_ACTIVE.slice();
  let writing = false;
  const reports: Uint8Array[] = [];
  const replacementReports: Uint8Array[] = [];
  let switched = false;
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
      const request = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push(request);
      writing = request[1] === 8 && request[2] === 9;
      if (writing) {
        if (options.sendError) throw new Error("simulated indicator SET failure");
        wrote = true;
        if (options.apply !== false) mode = request[7];
        response = options.writeReply?.(response.slice(), request) ?? response.slice();
        return;
      }
      if (request[1] === 2 && request[2] === 0x86) {
        response = wrote && options.readbackProfile !== undefined
          ? completed(CAPTURED_ACTIVE, { 6: options.readbackProfile })
          : CAPTURED_ACTIVE.slice();
        return;
      }
      assert.equal(request[1], 8, "Only power/profile reads surround the indicator write");
      const patch: Record<number, number> = request[2] === 0x81 ? { 6: options.batteryPercent ?? 71 }
        : request[2] === 0x83 ? { 6: 0 }
        : request[2] === 0x85 ? { 7: 30, 8: 0 }
        : request[2] === 0x88 ? { 7: 10 }
        // Simulated adaptation of the separately captured low-power-header
        // indicator getter: the new pre-write seed is not in the write trace.
        : request[2] === 0x89 ? {
          2: (wrote ? options.readbackStatus : options.seedStatus) ? 0x89 : 0x88,
          7: wrote ? options.readbackMode ?? mode : mode,
          0: (wrote ? options.readbackStatus : options.seedStatus) ?? 1,
        }
        : {};
      assert.ok([0x81, 0x83, 0x85, 0x88, 0x89].includes(request[2]));
      response = completed(request, patch);
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      if (writing && options.receiveError) throw new Error("simulated indicator GET failure");
      if (writing && options.disconnect) await client.disconnect();
      return new DataView(response.buffer, response.byteOffset, response.byteLength);
    },
  };
  const replacement: HidDevice = {
    ...device,
    async sendFeatureReport(reportId, data) {
      replacementReports.push(ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice());
      await device.sendFeatureReport(reportId, data);
    },
  };
  const client = new PulsarHidClient({
    timeoutMs: 250,
    pollIntervalMs: 1,
    onLog(entry) {
      const change = options.connectionChange;
      const request = reports.at(-1);
      if (!change || switched || entry.direction !== "in" || !request) return;
      const boundary = change.after === "write" ? writing
        : !wrote && request[1] === 8 && request[2] === 0x89;
      if (!boundary) return;
      switched = true;
      // The response is processed synchronously after logging. Change the
      // session in the next microtask, after exchange completes but before
      // writePower resumes the next awaited operation.
      queueMicrotask(() => {
        if (change.kind === "device") client.device = replacement;
        else {
          // Reopen the same object: its identity and opened flag match, but
          // disconnect advances the epoch and invalidates the original session.
          void client.disconnect();
          void device.open();
          client.device = device;
        }
      });
    },
  });
  client.device = device;
  return {
    client, reports, device, replacementReports,
    switched: () => switched,
    writes: () => reports.filter((packet) => packet[2] < 0x80),
  };
}

for (const mode of [1, 2] as const) {
  test(`8K indicator mode ${mode} verifies a single applied write despite an unchanged previous reply`, async () => {
    const fake = indicatorReceiver({ initialMode: mode === 1 ? 2 : 1 });
    try {
      assert.deepEqual(await fake.client.writePower({ receiverIndicator: mode }, 1), {
        batteryPercent: 71,
        charging: false,
        sleepSeconds: 30,
        lowPowerPercent: 10,
        receiverIndicator: mode,
      });
      assert.equal(fake.writes().length, 1);
      assert.deepEqual(fake.writes()[0], mode === 2 ? CAPTURED_WRITE : buildCommand({
        category: 8, register: 9, sub: 2, profile: 1, payload: [mode],
      }));
      const writeIndex = fake.reports.indexOf(fake.writes()[0]);
      assert.deepEqual(fake.reports.slice(0, writeIndex).map((packet) => [packet[1], packet[2]]), [
        [2, 0x86], [8, 0x88], [8, 0x89],
      ]);
      assert.deepEqual(fake.reports.slice(writeIndex + 1).map((packet) => [packet[1], packet[2]]), [
        [8, 0x81], [8, 0x83], [8, 0x85], [8, 0x88], [8, 0x89], [2, 0x86],
      ]);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a normal indicator write acknowledgement still requires fresh power and profile readback", async () => {
  const fake = indicatorReceiver({ writeReply: (_previous, request) => completed(request) });
  try {
    assert.equal((await fake.client.writePower({ receiverIndicator: 2 }, 1)).receiverIndicator, 2);
    assert.equal(fake.writes().length, 1);
    assert.equal(fake.reports.filter((packet) => packet[1] === 8 && packet[2] === 0x89).length, 2);
    assert.equal(fake.reports.at(-1)?.[2], 0x86);
  } finally {
    await fake.client.dispose();
  }
});

for (const options of [
  { name: "the lamp remaining in its previous mode", apply: false, expected: /电源设置回读不一致/ },
  { name: "a different fresh indicator value", readbackMode: 1, expected: /电源设置回读不一致/ },
  { name: "an unsupported fresh indicator getter", readbackStatus: 4, expected: /电源设置回读不一致/ },
  { name: "an offline fresh indicator getter", readbackStatus: 5, expected: /状态 05/ },
  { name: "a changed active profile", readbackProfile: 2, expected: /活动配置在写入期间发生变化/ },
] as const) {
  test(`a cached indicator write reply cannot hide ${options.name}`, async () => {
    const fake = indicatorReceiver(options);
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), options.expected);
      assert.equal(fake.writes().length, 1, "Readback failure must not repeat a setting write");
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const [name, writeReply] of [
  ["changed payload with a valid checksum", (previous: Uint8Array) => completed(previous, { 12: 9 })],
  ["a corrupt checksum", (previous: Uint8Array) => { previous[62] ^= 1; return previous; }],
  ["pending status on the previous frame", (previous: Uint8Array) => completed(previous, { 0: 2 })],
  ["unsupported status on the previous frame", (previous: Uint8Array) => completed(previous, { 0: 4 })],
  ["offline status on the previous frame", (previous: Uint8Array) => completed(previous, { 0: 5 })],
  ["an older captured active-profile completion", () => CAPTURED_ACTIVE.slice()],
  ["a truncated previous frame", (previous: Uint8Array) => previous.slice(0, 20)],
] as const) {
  test(`indicator write cannot use ${name} as evidence to proceed to readback`, async () => {
    const fake = indicatorReceiver({ writeReply });
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /超时|校验和/);
      assert.equal(fake.writes().length, 1);
      assert.equal(fake.reports.at(-1)?.[2], 9, "An unverified reply must not initiate readback");
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const [status, expected] of [[4, /不支持或拒绝/], [5, /状态 05/]] as const) {
  test(`matching indicator write status ${status} aborts without a write retry`, async () => {
    const fake = indicatorReceiver({ writeReply: (_previous, request) => completed(request, { 0: status }) });
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), expected);
      assert.equal(fake.writes().length, 1);
      assert.equal(fake.reports.at(-1)?.[2], 9);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a matching indicator ACK with a corrupt checksum aborts without readback", async () => {
  const fake = indicatorReceiver({
    writeReply: (_previous, request) => {
      const response = completed(request);
      response[62] ^= 1;
      return response;
    },
  });
  try {
    await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /校验和/);
    assert.equal(fake.writes().length, 1);
    assert.equal(fake.reports.at(-1)?.[2], 9);
  } finally {
    await fake.client.dispose();
  }
});

for (const options of [
  { name: "SET failure", sendError: true, expected: /simulated indicator SET failure/ },
  { name: "GET failure", receiveError: true, expected: /simulated indicator GET failure/ },
  { name: "disconnection", disconnect: true, expected: /断开连接/ },
] as const) {
  test(`indicator write stops on ${options.name} without readback or another write`, async () => {
    const fake = indicatorReceiver(options);
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), options.expected);
      assert.equal(fake.writes().length, 1);
      assert.equal(fake.reports.at(-1)?.[2], 9);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a failed indicator preflight cannot send the setting write", async () => {
  const fake = indicatorReceiver({ seedStatus: 5 });
  try {
    await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /状态 05/);
    assert.equal(fake.writes().length, 0);
  } finally {
    await fake.client.dispose();
  }
});

test("public transact stays strict even with the exact captured previous completion", async () => {
  const fake = indicatorReceiver();
  try {
    assert.deepEqual(await fake.client.transact(readCommand(2, 6, 1)), CAPTURED_ACTIVE);
    await assert.rejects(fake.client.transact({
      category: 8, register: 9, sub: 2, profile: 1, payload: [2],
    }), /响应超时 \(8:9\)/);
    assert.deepEqual(fake.writes(), [CAPTURED_WRITE]);
  } finally {
    await fake.client.dispose();
  }
});

for (const [productId, name] of [[0x5402, "1K receiver"], [0x3401, "wired mouse"]] as const) {
  test(`indicator write compatibility cannot enable unsupported settings on a ${name}`, async () => {
    const fake = indicatorReceiver({ productId });
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /需要 8K 接收器/);
      assert.deepEqual(fake.reports, []);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const after of ["seed", "write"] as const) {
  for (const kind of ["device", "epoch"] as const) {
    test(`indicator write aborts when the ${kind} changes after ${after} completion`, async () => {
      const fake = indicatorReceiver({ connectionChange: { after, kind } });
      try {
        await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /设备连接已变化/);
        assert.equal(fake.switched(), true, "The connection changes at the intended await boundary");
        assert.equal(fake.writes().length, after === "seed" ? 0 : 1);
        assert.deepEqual(fake.replacementReports, [], "No command may be sent to a replacement receiver");
        assert.equal(fake.reports.at(-1)?.[2], after === "seed" ? 0x89 : 9,
          "The original operation must stop before writing or reading back on the new session");
      } finally {
        await fake.client.dispose();
      }
    });
  }
}

for (const mode of [1, 2] as const) {
  test(`unknown battery value 255 does not prevent verifying indicator mode ${mode}`, async () => {
    const fake = indicatorReceiver({ initialMode: mode === 1 ? 2 : 1, batteryPercent: 255 });
    try {
      const actual = await fake.client.writePower({ receiverIndicator: mode }, 1);
      assert.equal(actual.batteryPercent, undefined, "An unavailable battery reading must not become 0%");
      assert.equal(actual.charging, false);
      assert.equal(actual.sleepSeconds, 30);
      assert.equal(actual.lowPowerPercent, 10);
      assert.equal(actual.receiverIndicator, mode);
      assert.equal(fake.writes().length, 1);
      const writeIndex = fake.reports.indexOf(fake.writes()[0]);
      assert.deepEqual(fake.reports.slice(writeIndex + 1).map((packet) => [packet[1], packet[2]]), [
        [8, 0x81], [8, 0x83], [8, 0x85], [8, 0x88], [8, 0x89], [2, 0x86],
      ]);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const batteryPercent of [101, 254]) {
  test(`invalid battery value ${batteryPercent} still rejects the indicator save`, async () => {
    const fake = indicatorReceiver({ batteryPercent });
    try {
      await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /Battery percent/);
      assert.equal(fake.writes().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("unknown battery value 255 cannot hide an indicator readback mismatch", async () => {
  const fake = indicatorReceiver({ batteryPercent: 255, apply: false });
  try {
    await assert.rejects(fake.client.writePower({ receiverIndicator: 2 }, 1), /电源设置回读不一致/);
    assert.equal(fake.writes().length, 1);
    assert.equal(fake.reports.filter((packet) => packet[1] === 8 && packet[2] === 0x89).length, 2);
  } finally {
    await fake.client.dispose();
  }
});
