import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { setImmediate } from "node:timers/promises";
import type { HidApi, HidCollection, HidDevice } from "../src/hid";
import { buildPairingReport, pairReceiver } from "../src/receiver-pairing";

// Passive capture: .local/8k-passive-20261018T045508Z.json. One 3710:5403
// exposes MI02 and MI03 with identical descriptors. MI02 GET_FEATURE(0)
// rejects; MI03 returns this 64-byte settings reply (native report ID removed).
// The 1K capture .local/receiver-routing-20261015T202350Z.json has the same
// descriptors; its MI02 passive read returns only one zero byte.
// The pairing status below is source-derived, not a captured hardware pairing.
const SETTINGS_REPLY = Uint8Array.from([
  0x05,
  ...Array<number>(61).fill(0),
  0x05,
  0x00,
]);

function collection(): HidCollection {
  const report = () => ({
    reportId: 0,
    items: [{ reportSize: 8, reportCount: 64 }],
  });
  return {
    usagePage: 0xffff,
    usage: 1,
    inputReports: [report()],
    outputReports: [report()],
    featureReports: [report()],
  };
}

function channel(
  kind: "pairing" | "settings",
  transportErrorName = "NotAllowedError",
  productId = 0x5403,
) {
  const events = new EventTarget();
  const calls = { open: 0, close: 0, receive: 0, featureSend: 0 };
  const reports: { reportId: number; bytes: Uint8Array }[] = [];
  const operations = {
    open: async () => {},
    receive: async (): Promise<DataView> => {
      if (kind === "pairing") {
        if (productId === 0x5402)
          return new DataView(Uint8Array.of(0).buffer);
        // Current Chromium maps a failed native GET_FEATURE to NotAllowedError;
        // WebHID specifies NetworkError. The exact transport message matters.
        throw new DOMException(
          "Failed to receive the feature report.",
          transportErrorName,
        );
      }
      return new DataView(SETTINGS_REPLY.slice().buffer);
    },
    beforeSend: () => {},
  };
  const device: HidDevice = {
    vendorId: 0x3710,
    productId,
    productName: productId === 0x5402 ? "1K Dongle" : "8K Dongle",
    opened: false,
    collections: [collection()],
    async open() {
      calls.open++;
      await operations.open();
      this.opened = true;
    },
    async close() {
      calls.close++;
      this.opened = false;
    },
    async receiveFeatureReport(reportId) {
      assert.equal(this.opened, true);
      assert.equal(reportId, 0);
      calls.receive++;
      return operations.receive();
    },
    async sendFeatureReport() {
      calls.featureSend++;
      assert.fail("Routing must not write settings commands");
    },
    async sendReport(reportId, data) {
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push({ reportId, bytes });
      assert.equal(this.opened, true);
      assert.equal(
        kind,
        "pairing",
        "Never send the pairing start to the settings interface",
      );
      operations.beforeSend();
      const status = new Uint8Array(64);
      status[6] = 3;
      events.dispatchEvent(
        Object.assign(new Event("inputreport"), {
          reportId: 0,
          data: new DataView(status.buffer),
        }),
      );
    },
    addEventListener: (type, listener) =>
      events.addEventListener(type, listener),
    removeEventListener: (type, listener) =>
      events.removeEventListener(type, listener),
  };
  return {
    device,
    calls,
    reports,
    operations,
    assertClosed() {
      assert.equal(
        calls.featureSend,
        0,
        "Routing never sends a feature command, even when it fails",
      );
      assert.equal(device.opened, false);
      assert.equal(getEventListeners(events, "inputreport").length, 0);
    },
  };
}

for (const transportErrorName of ["NotAllowedError", "NetworkError"]) {
  for (const order of ["pairing-first", "settings-first"] as const) {
    test(`one 8K receiver's identical interfaces route by passive evidence (${transportErrorName}, ${order})`, async () => {
      const pairing = channel("pairing", transportErrorName);
      const settings = channel("settings");
      const devices =
        order === "pairing-first"
          ? [pairing.device, settings.device]
          : [settings.device, pairing.device];
      const hid: HidApi = {
        async getDevices() {
          return devices;
        },
        async requestDevice() {
          return devices;
        },
      };
      pairing.operations.beforeSend = () => {
        assert.equal(pairing.calls.receive, 2);
        assert.equal(settings.calls.receive, 2);
      };

      assert.equal(
        await pairReceiver(devices, {
          hid,
          timeoutMs: 100,
          ioTimeoutMs: 50,
        }),
        "paired",
      );
      assert.deepEqual(pairing.reports, [
        { reportId: 0, bytes: buildPairingReport() },
      ]);
      assert.deepEqual(settings.reports, []);
      assert.equal(pairing.calls.receive, 2);
      assert.equal(settings.calls.receive, 2);
      pairing.assertClosed();
      settings.assertClosed();
    });
  }
}

for (const order of ["pairing-first", "settings-first"] as const) {
  for (const reply of ["settings", "initial-zero"] as const) {
    test(`one 1K receiver routes its short pairing interface (${reply}, ${order})`, async () => {
      const pairing = channel("pairing", "NotAllowedError", 0x5402);
      const settings = channel("settings", "NotAllowedError", 0x5402);
      if (reply === "initial-zero")
        settings.operations.receive = async () =>
          new DataView(new Uint8Array(64).buffer);
      const devices =
        order === "pairing-first"
          ? [pairing.device, settings.device]
          : [settings.device, pairing.device];
      pairing.operations.beforeSend = () => {
        assert.equal(pairing.calls.receive, 2);
        assert.equal(settings.calls.receive, 2);
      };
      assert.equal(
        await pairReceiver(devices, { timeoutMs: 100, ioTimeoutMs: 50 }),
        "paired",
      );
      assert.deepEqual(pairing.reports, [
        { reportId: 0, bytes: buildPairingReport() },
      ]);
      assert.deepEqual(settings.reports, []);
      pairing.assertClosed();
      settings.assertClosed();
    });
  }
}

for (const framing of ["report-id-prefixed", "nonzero-offset"] as const) {
  test(`passive routing recognizes a ${framing} settings DataView`, async () => {
    const pairing = channel("pairing");
    const settings = channel("settings");
    settings.operations.receive = async () => {
      if (framing === "report-id-prefixed") {
        const bytes = new Uint8Array(65);
        bytes.set(SETTINGS_REPLY, 1);
        return new DataView(bytes.buffer);
      }
      const bytes = new Uint8Array(72).fill(0xff);
      bytes.set(SETTINGS_REPLY, 4);
      return new DataView(bytes.buffer, 4, 64);
    };
    assert.equal(
      await pairReceiver([settings.device, pairing.device], {
        timeoutMs: 100,
        ioTimeoutMs: 50,
      }),
      "paired",
    );
    assert.deepEqual(pairing.reports, [
      { reportId: 0, bytes: buildPairingReport() },
    ]);
    assert.deepEqual(settings.reports, []);
    pairing.assertClosed();
    settings.assertClosed();
  });
}

for (const framing of ["report-id-prefixed", "nonzero-offset"] as const) {
  test(`1K initial zero settings evidence respects ${framing} framing`, async () => {
    const pairing = channel("pairing", "NotAllowedError", 0x5402);
    const settings = channel("settings", "NotAllowedError", 0x5402);
    if (framing === "nonzero-offset") {
      pairing.operations.receive = async () => {
        const bytes = Uint8Array.of(0xff, 0, 0xff);
        return new DataView(bytes.buffer, 1, 1);
      };
    }
    settings.operations.receive = async () => {
      if (framing === "report-id-prefixed")
        return new DataView(new Uint8Array(65).buffer);
      const bytes = new Uint8Array(72).fill(0xff);
      bytes.fill(0, 4, 68);
      return new DataView(bytes.buffer, 4, 64);
    };
    assert.equal(
      await pairReceiver([settings.device, pairing.device], {
        timeoutMs: 100,
        ioTimeoutMs: 50,
      }),
      "paired",
    );
    assert.deepEqual(pairing.reports, [
      { reportId: 0, bytes: buildPairingReport() },
    ]);
    assert.deepEqual(settings.reports, []);
    pairing.assertClosed();
    settings.assertClosed();
  });
}

const refusals: {
  name: string;
  productIds?: number[];
  configure: (
    pairing: ReturnType<typeof channel>,
    settings: ReturnType<typeof channel>,
  ) => void;
}[] = [
  {
    name: "a generic receive failure",
    configure(pairing) {
      pairing.operations.receive = async () => {
        throw new Error("Unexpected failure");
      };
    },
  },
  {
    name: "a denied feature read",
    configure(pairing) {
      pairing.operations.receive = async () => {
        throw new DOMException("Denied", "NotAllowedError");
      };
    },
  },
  {
    name: "a generic network failure",
    configure(pairing) {
      pairing.operations.receive = async () => {
        throw new DOMException("Device disconnected", "NetworkError");
      };
    },
  },
  {
    name: "a failed open",
    configure(pairing) {
      pairing.operations.open = async () => {
        throw new DOMException("Cannot open", "NetworkError");
      };
    },
  },
  {
    name: "a feature read that never completes",
    configure(pairing) {
      pairing.operations.receive = () => new Promise(() => {});
    },
  },
  {
    name: "a settings reply with an invalid checksum",
    configure(_pairing, settings) {
      settings.operations.receive = async () => {
        const malformed = SETTINGS_REPLY.slice();
        malformed[62] ^= 1;
        return new DataView(malformed.buffer);
      };
    },
  },
  {
    name: "a settings reply with the wrong length",
    configure(_pairing, settings) {
      settings.operations.receive = async () =>
        new DataView(new Uint8Array(63).buffer);
    },
  },
  {
    name: "an all-zero settings reply despite its valid checksum",
    productIds: [0x5403],
    configure(_pairing, settings) {
      settings.operations.receive = async () =>
        new DataView(new Uint8Array(64).buffer);
    },
  },
  {
    name: "an unknown settings status despite its valid checksum",
    configure(_pairing, settings) {
      settings.operations.receive = async () => {
        const bytes = SETTINGS_REPLY.slice();
        bytes[0] = 3;
        bytes[62] = 3;
        return new DataView(bytes.buffer);
      };
    },
  },
  {
    name: "a nonzero settings body with a zero status",
    configure(_pairing, settings) {
      settings.operations.receive = async () => {
        const bytes = new Uint8Array(64);
        bytes[6] = 1;
        bytes[62] = 1;
        return new DataView(bytes.buffer);
      };
    },
  },
  {
    name: "a feature failure that changes between reads",
    configure(pairing) {
      pairing.operations.receive = async () => {
        if (pairing.calls.receive === 1)
          throw new DOMException(
            "Failed to receive the feature report.",
            "NetworkError",
          );
        return new DataView(SETTINGS_REPLY.slice().buffer);
      };
    },
  },
  {
    name: "a transport failure followed by a permission denial",
    configure(pairing) {
      pairing.operations.receive = async () => {
        if (pairing.calls.receive === 1)
          throw new DOMException(
            "Failed to receive the feature report.",
            "NotAllowedError",
          );
        throw new DOMException("Permission denied", "NotAllowedError");
      };
    },
  },
  {
    name: "a settings reply that fails on its second read",
    configure(_pairing, settings) {
      settings.operations.receive = async () => {
        if (settings.calls.receive === 2)
          throw new DOMException(
            "Failed to receive the feature report.",
            "NetworkError",
          );
        return new DataView(SETTINGS_REPLY.slice().buffer);
      };
    },
  },
];

for (const { name, configure, productIds = [0x5402, 0x5403] } of refusals) {
  for (const productId of productIds) {
    test(`${productId.toString(16)} passive routing refuses ${name} without any pairing output`, async () => {
      const pairing = channel("pairing", "NotAllowedError", productId);
      const settings = channel("settings", "NotAllowedError", productId);
      configure(pairing, settings);
      await assert.rejects(
        pairReceiver([pairing.device, settings.device], {
          timeoutMs: 100,
          ioTimeoutMs: 10,
        }),
      );
      assert.deepEqual([...pairing.reports, ...settings.reports], []);
      pairing.assertClosed();
      settings.assertClosed();
    });
  }
}

for (const bytes of [[], [1], [0, 0], Array<number>(63).fill(0)]) {
  test(`1K routing refuses a ${bytes.length}-byte pairing read starting with ${bytes[0] ?? "nothing"}`, async () => {
    const pairing = channel("pairing", "NotAllowedError", 0x5402);
    const settings = channel("settings", "NotAllowedError", 0x5402);
    pairing.operations.receive = async () =>
      new DataView(Uint8Array.from(bytes).buffer);
    await assert.rejects(
      pairReceiver([pairing.device, settings.device], {
        timeoutMs: 100,
        ioTimeoutMs: 10,
      }),
    );
    assert.deepEqual([...pairing.reports, ...settings.reports], []);
    pairing.assertClosed();
    settings.assertClosed();
  });
}

for (const productId of [0x5402, 0x5403]) {
  test(`${productId.toString(16)} cannot use the other receiver's passive pairing evidence`, async () => {
    const pairing = channel("pairing", "NotAllowedError", productId);
    const settings = channel("settings", "NotAllowedError", productId);
    pairing.operations.receive = async () => {
      if (productId === 0x5403)
        return new DataView(Uint8Array.of(0).buffer);
      throw new DOMException(
        "Failed to receive the feature report.",
        "NotAllowedError",
      );
    };
    await assert.rejects(
      pairReceiver([pairing.device, settings.device], {
        timeoutMs: 100,
        ioTimeoutMs: 10,
      }),
    );
    assert.deepEqual([...pairing.reports, ...settings.reports], []);
    pairing.assertClosed();
    settings.assertClosed();
  });
}

for (const secondReply of [Uint8Array.of(1), SETTINGS_REPLY]) {
  test(`1K routing refuses a short pairing reply that changes on its second read (${secondReply.length} bytes)`, async () => {
    const pairing = channel("pairing", "NotAllowedError", 0x5402);
    const settings = channel("settings", "NotAllowedError", 0x5402);
    pairing.operations.receive = async () =>
      new DataView(
        (pairing.calls.receive === 1 ? Uint8Array.of(0) : secondReply.slice())
          .buffer,
      );
    await assert.rejects(
      pairReceiver([pairing.device, settings.device], {
        timeoutMs: 100,
        ioTimeoutMs: 10,
      }),
    );
    assert.deepEqual([...pairing.reports, ...settings.reports], []);
    pairing.assertClosed();
    settings.assertClosed();
  });
}

for (const productIds of [
  [0x5402, 0x5403],
  [0x5403, 0x5402],
  [0x5402, 0x5402, 0x5403, 0x5403],
]) {
  test(`mixed receiver products ${productIds.map((id) => id.toString(16)).join("/")} are refused before opening`, async () => {
    const channels = productIds.map((productId, index) =>
      channel(index % 2 ? "settings" : "pairing", "NotAllowedError", productId),
    );
    await assert.rejects(
      pairReceiver(channels.map(({ device }) => device), {
        timeoutMs: 100,
        ioTimeoutMs: 10,
      }),
    );
    for (const candidate of channels) {
      assert.equal(candidate.calls.open, 0);
      assert.deepEqual(candidate.reports, []);
      candidate.assertClosed();
    }
  });
}

for (const productId of [0x5402, 0x5403]) {
  for (const kinds of [
    ["settings", "settings"],
    ["pairing", "pairing"],
    ["settings", "pairing", "pairing"],
  ] as const) {
    test(`${productId.toString(16)} passive routing refuses ambiguous roles ${kinds.join("/")} without any pairing output`, async () => {
      const channels = kinds.map((kind) => channel(kind, "NotAllowedError", productId));
      await assert.rejects(
        pairReceiver(
          channels.map(({ device }) => device),
          {
            timeoutMs: 100,
            ioTimeoutMs: 10,
          },
        ),
      );
      for (const candidate of channels) {
        assert.deepEqual(candidate.reports, []);
        candidate.assertClosed();
      }
    });
  }

  for (const kind of ["pairing", "settings"] as const) {
    test(`${productId.toString(16)} one granted ${kind} interface with the shared descriptor cannot establish a safe route`, async () => {
      const only = channel(kind, "NotAllowedError", productId);
      await assert.rejects(
        pairReceiver([only.device], {
          timeoutMs: 100,
          ioTimeoutMs: 10,
        }),
      );
      assert.deepEqual(only.reports, []);
      only.assertClosed();
    });
  }

  for (const missing of ["one", "both"] as const) {
    test(`${productId.toString(16)} two-interface routing refuses ${missing} missing feature-report descriptors before opening`, async () => {
      const pairing = channel("pairing", "NotAllowedError", productId);
      const settings = channel("settings", "NotAllowedError", productId);
      pairing.device.collections[0].featureReports = [];
      if (missing === "both") settings.device.collections[0].featureReports = [];
      await assert.rejects(
        pairReceiver([pairing.device, settings.device], {
          timeoutMs: 100,
          ioTimeoutMs: 10,
        }),
      );
      assert.equal(pairing.calls.open + settings.calls.open, 0);
      assert.deepEqual([...pairing.reports, ...settings.reports], []);
      pairing.assertClosed();
      settings.assertClosed();
    });
  }

  test(`${productId.toString(16)} cancellation while resolving identical interfaces prevents pairing output and cleans up`, async () => {
    const pairing = channel("pairing", "NotAllowedError", productId);
    const settings = channel("settings", "NotAllowedError", productId);
    const controller = new AbortController();
    settings.operations.receive = async () => {
      controller.abort();
      return new DataView(SETTINGS_REPLY.slice().buffer);
    };
    await assert.rejects(
      pairReceiver([pairing.device, settings.device], {
        signal: controller.signal,
        timeoutMs: 100,
        ioTimeoutMs: 50,
      }),
      /停止/,
    );
    assert.deepEqual([...pairing.reports, ...settings.reports], []);
    assert.equal(getEventListeners(controller.signal, "abort").length, 0);
    pairing.assertClosed();
    settings.assertClosed();
  });

  test(`${productId.toString(16)} routing open that completes after timeout is closed without sending`, async () => {
    const pairing = channel("pairing", "NotAllowedError", productId);
    const settings = channel("settings", "NotAllowedError", productId);
    let finishOpen!: () => void;
    pairing.operations.open = () =>
      new Promise<void>((resolve) => {
        finishOpen = resolve;
      });
    await assert.rejects(
      pairReceiver([pairing.device, settings.device], {
        timeoutMs: 100,
        ioTimeoutMs: 10,
      }),
    );
    assert.deepEqual([...pairing.reports, ...settings.reports], []);
    assert.equal(
      typeof finishOpen,
      "function",
      "The resolver attempts the passive candidate open",
    );
    finishOpen();
    await setImmediate();
    pairing.assertClosed();
    settings.assertClosed();
  });
}
