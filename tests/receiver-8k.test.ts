import test from "node:test";
import assert from "node:assert/strict";
import {
  PulsarHidClient,
  UnsupportedCommandError,
  type HidDevice,
} from "../src/hid";
import {
  checksum,
  defaultGlobal,
  readCommand,
  type Command,
} from "../src/protocol";

// These replies model the recovered native protocol, not an 8K hardware capture.
function reply(request: Uint8Array, patch: Record<number, number> = {}) {
  const packet = request.slice();
  packet[0] = 1;
  for (const [offset, value] of Object.entries(patch))
    packet[Number(offset)] = value;
  const sum = checksum(packet);
  packet[62] = sum & 255;
  packet[63] = sum >> 8;
  return packet;
}

function receiver8k(
  override?: (
    request: Uint8Array,
  ) => Uint8Array | undefined | Promise<Uint8Array>,
) {
  const state = { pollingCode: 8, indicator: 1, activeProfile: 2 };
  const reports: Uint8Array[] = [];
  let request = new Uint8Array(64);
  const device: HidDevice = {
    vendorId: 0x3710,
    productId: 0x5403,
    productName: "Pulsar 8K Dongle",
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
      assert.equal(this.opened, true);
      request = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      assert.equal(request.length, 64);
      assert.equal(checksum(request), request[62] | (request[63] << 8));
      reports.push(request);
    },
    async receiveFeatureReport(reportId) {
      assert.equal(reportId, 0);
      const response = await answer();
      return new DataView(
        response.buffer,
        response.byteOffset,
        response.byteLength,
      );
    },
  };
  async function answer(): Promise<Uint8Array> {
    if (!reports.length) return new Uint8Array(64); // Passive interface check.
    const replacement = await override?.(request);
    if (replacement) return replacement;
    switch (`${request[1]}:${request[2]}`) {
      case "1:132": // Paired mouse identity, 01/84.
        return reply(request, { 6: 0x10, 7: 0x37, 8: 0x01, 9: 0x34 });
      case "1:137":
        return reply(request, { 7: state.pollingCode });
      case "1:9":
        state.pollingCode = request[7];
        return reply(request);
      case "2:134":
        return reply(request, { 6: state.activeProfile });
      case "4:131":
        return reply(request, { 7: 3 });
      case "7:132":
      case "7:131":
      case "7:133":
        return reply(request, { 7: 0 });
      case "8:129":
        return reply(request, { 6: 88 });
      case "8:131":
        return reply(request, { 6: 0 });
      case "8:133":
        return reply(request, { 7: 60, 8: 0 });
      case "8:136":
        return reply(request, { 7: 10 });
      case "8:137":
        return reply(request, { 7: state.indicator });
      case "8:9":
        state.indicator = request[7];
        return reply(request);
      default:
        assert.fail(`Unexpected 8K command ${request[1]}:${request[2]}`);
    }
  }
  return {
    device,
    state,
    reports,
    settingsWrites: () => reports.filter((packet) => (packet[2] & 0x80) === 0),
  };
}

for (const [rate, code] of [
  [2000, 16],
  [4000, 32],
  [8000, 64],
] as const) {
  test(`8K picker connects an Xlite v4 already running at ${rate} Hz using reads only`, async () => {
    const fake = receiver8k();
    fake.state.pollingCode = code;
    let pickerCalls = 0;
    const client = new PulsarHidClient({
      hid: {
        async getDevices() {
          return [];
        },
        async requestDevice({ filters }) {
          pickerCalls++;
          assert.ok(
            filters.some(
              (filter) =>
                filter.vendorId === 0x3710 &&
                filter.productId === 0x5403 &&
                filter.usagePage === 0xffff,
            ),
          );
          return [fake.device];
        },
      },
    });
    try {
      assert.equal(await client.connect(), fake.device);
      assert.equal(pickerCalls, 1);
      assert.equal(client.connected, true);
      assert.equal(client.maxPollingRate, 8000);
      assert.equal(client.connectionAttempts[0].phase, "connected");
      assert.deepEqual(await client.readGlobalSettings(), {
        ...defaultGlobal(),
        pollingRate: rate,
      });
      assert.deepEqual(
        fake.reports
          .slice(0, 2)
          .map((packet) => [packet[1], packet[2], packet[3]]),
        [
          [1, 0x89, 2],
          [1, 0x84, 4],
        ],
      );
      assert.deepEqual(fake.settingsWrites(), []);
    } finally {
      await client.dispose();
    }
  });

  test(`8K ${rate} Hz changes send encoding ${code} and verify real register readback`, async () => {
    const fake = receiver8k();
    const client = new PulsarHidClient();
    try {
      await client.connectDevices([fake.device]);
      const original = await client.readGlobalSettings();
      const next = { ...original, pollingRate: rate };
      assert.deepEqual(
        await client.writeGlobalSettings(next, original, 2),
        next,
      );
      assert.deepEqual(await client.readGlobalSettings(), next);
      assert.deepEqual(
        fake.settingsWrites().map((packet) => Array.from(packet.slice(1, 8))),
        [[1, 9, 2, 0, 0, 2, code]],
      );
      // Return to 1K through the same 8K connection without changing other settings.
      assert.deepEqual(
        await client.writeGlobalSettings(original, next, 2),
        original,
      );
      assert.deepEqual(
        fake.settingsWrites().map((packet) => packet[7]),
        [code, 8],
      );
      assert.equal(fake.state.pollingCode, 8);
    } finally {
      await client.dispose();
    }
  });
}

const connectionFailures: {
  name: string;
  register: number;
  patch: Record<number, number>;
  expected: RegExp;
}[] = [
  {
    name: "a different mouse model",
    register: 0x84,
    patch: { 6: 0x10, 7: 0x37, 8: 9, 9: 0x34 },
    expected: /3710:3409/,
  },
  {
    name: "a different mouse vendor",
    register: 0x84,
    patch: { 6: 0x34, 7: 0x12, 8: 1, 9: 0x34 },
    expected: /1234:3401/,
  },
  {
    name: "no paired mouse",
    register: 0x84,
    patch: { 6: 0, 7: 0, 8: 0, 9: 0 },
    expected: /0000:0000/,
  },
  {
    name: "an offline polling response",
    register: 0x89,
    patch: { 0: 5 },
    expected: /状态 05/,
  },
  {
    name: "an offline identity response",
    register: 0x84,
    patch: { 0: 5 },
    expected: /状态 05/,
  },
  {
    name: "an unknown polling encoding",
    register: 0x89,
    patch: { 7: 128 },
    expected: /未知轮询率/,
  },
];
for (const scenario of connectionFailures) {
  test(`8K connection rejects ${scenario.name} before configuration writes`, async () => {
    const fake = receiver8k((request) =>
      request[2] === scenario.register
        ? reply(request, scenario.patch)
        : undefined,
    );
    const client = new PulsarHidClient();
    await assert.rejects(
      client.connectDevices([fake.device]),
      scenario.expected,
    );
    assert.equal(client.connected, false);
    assert.equal(fake.device.opened, false);
    assert.deepEqual(fake.settingsWrites(), []);
    assert.equal(
      fake.reports.filter((packet) => packet[2] === scenario.register).length,
      1,
    );
    // A failed handshake cannot leave a usable handle for a subsequent setting.
    await assert.rejects(
      client.writeGlobalSettings(
        { ...defaultGlobal(), debounce: 4 },
        defaultGlobal(),
      ),
      /请先连接鼠标/,
    );
    assert.deepEqual(fake.settingsWrites(), []);
    await client.dispose();
  });
}

test("8K polling write acknowledgement is insufficient when the receiver keeps its old rate", async () => {
  const fake = receiver8k((request) =>
    request[1] === 1 && request[2] === 9 ? reply(request) : undefined,
  );
  const client = new PulsarHidClient();
  try {
    await client.connectDevices([fake.device]);
    const previous = await client.readGlobalSettings();
    await assert.rejects(
      client.writeGlobalSettings(
        { ...previous, pollingRate: 8000 },
        previous,
        2,
      ),
      /pollingRate.*回读不一致/,
    );
    assert.equal(fake.settingsWrites().length, 1);
    assert.equal(fake.state.pollingCode, 8);
  } finally {
    await client.dispose();
  }
});

for (const mode of [1, 2] as const) {
  test(`8K indicator mode ${mode} reads and writes its native mode without changing other power fields`, async () => {
    const fake = receiver8k();
    fake.state.indicator = mode === 1 ? 2 : 1;
    const client = new PulsarHidClient();
    try {
      await client.connectDevices([fake.device]);
      assert.equal(await client.readReceiverIndicator(), fake.state.indicator);
      assert.deepEqual(
        await client.writePower({ receiverIndicator: mode }, 2),
        {
          batteryPercent: 88,
          charging: false,
          sleepSeconds: 60,
          lowPowerPercent: 10,
          receiverIndicator: mode,
        },
      );
      assert.equal(await client.readReceiverIndicator(), mode);
      assert.deepEqual(
        fake.settingsWrites().map((packet) => Array.from(packet.slice(1, 8))),
        [[8, 9, 2, 0, 0, 2, mode]],
      );
    } finally {
      await client.dispose();
    }
  });
}

test("8K unsupported indicator does not prevent reading battery and sleep information", async () => {
  const fake = receiver8k((request) =>
    request[1] === 8 && request[2] === 0x89
      ? reply(request, { 0: 4 })
      : undefined,
  );
  const client = new PulsarHidClient();
  try {
    await client.connectDevices([fake.device]);
    await assert.rejects(
      client.readReceiverIndicator(),
      UnsupportedCommandError,
    );
    assert.deepEqual(await client.readPower(), {
      batteryPercent: 88,
      charging: false,
      sleepSeconds: 60,
      lowPowerPercent: 10,
    });
    assert.equal(client.connected, true);
    assert.deepEqual(fake.settingsWrites(), []);
  } finally {
    await client.dispose();
  }
});

for (const failure of [
  "offline",
  "unknown mode",
  "corrupt success",
  "corrupt unsupported",
] as const) {
  test(`8K power read surfaces indicator ${failure} instead of hiding the control as unsupported`, async () => {
    const fake = receiver8k((request) => {
      if (request[1] !== 8 || request[2] !== 0x89) return;
      if (failure === "offline") return reply(request, { 0: 5 });
      if (failure === "unknown mode") return reply(request, { 7: 3 });
      const packet = reply(request, {
        0: failure === "corrupt unsupported" ? 4 : 1,
        7: 1,
      });
      packet[63] ^= 1;
      return packet;
    });
    const client = new PulsarHidClient();
    try {
      await client.connectDevices([fake.device]);
      await assert.rejects(
        client.readPower(),
        failure === "offline"
          ? /状态 05/
          : failure === "unknown mode"
            ? /接收器指示灯/
            : /校验和/,
      );
      assert.deepEqual(fake.settingsWrites(), []);
    } finally {
      await client.dispose();
    }
  });
}

test("8K hanging indicator read closes the connection and rejects the whole power read", async () => {
  const fake = receiver8k((request) =>
    request[1] === 8 && request[2] === 0x89
      ? new Promise<Uint8Array>(() => {})
      : undefined,
  );
  let disconnects = 0;
  const client = new PulsarHidClient({
    timeoutMs: 250,
    onDisconnect: () => {
      disconnects++;
    },
  });
  try {
    await client.connectDevices([fake.device]);
    await assert.rejects(client.readPower(), /HID I\/O 超时/);
    assert.equal(client.connected, false);
    assert.equal(fake.device.opened, false);
    assert.equal(disconnects, 1);
    assert.deepEqual(fake.settingsWrites(), []);
  } finally {
    await client.dispose();
  }
});

test("8K first GET follows the native 30 ms default and 100 ms firmware/indicator pacing", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 0 });
  const cases: [Command, number][] = [
    [readCommand(1, 9, 2), 30],
    [readCommand(1, 4, 4), 30],
    [readCommand(1, 7, 4), 100],
    [readCommand(8, 9, 2), 100],
    [{ category: 8, register: 9, sub: 2, profile: 2, payload: [2] }, 100],
  ];
  const flush = async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  };
  for (const [command, waitMs] of cases) {
    let receives = 0;
    const fake = receiver8k((request) => {
      receives++;
      return reply(request);
    });
    fake.device.opened = true;
    const client = new PulsarHidClient();
    client.device = fake.device;
    try {
      const operation = client.transact(command);
      await flush();
      assert.equal(fake.reports.length, 1);
      assert.equal(receives, 0);
      t.mock.timers.tick(waitMs - 1);
      await flush();
      assert.equal(receives, 0);
      t.mock.timers.tick(1);
      await flush();
      assert.equal(receives, 1);
      await operation;
      assert.equal(fake.reports.length, 1);
    } finally {
      await client.dispose();
    }
  }
});

for (const mode of [0, 3, 255]) {
  test(`8K rejects unknown indicator mode ${mode} and validates writes before changing power settings`, async () => {
    const fake = receiver8k();
    fake.state.indicator = mode;
    const client = new PulsarHidClient();
    try {
      await client.connectDevices([fake.device]);
      await assert.rejects(
        client.readReceiverIndicator(),
        /接收器指示灯/,
      );
      await assert.rejects(
        client.writePower({
          sleepSeconds: 120,
          receiverIndicator: mode as 1 | 2,
        }),
        /接收器指示灯/,
      );
      assert.deepEqual(fake.settingsWrites(), []);
    } finally {
      await client.dispose();
    }
  });
}

for (const status of [4, 5]) {
  test(`8K indicator write status ${status} fails without resending or claiming success`, async () => {
    const fake = receiver8k((request) =>
      request[1] === 8 && request[2] === 9
        ? reply(request, { 0: status })
        : undefined,
    );
    const client = new PulsarHidClient();
    try {
      await client.connectDevices([fake.device]);
      await assert.rejects(
        client.writePower({ receiverIndicator: 2 }),
        status === 4 ? /不支持或拒绝/ : /状态 05/,
      );
      assert.equal(fake.settingsWrites().length, 1);
      assert.equal(fake.state.indicator, 1);
    } finally {
      await client.dispose();
    }
  });
}

test("8K indicator write fails if readback still reports the previous mode", async () => {
  const fake = receiver8k((request) =>
    request[1] === 8 && request[2] === 9 ? reply(request) : undefined,
  );
  const client = new PulsarHidClient();
  try {
    await client.connectDevices([fake.device]);
    await assert.rejects(
      client.writePower({ receiverIndicator: 2 }, 2),
      /电源设置回读不一致/,
    );
    assert.equal(fake.settingsWrites().length, 1);
    assert.equal(fake.state.indicator, 1);
  } finally {
    await client.dispose();
  }
});
