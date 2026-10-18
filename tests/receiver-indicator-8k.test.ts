import test from "node:test";
import assert from "node:assert/strict";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { checksum, matchesReply, readCommand } from "../src/protocol";

// Exact power reads captured from real 3710:5403 hardware in
// .local/hardware-client-2026-10-18T05-03-15-276Z.json. The indicator read keeps
// the preceding low-power query's 08/88 header but updates the mode to 2.
const CAPTURE = [
  [
    "00088101000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008a00",
    "0108810100004700000000000000000003e803034006400604d007d007050019001906003200320000000000000000000000000000000000000000000000a204",
  ],
  [
    "00088301000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008c00",
    "0108830100000000000000000000000003e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000005d04",
  ],
  [
    "00088503000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009000",
    "010885030000001e000000000000000003e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000007f04",
  ],
  [
    "00088802000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009200",
    "010888020000000a000000000000000003e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000006d04",
  ],
  [
    "00088902000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009300",
    "0108880200000002000000000000000003e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000006504",
  ],
].map(([request, response]) => ({
  request: Uint8Array.from(Buffer.from(request, "hex")),
  response: Uint8Array.from(Buffer.from(response, "hex")),
}));
const LOW_POWER = CAPTURE[3];
const INDICATOR = CAPTURE[4];

function capturedPower(indicatorReply: Uint8Array = INDICATOR.response, productId = 0x5403) {
  const reports: Uint8Array[] = [];
  let response = new Uint8Array(64);
  const device: HidDevice = {
    vendorId: 0x3710,
    productId,
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
      const captured = CAPTURE.find((entry) => Buffer.from(request).equals(entry.request));
      assert.ok(captured, "Power retrieval sends only the five captured read commands");
      response = (request[2] === 0x89 ? indicatorReply : captured.response).slice();
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      return new DataView(response.buffer, response.byteOffset, response.byteLength);
    },
  };
  const client = new PulsarHidClient({ timeoutMs: 150, pollIntervalMs: 1 });
  client.device = device;
  return { client, reports, device };
}

test("8K readPower accepts the captured indicator mode after its low-power read", async () => {
  const fake = capturedPower();
  try {
    assert.deepEqual(await fake.client.readPower(), {
      batteryPercent: 71,
      charging: false,
      sleepSeconds: 30,
      lowPowerPercent: 10,
      receiverIndicator: 2,
    });
    assert.deepEqual(fake.reports, CAPTURE.map(({ request }) => request));
    assert.deepEqual(fake.client.logs.at(-1)?.bytes, Array.from(INDICATOR.response));
  } finally {
    assert.ok(fake.reports.every((packet) => (packet[2] & 0x80) !== 0));
    await fake.client.dispose();
  }
});

test("a standalone indicator read first establishes the captured low-power header", async () => {
  const fake = capturedPower();
  try {
    assert.equal(await fake.client.readReceiverIndicator(), 2);
    assert.deepEqual(fake.reports, [LOW_POWER.request, INDICATOR.request]);
  } finally {
    await fake.client.dispose();
  }
});

function changedIndicator(patch: Record<number, number>, validChecksum = true) {
  const bytes = INDICATOR.response.slice();
  for (const [offset, value] of Object.entries(patch)) bytes[Number(offset)] = value;
  const sum = checksum(bytes);
  bytes[62] = (sum & 0xff) ^ (validChecksum ? 0 : 1);
  bytes[63] = sum >> 8;
  return bytes;
}

test("the captured header compatibility also accepts native indicator mode 1", async () => {
  const fake = capturedPower(changedIndicator({ 7: 1 }));
  try {
    assert.equal(await fake.client.readReceiverIndicator(), 1);
    assert.deepEqual(fake.reports, [LOW_POWER.request, INDICATOR.request]);
  } finally {
    await fake.client.dispose();
  }
});

for (const scenario of [
  { name: "a stale low-power threshold of 10", reply: LOW_POWER.response },
  { name: "a corrupt alias checksum", reply: changedIndicator({}, false) },
  { name: "an unknown indicator mode", reply: changedIndicator({ 7: 3 }) },
  { name: "an offline alias status", reply: changedIndicator({ 0: 5 }) },
  { name: "an unsupported alias status", reply: changedIndicator({ 0: 4 }) },
  { name: "a pending alias status", reply: changedIndicator({ 0: 2 }) },
  { name: "an unrelated category", reply: changedIndicator({ 1: 1 }) },
  { name: "an unrelated retained register", reply: changedIndicator({ 2: 0x85 }) },
  { name: "an unrelated sub-register", reply: changedIndicator({ 3: 3 }) },
] as const) {
  test(`indicator compatibility cannot accept ${scenario.name}`, async () => {
    const fake = capturedPower(scenario.reply);
    try {
      await assert.rejects(fake.client.readReceiverIndicator());
      assert.deepEqual(fake.reports, [LOW_POWER.request, INDICATOR.request]);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a corrupt captured alias rejects the whole power read instead of hiding the indicator", async () => {
  const fake = capturedPower(changedIndicator({}, false));
  try {
    await assert.rejects(fake.client.readPower(), /校验和/);
    assert.deepEqual(fake.reports, CAPTURE.map(({ request }) => request));
  } finally {
    await fake.client.dispose();
  }
});

for (const [productId, label] of [[0x5402, "1K receiver"], [0x3401, "wired mouse"]] as const) {
  test(`indicator compatibility cannot enable the indicator on a ${label}`, async () => {
    const fake = capturedPower(INDICATOR.response, productId);
    try {
      await assert.rejects(fake.client.readReceiverIndicator(), /需要 8K 接收器/);
      assert.deepEqual(fake.reports, []);
      assert.deepEqual(await fake.client.readPower(), {
        batteryPercent: 71,
        charging: false,
        sleepSeconds: 30,
        lowPowerPercent: 10,
      });
      assert.deepEqual(fake.reports, CAPTURE.slice(0, 4).map(({ request }) => request));
    } finally {
      await fake.client.dispose();
    }
  });
}

test("generic protocol matching rejects the indicator's captured retained header", () => {
  assert.equal(matchesReply(INDICATOR.response, readCommand(8, 9, 2)), false);
});

for (const productId of [0x5403, 0x5402, 0x3401]) {
  test(`a generic indicator transaction stays strict for product ${productId.toString(16)}`, async () => {
    const fake = capturedPower(INDICATOR.response, productId);
    try {
      await assert.rejects(fake.client.transact(readCommand(8, 9, 2)), /响应超时 \(8:89\)/);
      assert.deepEqual(fake.reports, [INDICATOR.request]);
    } finally {
      await fake.client.dispose();
    }
  });
}
