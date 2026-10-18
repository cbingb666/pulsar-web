import test from "node:test";
import assert from "node:assert/strict";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { checksum, matchesReply, readCommand } from "../src/protocol";

// Captured from the real 3710:5403 settings interface by the read-only native
// adapter: .local/hardware-client-2026-10-18T05-00-48-699Z.json. The identity
// response has a correct body/checksum but echoes register 89 instead of 84.
const POLLING_REQUEST = Uint8Array.from(
  Buffer.from(
    "00018902000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008c00",
    "hex",
  ),
);
const POLLING_REPLY = Uint8Array.from(
  Buffer.from(
    "01018902000000080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009500",
    "hex",
  ),
);
const IDENTITY_REQUEST = Uint8Array.from(
  Buffer.from(
    "00018404000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008900",
    "hex",
  ),
);
const IDENTITY_REPLY = Uint8Array.from(
  Buffer.from(
    "01018904000010370134000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000b01",
    "hex",
  ),
);

function capturedReceiver(
  identityReply: Uint8Array = IDENTITY_REPLY,
  productId = 0x5403,
) {
  const reports: Uint8Array[] = [];
  let request: Uint8Array | undefined;
  const device: HidDevice = {
    vendorId: 0x3710,
    productId,
    productName: "8K Dongle",
    opened: false,
    collections: [
      { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
    ],
    async open() {
      this.opened = true;
    },
    async close() {
      this.opened = false;
    },
    async sendFeatureReport(reportId, data) {
      assert.equal(reportId, 0);
      request = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push(request);
      assert.ok(
        Buffer.from(request).equals(POLLING_REQUEST) ||
          Buffer.from(request).equals(IDENTITY_REQUEST),
        "Connecting uses only the captured polling and identity reads",
      );
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      const bytes = !request
        ? new Uint8Array(64) // Existing 1K route performs one passive read first.
        : request[2] === 0x89
          ? POLLING_REPLY.slice()
          : identityReply.slice();
      return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    },
  };
  return { device, reports };
}

test("8K connects through the captured identity response with register 89 and sub 04", async () => {
  const fake = capturedReceiver();
  const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
  try {
    assert.equal(await client.connectDevices([fake.device]), fake.device);
    assert.equal(client.connected, true);
    assert.equal(client.connectionAttempts[0].phase, "connected");
    assert.deepEqual(fake.reports, [POLLING_REQUEST, IDENTITY_REQUEST]);
    assert.deepEqual(
      client.logs.find((log) => log.direction === "in" && log.bytes[3] === 4)
        ?.bytes,
      Array.from(IDENTITY_REPLY),
    );
  } finally {
    assert.ok(fake.reports.every((packet) => (packet[2] & 0x80) !== 0));
    await client.dispose();
  }
});

test("8K connection skips the captured MI02 feature-read failure without sending to that interface", async () => {
  const pairing = capturedReceiver();
  pairing.device.receiveFeatureReport = async () => {
    throw new DOMException("Failed to receive the feature report.", "NotAllowedError");
  };
  const settings = capturedReceiver();
  const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
  try {
    assert.equal(await client.connectDevices([pairing.device, settings.device]), settings.device);
    assert.deepEqual(pairing.reports, []);
    assert.equal(pairing.device.opened, false);
    assert.deepEqual(settings.reports, [POLLING_REQUEST, IDENTITY_REQUEST]);
    assert.equal(client.connectionAttempts[0].phase, "probe");
    assert.equal(client.connectionAttempts[0].errorName, "NotAllowedError");
    assert.equal(client.connectionAttempts[1].probeLength, 64);
    assert.equal(client.connectionAttempts[1].phase, "connected");
  } finally {
    await client.dispose();
  }
});

function changedReply(patch: Record<number, number>, validChecksum = true) {
  const bytes = IDENTITY_REPLY.slice();
  for (const [offset, value] of Object.entries(patch))
    bytes[Number(offset)] = value;
  const sum = checksum(bytes);
  bytes[62] = (sum & 0xff) ^ (validChecksum ? 0 : 1);
  bytes[63] = sum >> 8;
  return bytes;
}

for (const scenario of [
  {
    name: "another mouse model",
    reply: changedReply({ 8: 9 }),
    expected: /3710:3409/,
  },
  {
    name: "another mouse vendor",
    reply: changedReply({ 6: 0x34, 7: 0x12 }),
    expected: /1234:3401/,
  },
  {
    name: "an unpaired mouse",
    reply: changedReply({ 6: 0, 7: 0, 8: 0, 9: 0 }),
    expected: /0000:0000/,
  },
] as const) {
  test(`8K alias routing still rejects ${scenario.name} by its returned identity`, async () => {
    const fake = capturedReceiver(scenario.reply);
    const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
    try {
      await assert.rejects(
        client.connectDevices([fake.device]),
        scenario.expected,
      );
      assert.equal(client.connected, false);
      assert.equal(fake.device.opened, false);
      assert.deepEqual(fake.reports, [POLLING_REQUEST, IDENTITY_REQUEST]);
    } finally {
      await client.dispose();
    }
  });
}

for (const scenario of [
  { name: "a stale polling reply", reply: POLLING_REPLY },
  { name: "a pending identity status", reply: changedReply({ 0: 2 }) },
  { name: "an unsupported identity status", reply: changedReply({ 0: 4 }) },
  { name: "an offline identity status", reply: changedReply({ 0: 5 }) },
  { name: "a different category", reply: changedReply({ 1: 2 }) },
  { name: "a different echoed register", reply: changedReply({ 2: 0x87 }) },
  { name: "a different sub-register", reply: changedReply({ 3: 2 }) },
  { name: "a corrupt identity checksum", reply: changedReply({}, false) },
  { name: "a truncated identity reply", reply: IDENTITY_REPLY.slice(0, 63) },
] as const) {
  test(`8K identity compatibility cannot accept ${scenario.name}`, async () => {
    const fake = capturedReceiver(scenario.reply);
    const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
    try {
      await assert.rejects(client.connectDevices([fake.device]));
      assert.equal(client.connected, false);
      assert.equal(fake.device.opened, false);
      assert.deepEqual(fake.reports, [POLLING_REQUEST, IDENTITY_REQUEST]);
    } finally {
      await client.dispose();
    }
  });
}

test("the 8K identity register exception cannot apply to a 1K receiver", async () => {
  const fake = capturedReceiver(IDENTITY_REPLY, 0x5402);
  const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
  try {
    await assert.rejects(
      client.connectDevices([fake.device]),
      /响应超时 \(1:84\)/,
    );
    assert.equal(client.connected, false);
    assert.equal(fake.device.opened, false);
  } finally {
    await client.dispose();
  }
});

test("generic protocol matching remains strict for the captured identity header", () => {
  assert.equal(matchesReply(IDENTITY_REPLY, readCommand(1, 4, 4)), false);
});

for (const [productId, label] of [
  [0x5403, "8K receiver"],
  [0x3401, "wired mouse"],
] as const) {
  test(`a direct identity transaction on an ${label} cannot use the handshake-only header exception`, async () => {
    const fake = capturedReceiver(IDENTITY_REPLY, productId);
    const client = new PulsarHidClient({ timeoutMs: 80, pollIntervalMs: 1 });
    await fake.device.open();
    client.device = fake.device;
    try {
      await assert.rejects(
        client.transact(readCommand(1, 4, 4)),
        /响应超时 \(1:84\)/,
      );
      assert.deepEqual(fake.reports, [IDENTITY_REQUEST]);
    } finally {
      await client.dispose();
    }
  });
}
