import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setImmediate } from "node:timers/promises";
import { withMockClock } from "./helpers/mock-clock";
import type { HidApi, HidCollection, HidDevice } from "../src/hid";
import {
  buildPairingReport,
  pairReceiver,
  requestPairingDevices,
  selectPairingInterface,
  type PairingLog,
  type PairingOptions,
} from "../src/receiver-pairing";

// Source-derived fixture from the official 8K Pair V0.11/V0.12 WriteFile path.
// These tests do not establish real 8K descriptors, framing, timing or pairing.
const START_PACKET = Uint8Array.from([
  0x48,
  0x4d,
  0x52,
  0x44,
  0xfc,
  0x24,
  ...Array<number>(58).fill(0),
]);

function pairingCollection(): HidCollection {
  return {
    usagePage: 0xffff,
    usage: 1,
    featureReports: [],
    inputReports: [
      { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] },
    ],
    outputReports: [
      { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] },
    ],
  };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function receiver() {
  const inputEvents = new EventTarget();
  const hidEvents = new EventTarget();
  const reports: { reportId: number; bytes: Uint8Array }[] = [];
  const calls = { open: 0, close: 0, request: 0 };
  const operations = {
    open: async () => {},
    close: async () => {},
    send: async () => {},
  };
  let filters: Parameters<HidApi["requestDevice"]>[0]["filters"] | undefined;
  const device: HidDevice = {
    vendorId: 0x3710,
    productId: 0x5403,
    productName: "Pulsar 8K Dongle",
    opened: false,
    collections: [pairingCollection()],
    async open() {
      calls.open++;
      await operations.open();
      this.opened = true;
    },
    async close() {
      calls.close++;
      await operations.close();
      this.opened = false;
    },
    async sendReport(reportId, data) {
      assert.equal(this.opened, true);
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push({ reportId, bytes });
      await operations.send();
    },
    async sendFeatureReport() {
      assert.fail("Pairing must not use feature reports");
    },
    async receiveFeatureReport() {
      return assert.fail("Pairing must consume input reports");
    },
    addEventListener: (type, listener) =>
      inputEvents.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      inputEvents.removeEventListener(type, listener),
  };
  const hid: HidApi = {
    async getDevices() {
      return [device];
    },
    async requestDevice(options) {
      calls.request++;
      filters = options.filters;
      return [device];
    },
    addEventListener: (type, listener) =>
      hidEvents.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      hidEvents.removeEventListener(type, listener),
  };
  return {
    device,
    hid,
    reports,
    calls,
    operations,
    filters: () => filters,
    input(status: number, reportId = 0, length = 64, offset = 0) {
      const buffer = new Uint8Array(length + offset);
      if (length > 6) buffer[offset + 6] = status;
      inputEvents.dispatchEvent(
        Object.assign(new Event("inputreport"), {
          reportId,
          data: new DataView(buffer.buffer, offset, length),
        }),
      );
    },
    disconnect(disconnected = device) {
      hidEvents.dispatchEvent(
        Object.assign(new Event("disconnect"), { device: disconnected }),
      );
    },
    assertClean(signal?: AbortSignal) {
      assert.equal(getEventListeners(inputEvents, "inputreport").length, 0);
      assert.equal(getEventListeners(hidEvents, "disconnect").length, 0);
      if (signal) assert.equal(getEventListeners(signal, "abort").length, 0);
      assert.ok(calls.close >= 1, "Every opened or attempted handle is closed");
      assert.equal(device.opened, false);
    },
  };
}

function pair(fake: ReturnType<typeof receiver>, options: PairingOptions = {}) {
  return pairReceiver([fake.device], {
    hid: fake.hid,
    timeoutMs: 200,
    ioTimeoutMs: 100,
    ...options,
  });
}

test("pairing start fixture is exactly 64 native payload bytes without a checksum", () => {
  assert.deepEqual(buildPairingReport(), START_PACKET);
  const first = buildPairingReport();
  first.fill(255);
  assert.deepEqual(buildPairingReport(), START_PACKET);
});

test("picker requests only the original 3710:5403 receiver without an invented usage filter", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    assert.deepEqual(await requestPairingDevices(fake.hid), [fake.device]);
    assert.deepEqual(fake.filters(), [{ vendorId: 0x3710, productId: 0x5403 }]);
    assert.equal(fake.calls.request, 1);
    assert.equal(fake.calls.open, 0);
    assert.deepEqual(fake.reports, []);
  });
});

test("an empty picker selection and a rejected permission request cannot start pairing", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    fake.hid.requestDevice = async () => [];
    await assert.rejects(requestPairingDevices(fake.hid), /未选择/);
    const denied = new Error("Permission denied");
    fake.hid.requestDevice = async () => {
      throw denied;
    };
    await assert.rejects(
      requestPairingDevices(fake.hid),
      (error) => error === denied,
    );
    assert.equal(fake.calls.open, 0);
    assert.deepEqual(fake.reports, []);
  });
});

test("selection finds nested vendor reports and deduplicates the same HID object", () => {
  const fake = receiver();
  const nested = pairingCollection();
  // Report descriptors may split the 512 bits across multiple items.
  nested.inputReports![0].items = [
    { reportSize: 8, reportCount: 32 },
    { reportSize: 16, reportCount: 16 },
  ];
  fake.device.collections = [
    { usagePage: 1, usage: 2, featureReports: [], children: [nested] },
  ];
  assert.equal(selectPairingInterface([fake.device, fake.device]), fake.device);
  assert.equal(fake.calls.open, 0);
});

const invalidDescriptors: {
  name: string;
  change: (device: HidDevice) => void;
}[] = [
  {
    name: "a different vendor",
    change: (d) => {
      d.vendorId = 0x1234;
    },
  },
  {
    name: "a 1K receiver",
    change: (d) => {
      d.productId = 0x5402;
    },
  },
  {
    name: "an unknown receiver generation",
    change: (d) => {
      d.productId = 0x5404;
    },
  },
  {
    name: "a generic mouse usage page",
    change: (d) => {
      d.collections[0].usagePage = 1;
    },
  },
  {
    name: "missing input reports",
    change: (d) => {
      d.collections[0].inputReports = [];
    },
  },
  {
    name: "missing output reports",
    change: (d) => {
      d.collections[0].outputReports = [];
    },
  },
  {
    name: "numbered input reports",
    change: (d) => {
      d.collections[0].inputReports![0].reportId = 1;
    },
  },
  {
    name: "numbered output reports",
    change: (d) => {
      d.collections[0].outputReports![0].reportId = 1;
    },
  },
  {
    name: "a short input descriptor",
    change: (d) => {
      d.collections[0].inputReports![0].items![0].reportCount = 63;
    },
  },
  {
    name: "a long output descriptor",
    change: (d) => {
      d.collections[0].outputReports![0].items![0].reportCount = 65;
    },
  },
  {
    name: "unknown report size",
    change: (d) => {
      delete d.collections[0].inputReports![0].items;
    },
  },
  {
    name: "reports split across unrelated collections",
    change: (d) => {
      const second = pairingCollection();
      second.inputReports = [];
      d.collections[0].outputReports = [];
      d.collections.push(second);
    },
  },
  {
    name: "no sendReport support",
    change: (d) => {
      delete d.sendReport;
    },
  },
  {
    name: "no input event support",
    change: (d) => {
      delete d.addEventListener;
    },
  },
  {
    name: "no listener cleanup support",
    change: (d) => {
      delete d.removeEventListener;
    },
  },
];
for (const { name, change } of invalidDescriptors) {
  test(`pairing rejects ${name} before opening or sending`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      change(fake.device);
      await assert.rejects(pair(fake), /配对/);
      assert.equal(fake.calls.open, 0);
      assert.deepEqual(fake.reports, []);
    });
  });
}

test("selection ignores unrelated devices but refuses two matching interfaces without writes", async (context) => {
  await withMockClock(context, async () => {
    const first = receiver();
    const second = receiver();
    const unrelated = receiver();
    unrelated.device.productId = 0x5402;
    assert.equal(
      selectPairingInterface([unrelated.device, first.device]),
      first.device,
    );
    await assert.rejects(
      pairReceiver([first.device, second.device], { hid: first.hid }),
      /无法确认/,
    );
    assert.equal(first.calls.open + second.calls.open, 0);
    assert.deepEqual([...first.reports, ...second.reports], []);
  });
});

for (const [status, expected] of [
  [2, "already-paired"],
  [3, "paired"],
] as const) {
  test(`input status ${status} settles as ${expected}, even before sendReport completes`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const controller = new AbortController();
      const logs: PairingLog[] = [];
      fake.operations.send = async () => {
        fake.input(status, 0, 64, 5);
      };
      assert.equal(
        await pair(fake, {
          signal: controller.signal,
          onLog: (entry) => logs.push(entry),
        }),
        expected,
      );
      assert.deepEqual(fake.reports, [{ reportId: 0, bytes: START_PACKET }]);
      assert.deepEqual(
        logs.map((entry) => entry.direction),
        ["out", "in"],
      );
      assert.deepEqual(logs[0].bytes, Array.from(START_PACKET));
      assert.equal(logs[1].bytes[6], status);
      fake.assertClean(controller.signal);
    });
  });
}

test("pending and unknown statuses wait for success without polling or resending start", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    let settled = false;
    const result = pair(fake).finally(() => {
      settled = true;
    });
    await setImmediate();
    assert.equal(fake.reports.length, 1);
    fake.input(0);
    fake.input(1);
    fake.input(255);
    await setImmediate();
    assert.equal(settled, false);
    assert.equal(fake.reports.length, 1);
    fake.input(3);
    assert.equal(await result, "paired");
    fake.assertClean();
  });
});

test("already-paired is only recognized in the initial valid input report", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    let settled = false;
    const result = pair(fake).finally(() => {
      settled = true;
    });
    await setImmediate();
    fake.input(0);
    fake.input(2);
    await setImmediate();
    assert.equal(settled, false);
    fake.input(3);
    assert.equal(await result, "paired");
    assert.equal(fake.reports.length, 1);
    fake.assertClean();
  });
});

test("wrong report IDs and truncated/oversized payloads cannot indicate pairing success", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    let settled = false;
    const logs: PairingLog[] = [];
    const result = pair(fake, { onLog: (entry) => logs.push(entry) }).finally(
      () => {
        settled = true;
      },
    );
    await setImmediate();
    fake.input(3, 1);
    fake.input(3, 0, 7);
    fake.input(3, 0, 63);
    fake.input(3, 0, 65);
    await setImmediate();
    assert.equal(settled, false);
    // Preserve unexpected framing in diagnostics without treating it as success.
    assert.deepEqual(
      logs.map((entry) => [entry.reportId, entry.bytes.length]),
      [
        [0, 64],
        [1, 64],
        [0, 7],
        [0, 63],
        [0, 65],
      ],
    );
    // Invalid events do not consume the initial valid reply position.
    fake.input(2);
    assert.equal(await result, "already-paired");
    fake.assertClean();
  });
});

test("input reports arriving while open is still pending cannot finish pairing", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const opening = deferred();
    fake.operations.open = () => opening.promise;
    const result = pair(fake);
    fake.input(3);
    opening.resolve();
    await setImmediate();
    assert.equal(fake.reports.length, 1);
    fake.input(4);
    await assert.rejects(result, /配对失败/);
    fake.assertClean();
  });
});

test("receiver-reported failure terminates pairing without any retry", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    fake.operations.send = async () => {
      fake.input(4);
    };
    await assert.rejects(pair(fake), /配对失败/);
    assert.equal(fake.reports.length, 1);
    fake.assertClean();
  });
});

test("pairing timeout closes the handle and removes listeners without resending", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const controller = new AbortController();
    await assert.rejects(
      pair(fake, { signal: controller.signal, timeoutMs: 10 }),
      /未确认配对结果/,
    );
    assert.equal(fake.reports.length, 1);
    fake.assertClean(controller.signal);
  });
});

test("an already-open interface is used once and still closed on success", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    fake.device.opened = true;
    fake.operations.send = async () => {
      fake.input(3);
    };
    assert.equal(await pair(fake), "paired");
    assert.equal(fake.calls.open, 0);
    assert.equal(fake.reports.length, 1);
    fake.assertClean();
  });
});

test("an open failure cannot send a pairing command and still cleans up", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const failure = new Error("Cannot open device");
    fake.operations.open = async () => {
      throw failure;
    };
    await assert.rejects(pair(fake), (error) => error === failure);
    assert.deepEqual(fake.reports, []);
    fake.assertClean();
  });
});

for (const ending of ["abort", "timeout"] as const) {
  test(`${ending} during open sends nothing and closes a late-opened handle again`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const controller = new AbortController();
      const opening = deferred();
      fake.operations.open = () => opening.promise;
      const result = pair(fake, { signal: controller.signal, ioTimeoutMs: 10 });
      const rejected = assert.rejects(
        result,
        ending === "abort" ? /停止等待配对/ : /I\/O 超时/,
      );
      await setImmediate();
      assert.equal(fake.calls.open, 1);
      if (ending === "abort") controller.abort();
      await rejected;
      assert.deepEqual(fake.reports, []);
      fake.assertClean(controller.signal);
      opening.resolve();
      await setImmediate();
      assert.equal(fake.calls.close, 2);
      fake.assertClean(controller.signal);
    });
  });
}

test("abort before opening cannot issue a pairing command", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      pair(fake, { signal: controller.signal }),
      /停止等待配对/,
    );
    assert.equal(fake.calls.open, 0);
    assert.deepEqual(fake.reports, []);
    fake.assertClean(controller.signal);
  });
});

for (const callback of ["progress", "log"] as const) {
  test(`abort in the pre-send ${callback} callback prevents the pairing write`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const controller = new AbortController();
      await assert.rejects(
        pair(fake, {
          signal: controller.signal,
          onProgress: (message) => {
            if (callback === "progress" && message.includes("正在配对"))
              controller.abort();
          },
          onLog: (entry) => {
            if (callback === "log" && entry.direction === "out")
              controller.abort();
          },
        }),
        /停止等待配对/,
      );
      assert.deepEqual(fake.reports, []);
      fake.assertClean(controller.signal);
    });
  });
}

for (const phase of ["send", "waiting"] as const) {
  test(`abort while ${phase} is pending stops listening and never sends a cancel packet`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const controller = new AbortController();
      const sending = deferred();
      if (phase === "send") fake.operations.send = () => sending.promise;
      const result = pair(fake, { signal: controller.signal });
      const rejected = assert.rejects(result, /已发送的配对命令无法撤回/);
      await setImmediate();
      assert.equal(fake.reports.length, 1);
      controller.abort();
      await rejected;
      sending.resolve();
      fake.input(3);
      assert.equal(fake.reports.length, 1);
      fake.assertClean(controller.signal);
    });
  });
}

test("disconnect of another device is ignored; target removal ends the pending wait", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const controller = new AbortController();
    let settled = false;
    const result = pair(fake, { signal: controller.signal }).finally(() => {
      settled = true;
    });
    const rejected = assert.rejects(result, /已拔出/);
    await setImmediate();
    fake.disconnect(receiver().device);
    await setImmediate();
    assert.equal(settled, false);
    fake.disconnect();
    await rejected;
    assert.equal(fake.reports.length, 1);
    fake.assertClean(controller.signal);
  });
});

test("disconnect interrupts a hung send and preserves the disconnect error", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const controller = new AbortController();
    const sending = deferred();
    fake.operations.send = () => sending.promise;
    const result = pair(fake, { signal: controller.signal, ioTimeoutMs: 30 });
    const rejected = assert.rejects(result, /8K 接收器已拔出，配对结果未确认/);
    await setImmediate();
    assert.equal(fake.reports.length, 1);
    fake.disconnect();
    await rejected;
    fake.assertClean(controller.signal);
    sending.resolve();
    await setImmediate();
    assert.equal(fake.reports.length, 1);
    fake.assertClean(controller.signal);
  });
});

for (const earlySuccess of [false, true]) {
  test(`send failure is propagated without retry${earlySuccess ? ", even after an early success report" : ""}`, async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const failure = new Error("Write rejected");
      fake.operations.send = async () => {
        if (earlySuccess) fake.input(3);
        throw failure;
      };
      await assert.rejects(pair(fake), (error) => error === failure);
      assert.equal(fake.reports.length, 1);
      fake.assertClean();
    });
  });
}

test("a stuck send times out, cleans up and does not resend the start packet", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    const sending = deferred();
    fake.operations.send = () => sending.promise;
    await assert.rejects(pair(fake, { ioTimeoutMs: 10 }), /I\/O 超时/);
    sending.resolve();
    assert.equal(fake.reports.length, 1);
    fake.assertClean();
  });
});

test("a close rejection does not mask a confirmed result or leak event listeners", async (context) => {
  await withMockClock(context, async () => {
    const fake = receiver();
    fake.operations.send = async () => {
      fake.input(3);
    };
    fake.operations.close = async () => {
      fake.device.opened = false;
      throw new Error("Already disconnected");
    };
    assert.equal(await pair(fake), "paired");
    fake.assertClean();
  });
});

test(
  "a stuck close cannot keep a confirmed pairing result pending forever",
  { timeout: 1000 },
  async (context) => {
    await withMockClock(context, async () => {
      const fake = receiver();
      const closing = deferred();
      const controller = new AbortController();
      fake.operations.send = async () => {
        fake.input(3);
      };
      fake.operations.close = () => closing.promise;
      assert.equal(
        await pair(fake, { signal: controller.signal, ioTimeoutMs: 10 }),
        "paired",
      );
      assert.equal(fake.calls.close, 1);
      closing.resolve();
      await setImmediate();
      fake.assertClean(controller.signal);
    });
  },
);
