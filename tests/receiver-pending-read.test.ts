import test from "node:test";
import assert from "node:assert/strict";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { checksum, readCommand, type Command } from "../src/protocol";

// Successful profile replies captured at 8000 Hz from real 3710:5403 hardware in
// .local/hardware-client-2026-10-18T05-11-30-463Z.json. The pending response is
// deliberately simulated until a second SET: this reproduces a receiver that
// keeps returning status 02 for GET instead of forwarding a fresh mouse query.
const CAPTURE = [
  [
    "00058415000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009f00",
    "010584210000010506012003200302e803e803034006400604d007d007050019001906003200320000000000000000000000000000000000000000000000b805"
  ],
  [
    "00058102000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008900",
    "010581020000010500000000200302e803e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000006c05"
  ],
  [
    "00078203000001000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008d00",
    "01078203000001020a000000000302e803e803034006400604d007d0070500190019060032003200000000000000000000000000000000000000000000005705"
  ],
  [
    "00038303000001010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008b00",
    "01038303000001014d00000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000007203"
  ],
  [
    "0003840f000001010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009800",
    "0103840f000001010200003300000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000006703"
  ],
  [
    "00058505000001010000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009100",
    "01058505000001010a0adc0000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000001b04"
  ],
  [
    "00058505000001020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009200",
    "01058505000001020000dc0000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000000804"
  ],
  [
    "00058505000001030000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009300",
    "01058505000001030ac80a0000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000000904"
  ],
  [
    "00058505000001040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009400",
    "0105850500000104529dff0000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000001c05"
  ],
  [
    "00058505000001050000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009500",
    "0105850500000105c860000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000005704"
  ],
  [
    "00058505000001060000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009600",
    "0105850500000106c850800000000000000000000000400604d007d007050019001906003200320000000000000000000000000000000000000000000000c804"
  ],
  [
    "0004810600000101ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008c01",
    "01048106000001010101000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000002903"
  ],
  [
    "0004810600000102ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008d01",
    "01048106000001020102000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000002b03"
  ],
  [
    "0004810600000103ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008e01",
    "01048106000001030103000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000002d03"
  ],
  [
    "0004810600000104ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000008f01",
    "01048106000001040104000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000002f03"
  ],
  [
    "0004810600000105ff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009001",
    "01048106000001050105000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000003103"
  ],
  [
    "000481060000010bff00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000009601",
    "010481060000010b0903000000000000000000000000400604d007d0070500190019060032003200000000000000000000000000000000000000000000003d03"
  ]
].map(([request, response]) => ({
  request: Uint8Array.from(Buffer.from(request, "hex")),
  response: Uint8Array.from(Buffer.from(response, "hex")),
}));
const EXPECTED_PROFILE = {
  "profile": 1,
  "activeStage": 5,
  "dpiStages": [
    {
      "x": 800,
      "y": 800,
      "color": [
        10,
        10,
        220
      ]
    },
    {
      "x": 1000,
      "y": 1000,
      "color": [
        0,
        0,
        220
      ]
    },
    {
      "x": 1600,
      "y": 1600,
      "color": [
        10,
        200,
        10
      ]
    },
    {
      "x": 2000,
      "y": 2000,
      "color": [
        82,
        157,
        255
      ]
    },
    {
      "x": 6400,
      "y": 6400,
      "color": [
        200,
        96,
        0
      ]
    },
    {
      "x": 12800,
      "y": 12800,
      "color": [
        200,
        80,
        128
      ]
    }
  ],
  "lod": 1,
  "brightness": 77,
  "ledEffect": "breathe",
  "breatheSpeed": 51,
  "buttons": {
    "1": {
      "type": 1,
      "a1": 1,
      "a2": 0
    },
    "2": {
      "type": 1,
      "a1": 2,
      "a2": 0
    },
    "3": {
      "type": 1,
      "a1": 3,
      "a2": 0
    },
    "4": {
      "type": 1,
      "a1": 4,
      "a2": 0
    },
    "5": {
      "type": 1,
      "a1": 5,
      "a2": 0
    },
    "11": {
      "type": 9,
      "a1": 3,
      "a2": 0
    }
  }
};

function statusReply(request: Uint8Array, patch: Record<number, number> = {}) {
  const response = request.slice();
  response[0] = 2;
  for (const [offset, value] of Object.entries(patch)) response[Number(offset)] = value;
  const sum = checksum(response);
  response[62] = sum & 255;
  response[63] = sum >> 8;
  return response;
}

type Target = { category: number; register: number; button?: number };
const BULK: Target = { category: 5, register: 0x84 };
const ACTIVE: Target = { category: 5, register: 0x81 };
const BUTTON: Target = { category: 4, register: 0x81, button: 4 };
function matchesTarget(request: Uint8Array, target: Target) {
  return request[1] === target.category && request[2] === target.register &&
    (target.button === undefined || request[7] === target.button);
}

function pendingReceiver(options: {
  target?: Target;
  productId?: number;
  timeoutMs?: number;
  defaultTimeout?: boolean;
  nativeCadence?: boolean;
  pendingUntilSend?: number;
  pending?: (request: Uint8Array, poll: number) => Uint8Array;
  sendErrorOn?: number;
  receiveErrorOn?: number;
  disconnectOn?: number;
} = {}) {
  const target = options.target ?? BULK;
  const reports: Uint8Array[] = [];
  const pollsBeforeSend: number[] = [];
  const sendTimes: number[] = [];
  const readTimes: number[] = [];
  let request = new Uint8Array(64);
  let sends = 0;
  let polls = 0;
  let totalPolls = 0;
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
      if (matchesTarget(request, target)) {
        sendTimes.push(Date.now());
        pollsBeforeSend.push(polls);
        polls = 0;
        sends++;
        if (sends === options.sendErrorOn) throw new Error("simulated SET failure");
      }
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      if (matchesTarget(request, target)) {
        readTimes.push(Date.now());
        polls++;
        totalPolls++;
        if (totalPolls === options.receiveErrorOn) throw new Error("simulated GET failure");
        if (totalPolls === options.disconnectOn) {
          await client.disconnect();
        }
        if (sends < (options.pendingUntilSend ?? 2)) {
          const pending = options.pending?.(request, totalPolls) ?? statusReply(request);
          return new DataView(pending.buffer, pending.byteOffset, pending.byteLength);
        }
      }
      const captured = CAPTURE.find((entry) => Buffer.from(request).equals(entry.request));
      assert.ok(captured, `Only captured profile queries may be sent: ${Buffer.from(request).toString("hex")}`);
      return new DataView(captured.response.buffer, captured.response.byteOffset, captured.response.byteLength);
    },
  };
  const client = new PulsarHidClient({
    ...(options.defaultTimeout ? {} : { timeoutMs: options.timeoutMs ?? 300 }),
    ...(options.nativeCadence ? {} : { pollIntervalMs: 1 }),
  });
  client.device = device;
  return { client, device, reports, pollsBeforeSend, sendTimes, readTimes, targetReports: () => reports.filter((r) => matchesTarget(r, target)) };
}

test("8K profile read recovers stalled 05/84 pending after DPI changes", async () => {
  const fake = pendingReceiver();
  try {
    assert.deepEqual(await fake.client.readProfile(1), EXPECTED_PROFILE);
    assert.equal(fake.targetReports().length, 2);
    assert.deepEqual(fake.targetReports()[0], fake.targetReports()[1]);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
    assert.ok(fake.reports.every((packet) => (packet[2] & 0x80) !== 0));
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, target] of [["active DPI stage 05/81", ACTIVE], ["button mapping 04/81", BUTTON]] as const) {
  test(`8K profile read recovers stalled ${label} without repeating any writes`, async () => {
    const fake = pendingReceiver({ target });
    try {
      assert.deepEqual(await fake.client.readProfile(1), EXPECTED_PROFILE);
      assert.equal(fake.targetReports().length, 2);
      assert.deepEqual(fake.targetReports()[0], fake.targetReports()[1]);
      assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
      assert.ok(fake.reports.every((packet) => (packet[2] & 0x80) !== 0));
    } finally {
      await fake.client.dispose();
    }
  });
}

test("8K pending request echoes retain their original request checksum", async () => {
  const fake = pendingReceiver({
    pending(request) {
      const response = request.slice();
      response[0] = 2;
      assert.notEqual(checksum(response), response[62] | (response[63] << 8));
      return response;
    },
  });
  try {
    assert.deepEqual(await fake.client.readProfile(1), EXPECTED_PROFILE);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30]);
    assert.equal(fake.targetReports().length, 2);
  } finally {
    await fake.client.dispose();
  }
});

test("an immediately successful 8K profile read sends each query only once", async () => {
  const fake = pendingReceiver({ pendingUntilSend: 1 });
  try {
    assert.deepEqual(await fake.client.readProfile(1), EXPECTED_PROFILE);
    assert.deepEqual(fake.reports, CAPTURE.map(({ request }) => request));
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, patch, expected] of [
  ["unsupported status 04", { 0: 4 }, /不支持或拒绝/],
  ["offline status 05", { 0: 5 }, /状态 05/],
] as const) {
  test(`8K profile read stops on ${label} without repeating the query`, async () => {
    const fake = pendingReceiver({ pending: (request) => statusReply(request, patch) });
    try {
      await assert.rejects(fake.client.readProfile(1), expected);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const patch of [{}, { 10: 7 }] as Record<number, number>[]) {
  test(`8K profile read rejects corrupt pending checksum with payload ${JSON.stringify(patch)}`, async () => {
    const fake = pendingReceiver({
      pending(request) {
        const response = statusReply(request, patch);
        response[62] ^= 1;
        return response;
      },
    });
    try {
      await assert.rejects(fake.client.readProfile(1), /校验和/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("a modified pending payload cannot use the exact-request-echo checksum exception", async () => {
  const fake = pendingReceiver({
    pending(request) {
      const response = request.slice();
      response[0] = 2;
      response[10] = 7;
      return response;
    },
  });
  try {
    await assert.rejects(fake.client.readProfile(1), /校验和/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, target, patch] of [
  ["unrelated category", BULK, { 1: 7 }],
  ["unrelated register", BULK, { 2: 0x81 }],
  ["different profile", BULK, { 6: 2 }],
  ["different button", BUTTON, { 7: 5 }],
  ["zero status", BULK, { 0: 0 }],
] as const) {
  test(`8K read does not repeat a query for pending replies with ${label}`, async () => {
    const fake = pendingReceiver({ target, pending: (request) => statusReply(request, patch) });
    try {
      await assert.rejects(fake.client.readProfile(1), /响应超时/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("unrelated replies interrupt the matching pending sequence", async () => {
  const fake = pendingReceiver({
    pending: (request, poll) => statusReply(request, poll % 30 === 0 ? { 6: 2 } : {}),
  });
  try {
    await assert.rejects(fake.client.readProfile(1), /响应超时/);
    assert.equal(fake.targetReports().length, 1);
  } finally {
    await fake.client.dispose();
  }
});

for (const [label, options, expected, sends] of [
  ["first SET failure", { sendErrorOn: 1 }, /simulated SET failure/, 1],
  ["retry SET failure", { sendErrorOn: 2 }, /simulated SET failure/, 2],
  ["GET failure", { receiveErrorOn: 10 }, /simulated GET failure/, 1],
  ["disconnect", { disconnectOn: 10 }, /断开连接/, 1],
] as const) {
  test(`8K pending recovery stops after ${label}`, async () => {
    const fake = pendingReceiver(options);
    try {
      await assert.rejects(fake.client.readProfile(1), expected);
      assert.equal(fake.targetReports().length, sends);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const [productId, label] of [[0x5402, "1K receiver"], [0x3401, "wired mouse"]] as const) {
  test(`${label} profile reads do not acquire 8K pending retries`, async () => {
    const fake = pendingReceiver({ productId });
    try {
      await assert.rejects(fake.client.readProfile(1), /响应超时/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const target of [BULK, ACTIVE, BUTTON]) {
  test(`public transact cannot opt into retries for ${target.category}:${target.register.toString(16)}`, async () => {
    const fake = pendingReceiver({ target });
    const command = readCommand(target.category, target.register, target === BULK ? 0x15 : target === ACTIVE ? 2 : 6,
      1, target.button ? [target.button, 255] : [], target.button);
    try {
      await assert.rejects(fake.client.transact(command), /响应超时/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const command of [
  { category: 5, register: 4, sub: 0x21, profile: 1, payload: [5, 6] },
  { category: 5, register: 1, sub: 2, profile: 1, payload: [5] },
  { category: 4, register: 1, sub: 6, profile: 1, payload: [4, 1, 4, 0] },
] satisfies Command[]) {
  test(`setting write ${command.category}:${command.register} is never repeated on pending`, async () => {
    const fake = pendingReceiver({ target: command });
    try {
      await assert.rejects(fake.client.transact(command), /响应超时/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

for (const target of [{ category: 7, register: 0x82 }, { category: 5, register: 0x85, button: 3 }]) {
  test(`profile read ${target.category}:${target.register.toString(16)} keeps its existing no-retry behavior`, async () => {
    const fake = pendingReceiver({ target });
    try {
      await assert.rejects(fake.client.readProfile(1), /响应超时/);
      assert.equal(fake.targetReports().length, 1);
    } finally {
      await fake.client.dispose();
    }
  });
}

test("8K profile pending recovery honors an explicit shorter timeout", async () => {
  const fake = pendingReceiver({ timeoutMs: 60 });
  const started = Date.now();
  try {
    await assert.rejects(fake.client.readProfile(1), /超时/);
    assert.equal(fake.targetReports().length, 1);
    assert.ok(Date.now() - started < 500, "The explicit deadline must not expand to the receiver default");
  } finally {
    await fake.client.dispose();
  }
});

test("8K pending recovery is capped at five retries even when default deadline remains", async () => {
  const fake = pendingReceiver({ defaultTimeout: true, pendingUntilSend: Infinity });
  const started = Date.now();
  try {
    await assert.rejects(fake.client.readProfile(1), /响应超时/);
    assert.equal(fake.targetReports().length, 6);
    assert.deepEqual(fake.pollsBeforeSend, [0, 30, 30, 30, 30, 30]);
    assert.ok(Date.now() - started < 3000, "Retry exhaustion should stop without waiting for the entire deadline");
  } finally {
    await fake.client.dispose();
  }
});

test("8K pending recovery keeps native 10 ms polls and 50 ms waits around the repeat SET", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const fake = pendingReceiver({ defaultTimeout: true, nativeCadence: true });
  const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
  const tick = async (ms: number) => { t.mock.timers.tick(ms); await flush(); };
  let result: unknown;
  let failure: unknown;
  let finished = false;
  const reading = fake.client.readProfile(1).then(
    (profile) => { result = profile; finished = true; },
    (error: unknown) => { failure = error; finished = true; },
  );
  try {
    await flush();
    assert.deepEqual(fake.sendTimes, [0]);
    await tick(29);
    assert.deepEqual(fake.readTimes, []);
    await tick(1);
    assert.deepEqual(fake.readTimes, [30]);
    for (let poll = 1; poll < 30; poll++) await tick(10);
    assert.equal(fake.readTimes.length, 30);
    assert.equal(fake.readTimes.at(-1), 320);
    assert.deepEqual(fake.sendTimes, [0]);
    await tick(49);
    assert.deepEqual(fake.sendTimes, [0]);
    await tick(1);
    assert.deepEqual(fake.sendTimes, [0, 370]);
    await tick(49);
    assert.equal(fake.readTimes.length, 30);
    await tick(1);
    assert.equal(fake.readTimes.at(-1), 420);
    for (let query = 0; query < CAPTURE.length && !finished; query++) await tick(30);
    assert.equal(finished, true);
    await reading;
    assert.equal(failure, undefined);
    assert.deepEqual(result, EXPECTED_PROFILE);
  } finally {
    await fake.client.dispose();
  }
});
