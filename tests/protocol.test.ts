import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPacket,
  checksum,
  matchesReply,
  readCommand,
  parseDpiStages,
  dpiPayload,
  defaultProfile,
  validateProfile,
  validateGlobal,
  defaultGlobal,
  BUTTON_ACTIONS,
  parseInputReport,
} from "../src/protocol";
import { PulsarHidClient, type HidDevice } from "../src/hid";

const actualDpiReply =
  "01058421000001030601900190010220032003034006400604800c800c0500190019060032003200000000000000000000000000000000000000000000006c04";
const bytes = (hex: string) => Uint8Array.from(Buffer.from(hex, "hex"));
function response(request: Uint8Array, patch: Record<number, number> = {}) {
  const reply = request.slice();
  reply[0] = 1;
  for (const [index, value] of Object.entries(patch))
    reply[Number(index)] = value;
  const sum = checksum(reply);
  reply[62] = sum & 255;
  reply[63] = sum >> 8;
  return reply;
}
function fakeDevice(
  answer: (request: Uint8Array) => Uint8Array | Promise<Uint8Array>,
) {
  let request = new Uint8Array(64);
  const writes: Uint8Array[] = [];
  const device: HidDevice = {
    vendorId: 0x3710,
    productId: 0x3401,
    productName: "Pulsar Xlite v4",
    opened: true,
    collections: [],
    async open() {
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    async sendFeatureReport(id, data) {
      assert.equal(id, 0);
      request = new Uint8Array(data as ArrayBuffer);
      writes.push(request.slice());
    },
    async receiveFeatureReport(id) {
      assert.equal(id, 0);
      const reply = await answer(request);
      return new DataView(reply.buffer, reply.byteOffset, reply.byteLength);
    },
  };
  return { device, writes };
}
function receiverCandidate(
  answer: (request: Uint8Array) => Uint8Array | Promise<Uint8Array>,
) {
  const fake = fakeDevice(answer);
  fake.device.productId = 0x5402;
  fake.device.productName = "1K Dongle";
  fake.device.collections = [
    { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
  ];
  return fake;
}
function receiverHandshake(request: Uint8Array) {
  return response(
    request,
    request[2] === 0x84
      ? { 6: 0x10, 7: 0x37, 8: 0x01, 9: 0x34 }
      : { 7: 8 },
  );
}
test("polling query matches the packet captured from the connected mouse", () => {
  assert.equal(
    Buffer.from(buildPacket(1, 0x89, 2)).toString("hex"),
    "00018902000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008c00",
  );
});
test("real DPI read uses raw uint16 values, one-based stage and 6 stages", () => {
  const reply = bytes(actualDpiReply),
    settings = parseDpiStages(reply);
  assert.equal(checksum(reply), reply[62] | (reply[63] << 8));
  assert.equal(settings.activeStage, 3);
  assert.deepEqual(
    settings.dpiStages.map(({ x, y }) => [x, y]),
    [400, 800, 1600, 3200, 6400, 12800].map((v) => [v, v]),
  );
  assert.equal(matchesReply(reply, readCommand(5, 4, 0x15, 1)), true);
});
test("profile reads use Fusion's dedicated active-stage register after the bulk DPI read", async () => {
  // Source-derived behavior: native GetDPIStageInfo reads 5/84, then 5/81.
  // The disagreement here does not assert the cause of a hardware transient.
  const fake = fakeDevice((request) => {
    const command = `${request[1]}:${request[2]}`;
    if (command === "5:132")
      return response(bytes(actualDpiReply), { 6: request[6], 7: 6 });
    if (command === "5:129") return response(request, { 7: 3 });
    if (command === "7:130") return response(request, { 7: 2, 8: 10 });
    if (command === "3:131") return response(request, { 8: 255 });
    if (command === "4:129") return response(request, { 8: 1, 9: 1 });
    return response(request);
  });
  const client = new PulsarHidClient();
  client.device = fake.device;
  const profile = await client.readProfile(6);
  assert.equal(profile.activeStage, 3);
  assert.equal(profile.dpiStages.length, 6);
  const query = fake.writes.find(
    (packet) => packet[1] === 5 && packet[2] === 0x81,
  );
  assert.ok(query);
  assert.equal(query[3], 2);
  assert.equal(query[6], 6);
  assert.ok(fake.writes.every((packet) => (packet[2] & 0x80) !== 0));
});
test("profile reads reject an active stage outside the device's DPI table", async () => {
  for (const activeStage of [0, 7]) {
    const fake = fakeDevice((request) =>
      request[1] === 5 && request[2] === 0x84
        ? bytes(actualDpiReply)
        : response(request, { 7: activeStage }),
    );
    const client = new PulsarHidClient();
    client.device = fake.device;
    await assert.rejects(client.readProfile(1), /Active DPI stage/);
  }
});
test("DPI packet preserves independent axes and 10 DPI increments", () => {
  const profile = defaultProfile();
  profile.dpiStages = [{ x: 50, y: 32000, color: [1, 2, 3] }];
  profile.activeStage = 1;
  assert.deepEqual(dpiPayload(profile.dpiStages, 1), [1, 1, 1, 50, 0, 0, 125]);
  assert.throws(
    () => dpiPayload([{ x: 55, y: 100, color: [0, 0, 0] }], 1),
    /10 DPI/,
  );
  assert.throws(() => dpiPayload(profile.dpiStages, 2), /Active DPI/);
});
test("rejects malformed payloads and out-of-range settings before building reports", () => {
  assert.throws(
    () => buildPacket(1, 2, 3, 0, new Array(56).fill(0)),
    /55-byte/,
  );
  assert.throws(() => buildPacket(1, 2, 3, 0, [256]), /Packet byte/);
  assert.throws(
    () => validateGlobal({ ...defaultGlobal(), pollingRate: 16000 }),
    /polling/,
  );
  assert.throws(
    () => validateProfile({ ...defaultProfile(), lod: 0.75 }),
    /Lift-off/,
  );
  const profile = defaultProfile();
  profile.buttons[1] = { type: 0, a1: 0, a2: 0 };
  assert.throws(() => validateProfile(profile), /left click/);
});
test("rejects busy, stale profile, stale button and truncated responses", () => {
  const command = readCommand(4, 1, 6, 2, [4, 255], 4);
  const packet = buildPacket(4, 0x81, 6, 2, [4, 1, 4, 0]);
  assert.equal(matchesReply(response(packet), command), true);
  assert.equal(matchesReply(response(packet, { 0: 2 }), command), false);
  assert.equal(matchesReply(response(packet, { 6: 1 }), command), false);
  assert.equal(matchesReply(response(packet, { 7: 5 }), command), false);
  assert.equal(matchesReply(response(packet).slice(0, 63), command), false);
});
test("transport polls the same pending command and discards stale replies", async () => {
  let reads = 0;
  const fake = fakeDevice((request) => {
    reads++;
    return response(
      request,
      reads === 1 ? { 0: 2 } : reads === 2 ? { 1: 7 } : { 7: 8 },
    );
  });
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 100 });
  client.device = fake.device;
  const reply = await client.transact(readCommand(1, 9, 2));
  assert.equal(reply[7], 8);
  assert.equal(fake.writes.length, 1);
  assert.equal(reads, 3);
});
test("transport stops on the captured receiver status 05 instead of polling or resending", async () => {
  const offlineReply = bytes(
    "05018902000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009100",
  );
  let reads = 0;
  const fake = fakeDevice(() => {
    reads++;
    return offlineReply;
  });
  fake.device.productId = 0x5402;
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
  client.device = fake.device;
  await assert.rejects(
    client.transact(readCommand(1, 9, 2)),
    /接收器未收到鼠标响应（状态 05）/,
  );
  assert.equal(reads, 1);
  assert.equal(fake.writes.length, 1);
});
test("transport never retries a setting write rejected with receiver status 05", async () => {
  let reads = 0;
  const fake = fakeDevice((request) => {
    reads++;
    return response(request, { 0: 5 });
  });
  fake.device.productId = 0x5402;
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
  client.device = fake.device;
  await assert.rejects(
    client.transact({
      category: 1,
      register: 9,
      sub: 2,
      profile: 0,
      payload: [8],
    }),
    /接收器未收到鼠标响应（状态 05）/,
  );
  assert.equal(reads, 1);
  assert.equal(fake.writes.length, 1);
});
test("transport discards receiver status 05 for an unrelated category or register", async () => {
  let reads = 0;
  const fake = fakeDevice((request) => {
    reads++;
    return response(
      request,
      reads === 1
        ? { 0: 5, 1: 8 }
        : reads === 2
          ? { 0: 5, 2: 0x84 }
          : { 7: 8 },
    );
  });
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 100 });
  client.device = fake.device;
  assert.equal((await client.transact(readCommand(1, 9, 2)))[7], 8);
  assert.equal(reads, 3);
  assert.equal(fake.writes.length, 1);
});
test("transport reports a corrupt status 05 packet as a checksum failure", async () => {
  let reads = 0;
  const fake = fakeDevice((request) => {
    reads++;
    const reply = response(request, { 0: 5 });
    reply[63] ^= 1;
    return reply;
  });
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
  client.device = fake.device;
  await assert.rejects(client.transact(readCommand(1, 9, 2)), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /校验和/);
    assert.doesNotMatch(error.message, /状态 05/);
    return true;
  });
  assert.equal(reads, 1);
  assert.equal(fake.writes.length, 1);
});
test("transport rejects corrupt checksums and continues serial queue after failure", async () => {
  let count = 0;
  const fake = fakeDevice((request) => {
    count++;
    const reply = response(request, { 7: 8 });
    if (count === 1) reply[63] ^= 1;
    return reply;
  });
  const client = new PulsarHidClient({ pollIntervalMs: 0 });
  client.device = fake.device;
  await assert.rejects(client.transact(readCommand(1, 9, 2)), /校验和/);
  assert.equal((await client.transact(readCommand(1, 9, 2)))[7], 8);
});
test("concurrent transport calls are serialized until acknowledgement", async () => {
  const sequence: string[] = [];
  const fake = fakeDevice(async (request) => {
    sequence.push(`read${request[1]}`);
    await new Promise((resolve) => setTimeout(resolve, 2));
    return response(request);
  });
  const original = fake.device.sendFeatureReport;
  fake.device.sendFeatureReport = async function (id, data) {
    sequence.push(`write${new Uint8Array(data as ArrayBuffer)[1]}`);
    await original.call(this, id, data);
  };
  const client = new PulsarHidClient();
  client.device = fake.device;
  await Promise.all([
    client.transact(readCommand(1, 9, 2)),
    client.transact(readCommand(7, 4, 2)),
  ]);
  assert.deepEqual(sequence, ["write1", "read1", "write7", "read7"]);
});
test("pending requests cannot continue on a different connection", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const pending = client.transact(readCommand(1, 9, 2));
  await client.disconnect();
  await assert.rejects(pending, /连接已经更改/);
  assert.equal(fake.writes.length, 0);
});
test("shared receivers reject a paired mouse other than Xlite v4", async () => {
  for (const [productId, identity, expected] of [
    [0x5402, [0x10, 0x37, 0x09, 0x34], /Xlite v4.*3710:3409/],
    [0x5403, [0x34, 0x12, 0x01, 0x34], /Xlite v4.*1234:3401/],
    [0x5402, [0, 0, 0, 0], /Xlite v4.*0000:0000/],
  ] as const) {
    const fake = fakeDevice((request) =>
      response(
        request,
        request[2] === 0x84
          ? { 6: identity[0], 7: identity[1], 8: identity[2], 9: identity[3] }
          : { 7: 8 },
      ),
    );
    fake.device.productId = productId;
    fake.device.collections = [
      { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
    ];
    const client = new PulsarHidClient();
    await assert.rejects(client.connectDevices([fake.device]), expected);
    assert.equal(client.connected, false);
    assert.equal(fake.device.opened, false);
    assert.ok(fake.writes.every((packet) => (packet[2] & 0x80) !== 0));
  }
});
test("receivers accept the captured Xlite v4 identity and cable needs no identity relay", async () => {
  const identityReply = bytes(
    "01018404000010370134000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000601",
  );
  for (const productId of [0x3401, 0x5402, 0x5403]) {
    const fake = fakeDevice((request) =>
      request[2] === 0x84 ? identityReply : response(request, { 7: 8 }),
    );
    fake.device.productId = productId;
    fake.device.collections = [
      { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
    ];
    const client = new PulsarHidClient();
    assert.equal(await client.connectDevices([fake.device]), fake.device);
    assert.equal(client.connected, true);
    assert.ok(fake.writes.every((packet) => (packet[2] & 0x80) !== 0));
    if (productId === 0x3401)
      assert.ok(fake.writes.every((packet) => packet[2] !== 0x84));
    await client.disconnect();
  }
});
test("receiver connection failures explain wireless recovery and retain the cause", async () => {
  const fake = fakeDevice((request) => response(request));
  fake.device.productId = 0x5402;
  fake.device.collections = [
    { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
  ];
  fake.device.sendFeatureReport = async () => {
    throw new Error("IOHIDDeviceSetReport failed: 0xE0005000");
  };
  const client = new PulsarHidClient();
  await assert.rejects(client.connectDevices([fake.device]), (error: Error) => {
    assert.match(error.message, /唤醒/);
    assert.match(error.message, /其他.*配置/);
    assert.match(error.message, /重新插拔/);
    assert.match(error.message, /0xE0005000/);
    return true;
  });
  assert.equal(client.connected, false);
});
test("1K receiver preflight skips short interfaces without SET and handshakes the full interface", async () => {
  for (const probe of [new Uint8Array(1), new Uint8Array(63), new Uint8Array(66)]) {
    const short = receiverCandidate(() => probe);
    const readsAtWriteCounts: number[] = [];
    const full = receiverCandidate((request) => {
      readsAtWriteCounts.push(full.writes.length);
      return full.writes.length === 0
        ? new Uint8Array(64)
        : receiverHandshake(request);
    });
    const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
    assert.equal(
      await client.connectDevices([short.device, full.device]),
      full.device,
    );
    assert.equal(short.writes.length, 0);
    assert.equal(short.device.opened, false);
    assert.deepEqual(readsAtWriteCounts, [0, 1, 2]);
    assert.deepEqual(full.writes.map((packet) => packet[2]), [0x89, 0x84]);
    assert.deepEqual(
      client.connectionAttempts.map(({ candidate, phase, probeLength }) => ({
        candidate,
        phase,
        probeLength,
      })),
      [
        { candidate: 1, phase: "probe", probeLength: probe.length },
        { candidate: 2, phase: "connected", probeLength: 64 },
      ],
    );
    assert.ok(client.connectionAttempts[0].error);
    await client.disconnect();
  }
});
test("1K receiver preflight accepts a 65-byte report only with its leading zero ID", async () => {
  for (const prefix of [0, 1]) {
    const fake = receiverCandidate((request) => {
      if (fake.writes.length) return receiverHandshake(request);
      const probe = new Uint8Array(65);
      probe[0] = prefix;
      return probe;
    });
    const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
    if (prefix === 0) {
      assert.equal(await client.connectDevices([fake.device]), fake.device);
      assert.deepEqual(fake.writes.map((packet) => packet[2]), [0x89, 0x84]);
      assert.equal(client.connectionAttempts[0].probeLength, 65);
    } else {
      await assert.rejects(client.connectDevices([fake.device]), /报告长度/);
      assert.equal(fake.writes.length, 0);
      assert.equal(fake.device.opened, false);
    }
    await client.disconnect();
  }
});
test("1K receiver preflight cannot accept a cached reply as a fresh handshake", async () => {
  let reads = 0;
  const fake = receiverCandidate((request) => {
    reads++;
    return reads === 1
      ? response(buildPacket(1, 0x89, 2), { 7: 8 })
      : response(request, { 0: 5 });
  });
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 50 });
  await assert.rejects(client.connectDevices([fake.device]), /状态 05/);
  assert.deepEqual(fake.writes.map((packet) => packet[2]), [0x89]);
  assert.equal(reads, 2);
  assert.equal(client.connected, false);
  assert.equal(client.connectionAttempts[0].phase, "polling");
});
test("1K receiver preflight closes a hanging candidate and continues to the next", async () => {
  const hung = receiverCandidate(() => new Promise<Uint8Array>(() => {}));
  const full = receiverCandidate((request) => receiverHandshake(request));
  const client = new PulsarHidClient({ pollIntervalMs: 0, timeoutMs: 25 });
  assert.equal(await client.connectDevices([hung.device, full.device]), full.device);
  assert.equal(hung.writes.length, 0);
  assert.equal(hung.device.opened, false);
  assert.equal(client.connected, true);
  assert.equal(client.connectionAttempts[0].phase, "probe");
  assert.match(client.connectionAttempts[0].error ?? "", /超时/);
  assert.equal(client.connectionAttempts[1].phase, "connected");
  await client.disconnect();
});
test("1K receiver preflight does not change cable or 8K connection I/O", async () => {
  for (const productId of [0x3401, 0x5403]) {
    let reads = 0;
    const fake = receiverCandidate((request) => {
      reads++;
      assert.ok(fake.writes.length > 0);
      return receiverHandshake(request);
    });
    fake.device.productId = productId;
    const client = new PulsarHidClient();
    assert.equal(await client.connectDevices([fake.device]), fake.device);
    assert.equal(reads, productId === 0x3401 ? 1 : 2);
    assert.equal(client.connectionAttempts[0].probeLength, undefined);
    assert.equal(client.connectionAttempts[0].phase, "connected");
    await client.disconnect();
  }
});
test("connection diagnostics retain identity failures and reset for the next connection", async () => {
  const otherModel = receiverCandidate((request) =>
    response(request, request[2] === 0x84 ? { 8: 0x09, 9: 0x34 } : { 7: 8 }),
  );
  const client = new PulsarHidClient();
  await assert.rejects(client.connectDevices([otherModel.device]), /返回型号/);
  assert.equal(client.connectionAttempts.length, 1);
  assert.equal(client.connectionAttempts[0].phase, "identity");
  assert.equal(client.connectionAttempts[0].errorName, "Error");
  assert.match(client.connectionAttempts[0].error ?? "", /返回型号/);
  const full = receiverCandidate((request) => receiverHandshake(request));
  await client.connectDevices([full.device]);
  assert.equal(client.connectionAttempts.length, 1);
  assert.equal(client.connectionAttempts[0].phase, "connected");
  assert.equal(client.connectionAttempts[0].error, undefined);
  await client.disconnect();
});
test("connection errors preserve a full receiver interface failure over a later short candidate", async () => {
  for (const phase of ["polling", "identity"] as const) {
    const full = receiverCandidate((request) => receiverHandshake(request));
    const originalSend = full.device.sendFeatureReport;
    full.device.sendFeatureReport = async function (id, data) {
      await originalSend.call(this, id, data);
      const request = new Uint8Array(data as ArrayBuffer);
      if (request[2] === (phase === "polling" ? 0x89 : 0x84))
        throw new Error("Failed to write the feature report.");
    };
    const short = receiverCandidate(() => new Uint8Array(1));
    const client = new PulsarHidClient();
    await assert.rejects(
      client.connectDevices([full.device, short.device]),
      (error: unknown) => {
        assert.ok(error instanceof Error);
        assert.match(error.message, /Failed to write the feature report/);
        assert.doesNotMatch(error.message, /报告长度/);
        return true;
      },
    );
    assert.equal(client.connectionAttempts.length, 2);
    assert.equal(client.connectionAttempts[0].phase, phase);
    assert.equal(client.connectionAttempts[1].phase, "probe");
    assert.match(client.connectionAttempts[1].error ?? "", /报告长度/);
    assert.equal(full.device.opened, false);
    assert.equal(short.device.opened, false);
  }
});
test("whole settings batch is validated before the first write", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const original = {
    global: defaultGlobal(),
    profile: defaultProfile(),
    warnings: [],
  };
  await assert.rejects(
    client.writeSettings(
      { ...original, global: { ...original.global, pollingRate: 16000 } },
      original,
    ),
    /polling/,
  );
  assert.equal(fake.writes.length, 0);
});
test("LED edits preserve unexposed bytes in the shared hardware register", async () => {
  const fake = fakeDevice((request) =>
    request[2] === 0x84
      ? response(request, { 7: 1, 8: 1, 9: 9, 10: 10, 11: 50, 12: 12, 20: 20 })
      : response(request),
  );
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultProfile(),
    next = structuredClone(previous);
  next.ledEffect = "breathe";
  client.readProfile = async () => structuredClone(next);
  await client.writeProfile(next, previous);
  const write = fake.writes.find(
    (packet) => packet[1] === 3 && packet[2] === 4,
  );
  assert.ok(write);
  assert.deepEqual(Array.from(write.slice(7, 13)), [1, 2, 9, 10, 50, 12]);
  assert.equal(write[20], 20);
});
test("debounce setter matches the recovered native application with zero reserved byte", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = { ...defaultGlobal(), debounceRelease: 6 },
    next = { ...previous, debounce: 5 };
  client.readGlobalSettings = async () => structuredClone(next);
  await client.writeGlobalSettings(next, previous);
  assert.equal(fake.writes.length, 1);
  assert.deepEqual(Array.from(fake.writes[0].slice(7, 9)), [5, 0]);
});
test("no-change profile apply has no writes and ignores object key order", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultProfile(),
    next = structuredClone(previous);
  client.readProfile = async () => ({
    buttons: next.buttons,
    breatheSpeed: next.breatheSpeed,
    ledEffect: next.ledEffect,
    brightness: next.brightness,
    lod: next.lod,
    activeStage: next.activeStage,
    dpiStages: next.dpiStages,
    profile: next.profile,
  });
  await client.writeProfile(next, previous);
  assert.equal(fake.writes.length, 0);
});
test("write completion is rejected when setting readback does not match", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultGlobal(),
    next = { ...previous, angleSnap: true };
  client.readGlobalSettings = async () => structuredClone(previous);
  await assert.rejects(
    client.writeGlobalSettings(next, previous),
    /回读不一致/,
  );
});
test("replacement left-click binding is written before removing the previous one", async () => {
  const fake = fakeDevice((request) => response(request));
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultProfile(),
    next = structuredClone(previous);
  next.buttons[2] = { type: 1, a1: 1, a2: 0 };
  next.buttons[1] = { type: 1, a1: 2, a2: 0 };
  client.readProfile = async () => structuredClone(next);
  await client.writeProfile(next, previous);
  assert.deepEqual(
    fake.writes.map((packet) => packet[7]),
    [2, 1],
  );
});
test("native macro transfer chunks at 50 bytes and verifies UTF-16 name and content", async () => {
  let storedData: number[] = [],
    storedName: number[] = [];
  const fake = fakeDevice((request) => {
    const patch: Record<number, number> = {};
    const set = (offset: number, values: number[]) =>
      values.forEach((value, index) => (patch[offset + index] = value));
    assert.equal(request[1], 6);
    const offset =
      request[8] |
      (request[9] << 8) |
      (request[10] << 16) |
      (request[11] << 24);
    if (request[2] === 3)
      storedData = new Array(request[8] | (request[9] << 8)).fill(0);
    if (request[2] === 6)
      storedData.splice(
        offset,
        request[3] - 6,
        ...request.slice(12, 12 + request[3] - 6),
      );
    if (request[2] === 5)
      storedName = Array.from(
        request.slice(12, 12 + (request[10] | (request[11] << 8))),
      );
    if (request[2] === 0x83)
      set(8, [storedData.length & 255, storedData.length >> 8, 0, 0]);
    if (request[2] === 0x85) {
      set(10, [storedName.length, 0]);
      if (request[10] || request[11]) set(12, storedName);
    }
    if (request[2] === 0x86)
      set(12, storedData.slice(offset, offset + request[3] - 6));
    return response(request, patch);
  });
  const client = new PulsarHidClient();
  client.device = fake.device;
  const data = Array.from({ length: 113 }, (_, index) => index % 256);
  const actual = await client.saveMacro({ id: 257, name: "测试 Macro", data });
  assert.equal(actual.id, 257);
  assert.equal(actual.name, "测试 Macro");
  assert.deepEqual(actual.data, data);
  const chunks = fake.writes.filter((packet) => packet[2] === 6);
  assert.deepEqual(
    chunks.map((packet) => packet[3]),
    [56, 56, 19],
  );
  assert.deepEqual(
    chunks.map((packet) => packet[8]),
    [0, 50, 100],
  );
  assert.deepEqual(
    Array.from(fake.writes[0].slice(6, 12)),
    [1, 1, 113, 0, 0, 0],
  );
});
test("macro name/content validation happens before allocation", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  await assert.rejects(
    client.saveMacro({ id: 1, name: "a".repeat(26), data: [1, 2] }),
    /名称/,
  );
  await assert.rejects(
    client.saveMacro({ id: 1, name: "valid", data: [256] }),
    /Macro byte/,
  );
  assert.equal(fake.writes.length, 0);
});
test("macro I button binding includes repeat byte", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultProfile(),
    next = structuredClone(previous);
  next.buttons[4] = { type: 4, a1: 1, a2: 1, a3: 12 };
  client.readProfile = async () => structuredClone(next);
  client.listMacros = async () => [{ id: 257, name: "test", size: 2 }];
  await client.writeProfile(next, previous);
  assert.deepEqual(Array.from(fake.writes[0].slice(7, 12)), [4, 4, 1, 1, 12]);
});
test("actual device profile inventory has six profiles and firmware bytes are BCD-style hex", async () => {
  const fake = fakeDevice((request) =>
    request[1] === 2 && request[2] === 0x82
      ? bytes(
          "0102820700000601020304050600000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a700",
        )
      : request[1] === 1
        ? bytes(
            "0101870400001610000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b300",
          )
        : response(request, { 6: 1 }),
  );
  const client = new PulsarHidClient();
  client.device = fake.device;
  assert.deepEqual(await client.readProfileIds(), [1, 2, 3, 4, 5, 6]);
  assert.equal(await client.readActiveProfile(), 1);
  assert.equal(await client.readFirmwareVersion(), "00.00.10.16");
});

test("native button mapping correctly distinguishes backward4 and forward5", () => {
  assert.deepEqual(
    BUTTON_ACTIONS.find((action) => action.id === "back")?.binding,
    { type: 1, a1: 4, a2: 0 },
  );
  assert.deepEqual(
    BUTTON_ACTIONS.find((action) => action.id === "forward")?.binding,
    { type: 1, a1: 5, a2: 0 },
  );
});
test("8K rates are rejected on cable before any part of a settings batch writes", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  const previous = {
    global: defaultGlobal(),
    profile: defaultProfile(),
    warnings: [],
  };
  await assert.rejects(
    client.writeSettings(
      { ...previous, global: { ...previous.global, pollingRate: 8000 } },
      previous,
    ),
    /1000 Hz/,
  );
  assert.equal(fake.writes.length, 0);
  fake.device.productId = 0x5403;
  const next = { ...previous.global, pollingRate: 8000 };
  client.readGlobalSettings = async () => next;
  await client.writeGlobalSettings(next, previous.global);
  assert.equal(fake.writes[0][7], 64);
});
test("1K receiver power reads skip the unsupported receiver indicator", async () => {
  const fake = fakeDevice((request) => {
    const values: Record<number, Record<number, number>> = {
      0x81: { 6: 88 },
      0x83: { 6: 0 },
      0x85: { 7: 60, 8: 0 },
      0x88: { 7: 10 },
      0x89: { 0: 4 },
    };
    return response(request, values[request[2]]);
  });
  fake.device.productId = 0x5402;
  const client = new PulsarHidClient();
  client.device = fake.device;
  assert.deepEqual(await client.readPower(), {
    batteryPercent: 88,
    charging: false,
    sleepSeconds: 60,
    lowPowerPercent: 10,
  });
  assert.ok(fake.writes.every((packet) => packet[2] !== 0x89));
  assert.equal(client.connected, true);
});
test("direct indicator reads require an 8K receiver before sending a report", async () => {
  for (const productId of [0x3401, 0x5402]) {
    const fake = fakeDevice((request) => response(request, { 7: 1 }));
    fake.device.productId = productId;
    const client = new PulsarHidClient();
    client.device = fake.device;
    await assert.rejects(client.readReceiverIndicator(), /8K/);
    assert.equal(fake.writes.length, 0);
  }
});
test("power batches reject a 1K indicator request before changing sleep settings", async () => {
  const fake = fakeDevice((request) => response(request, { 7: 1 }));
  fake.device.productId = 0x5402;
  const client = new PulsarHidClient();
  client.device = fake.device;
  await assert.rejects(
    client.writePower({ sleepSeconds: 60, receiverIndicator: 1 }),
    /8K/,
  );
  assert.equal(fake.writes.length, 0);
});
test("full settings reject a 1K indicator request before changing a profile", async () => {
  const fake = fakeDevice((request) => response(request));
  fake.device.productId = 0x5402;
  const client = new PulsarHidClient();
  client.device = fake.device;
  const previous = {
    global: defaultGlobal(),
    profile: defaultProfile(),
    warnings: [],
  };
  await assert.rejects(
    client.writeSettings(
      {
        ...previous,
        profile: { ...previous.profile, brightness: 123 },
        power: { batteryPercent: 88, charging: false, receiverIndicator: 1 },
      },
      previous,
    ),
    /8K/,
  );
  assert.equal(fake.writes.length, 0);
});
test("8K receiver indicator writes still complete with matching power readback", async () => {
  let indicator = 1;
  const fake = fakeDevice((request) => {
    if (request[1] === 8 && request[2] === 9) indicator = request[7];
    const values: Record<number, Record<number, number>> = {
      0x81: { 6: 88 },
      0x83: { 6: 0 },
      0x85: { 7: 60, 8: 0 },
      0x88: { 7: 10 },
      0x89: { 7: indicator },
    };
    return response(request, values[request[2]]);
  });
  fake.device.productId = 0x5403;
  const client = new PulsarHidClient();
  client.device = fake.device;
  assert.equal((await client.writePower({ receiverIndicator: 2 })).receiverIndicator, 2);
});
test("notification parser respects separate report ID and native one-based DPI stages", () => {
  assert.deepEqual(parseInputReport(5, new Uint8Array([5, 3, 0x40, 6])), {
    type: "dpi",
    stage: 3,
    dpi: 1600,
  });
  assert.deepEqual(parseInputReport(5, new Uint8Array([13, 88])), {
    type: "signal",
    percent: 88,
  });
  assert.deepEqual(parseInputReport(5, new Uint8Array([7, 1, 88])), {
    type: "battery",
    charging: true,
    percent: 88,
  });
  assert.deepEqual(parseInputReport(5, new Uint8Array([1, 6])), {
    type: "profile",
    profile: 6,
  });
  assert.equal(parseInputReport(0, new Uint8Array([13, 88])), null);
  assert.equal(parseInputReport(5, new Uint8Array([5, 3])), null);
});

test("malformed imported button records are rejected before reaching the UI", () => {
  const profile = defaultProfile();
  delete profile.buttons[5];
  assert.throws(() => validateProfile(profile), /every physical/);
  const unknown = defaultProfile();
  unknown.buttons[5] = { type: 200, a1: 1, a2: 0 };
  assert.throws(() => validateProfile(unknown), /Unsupported/);
  const missingRepeat = defaultProfile();
  missingRepeat.buttons[5] = { type: 4, a1: 1, a2: 0 };
  assert.throws(() => validateProfile(missingRepeat), /repeat/);
});
test("macro references are verified before any profile mutation", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultProfile(),
    next = structuredClone(previous);
  next.lod = 2;
  next.buttons[5] = { type: 5, a1: 1, a2: 0 };
  client.listMacros = async () => [];
  await assert.rejects(client.writeProfile(next, previous), /宏不存在/);
  assert.equal(fake.writes.length, 0);
});
test("a hanging HID read expires and invalidates the session instead of blocking the queue", async () => {
  const fake = fakeDevice(() => new Promise<Uint8Array>(() => {})),
    client = new PulsarHidClient({ timeoutMs: 15 });
  client.device = fake.device;
  await assert.rejects(client.transact(readCommand(1, 9, 2)), /I\/O 超时/);
  assert.equal(client.connected, false);
  assert.equal(fake.device.opened, false);
  await assert.rejects(client.transact(readCommand(1, 9, 2)), /请先连接/);
});
test("invalid power threshold is rejected before profile or global writes", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  const original = {
    global: defaultGlobal(),
    profile: defaultProfile(),
    warnings: [],
  };
  await assert.rejects(
    client.writeSettings(
      {
        ...original,
        power: { batteryPercent: 88, charging: true, lowPowerPercent: 0 },
      },
      original,
    ),
    /Low power/,
  );
  assert.equal(fake.writes.length, 0);
});

test("profile-scoped global writes target that slot instead of whichever slot becomes active", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  const previous = defaultGlobal(),
    next = { ...previous, angleSnap: true };
  client.readActiveProfile = async () => 3;
  client.readGlobalSettings = async () => next;
  await client.writeGlobalSettings(next, previous, 3);
  assert.equal(fake.writes.length, 1);
  assert.equal(fake.writes[0][6], 3);
  client.readActiveProfile = async () => 4;
  await assert.rejects(
    client.writeGlobalSettings(previous, next, 3),
    /活动配置已经变化/,
  );
  assert.equal(fake.writes.length, 1);
});
test("profile-scoped power writes pin the explicit slot and reject active-profile drift", async () => {
  const fake = fakeDevice((request) => response(request)),
    client = new PulsarHidClient();
  client.device = fake.device;
  let reads = 0;
  client.readActiveProfile = async () => (++reads === 1 ? 2 : 3);
  client.readPower = async () => ({
    batteryPercent: 88,
    charging: true,
    sleepSeconds: 60,
    lowPowerPercent: 10,
  });
  await assert.rejects(
    client.writePower({ sleepSeconds: 60 }, 2),
    /活动配置在写入期间/,
  );
  assert.equal(fake.writes[0][6], 2);
});

test("real native macro inventory skips its leading empty slot before ID 1", async () => {
  const fake = fakeDevice((request) =>
    request[2] === 0x81
      ? response(request, { 6: 1 })
      : bytes(
          "0106823800000100000000000100000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000c300",
        ),
  );
  const client = new PulsarHidClient();
  client.device = fake.device;
  client.readMacroName = async () => "测试宏";
  client.readMacroSize = async () => 6;
  assert.deepEqual(await client.listMacros(), [
    { id: 1, name: "测试宏", size: 6 },
  ]);
});

test("macro inventory continues past a page with a leading empty slot", async () => {
  const fake = fakeDevice((request) => {
    if (request[2] === 0x81) return response(request, { 6: 26 });
    const offset = request[8] ?? 0;
    const overrides: Record<number, number> = { 6: 26 };
    if (offset === 0) {
      for (let id = 1; id <= 25; id++) overrides[10 + id * 2] = id;
    } else overrides[10] = 26;
    return response(request, overrides);
  });
  const client = new PulsarHidClient();
  client.device = fake.device;
  client.readMacroName = async (id) => `Macro ${id}`;
  client.readMacroSize = async () => 6;
  const macros = await client.listMacros();
  assert.equal(macros.length, 26);
  assert.equal(macros[25].id, 26);
});
