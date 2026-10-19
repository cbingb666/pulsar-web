import test from "node:test";
import assert from "node:assert/strict";
import { getEventListeners } from "node:events";
import { existsSync, readFileSync } from "node:fs";
import { setImmediate } from "node:timers/promises";
import type { HidApi, HidCollection, HidDevice } from "../src/hid";
import { transferFirmwareBytes } from "../src/firmware-transport";
import { importFirmware, type FirmwareImage } from "../src/firmware-package";
import {
  buildFirmwareBlocks,
  buildFirmwareCommand,
  enterFirmwareBootloader,
  flashFirmware,
  requestFirmwareDevices,
  selectFirmwareInterface,
  validateFirmwareReply,
  type FirmwareLog,
} from "../src/firmware";

// Fixed packets and padding behavior derived from the official updater's
// 0x140004770 and 0x140004c30 native routines, not hardware acceptance.
const command = (value: number) =>
  Uint8Array.from([
    0x44,
    0x43,
    0x44,
    0x55,
    0,
    value,
    ...Array<number>(58).fill(0),
  ]);
const ack = (value: number, sum = 0) => {
  const bytes = command(value);
  bytes[6] = 1;
  bytes[7] = sum & 255;
  bytes[8] = sum >>> 8;
  return bytes;
};
function collection(): HidCollection {
  return {
    usagePage: 0xffff,
    usage: 1,
    featureReports: [
      { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] },
    ],
    inputReports: [
      { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] },
    ],
    outputReports: [
      { reportId: 0, items: [{ reportSize: 8, reportCount: 64 }] },
    ],
  };
}
function fake(mode: "normal" | "bootloader" = "bootloader") {
  const events = new EventTarget();
  const hidEvents = new EventTarget();
  const calls = { open: 0, close: 0, request: 0 };
  const reports: Uint8Array[] = [];
  const behavior = {
    open: async () => {},
    send: async (_bytes: Uint8Array) => {},
    close: async () => {},
  };
  const device: HidDevice = {
    vendorId: mode === "normal" ? 0x3710 : 0x484d,
    productId: mode === "normal" ? 0x3401 : 3,
    productName: "fixture",
    opened: false,
    collections: [collection()],
    async open() {
      calls.open++;
      await behavior.open();
      this.opened = true;
    },
    async close() {
      calls.close++;
      await behavior.close();
      this.opened = false;
    },
    async sendReport(id, data) {
      assert.equal(this.opened, true);
      assert.equal(id, 0);
      const bytes = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
      reports.push(bytes);
      await behavior.send(bytes);
    },
    async sendFeatureReport() {
      assert.fail("Flashing must use output reports");
    },
    async receiveFeatureReport() {
      return assert.fail("Flashing must not guess using feature probes");
    },
    addEventListener: (name, listener) =>
      events.addEventListener(name, listener),
    removeEventListener: (name, listener) =>
      events.removeEventListener(name, listener),
  };
  const filters: Parameters<HidApi["requestDevice"]>[0][] = [];
  const hid: HidApi = {
    getDevices: async () => [device],
    requestDevice: async (options) => {
      calls.request++;
      filters.push(options);
      return [device];
    },
    addEventListener: (name, listener) =>
      hidEvents.addEventListener(name, listener),
    removeEventListener: (name, listener) =>
      hidEvents.removeEventListener(name, listener),
  };
  return {
    device,
    calls,
    reports,
    behavior,
    hid,
    filters,
    input(bytes: Uint8Array, reportId = 0) {
      // A nonzero DataView offset checks that parsing does not read the buffer prefix.
      const data = new Uint8Array(bytes.length + 3);
      data.set(bytes, 3);
      events.dispatchEvent(
        Object.assign(new Event("inputreport"), {
          reportId,
          data: new DataView(data.buffer, 3, bytes.length),
        }),
      );
    },
    disconnect() {
      hidEvents.dispatchEvent(
        Object.assign(new Event("disconnect"), { device }),
      );
    },
    clean(signal?: AbortSignal, expectClose = true) {
      assert.equal(getEventListeners(events, "inputreport").length, 0);
      assert.equal(getEventListeners(hidEvents, "disconnect").length, 0);
      if (signal) assert.equal(getEventListeners(signal, "abort").length, 0);
      if (expectClose) assert.ok(calls.close > 0);
    },
  };
}

test("DCDU packet fixtures use 64-byte report-zero payloads and little endian length", () => {
  for (const value of [1, 3, 4, 255] as const)
    assert.deepEqual(buildFirmwareCommand(value), command(value));
  const length = command(2);
  length.set([0xd4, 0xd4, 1, 0], 6);
  assert.deepEqual(buildFirmwareCommand(2, 120020), length);
  for (const value of [0, -1, 1.2, NaN, 0x100000000])
    assert.throws(() => buildFirmwareCommand(2, value));
  assert.throws(() => buildFirmwareCommand(3, 123));
});

test("native final memcpy retains the preceding block tail, checksum includes all 64 bytes", () => {
  const bytes = Uint8Array.from({ length: 70 }, (_, index) => index);
  const result = buildFirmwareBlocks(bytes);
  assert.equal(result.blocks.length, 2);
  assert.deepEqual(
    result.blocks[0],
    Uint8Array.from({ length: 64 }, (_, index) => index),
  );
  assert.deepEqual(
    result.blocks[1],
    Uint8Array.from([
      64,
      65,
      66,
      67,
      68,
      69,
      ...Array.from({ length: 58 }, (_, index) => index + 6),
    ]),
  );
  assert.equal(result.checksum, 4416);
  result.blocks[1][10] = 255;
  assert.equal(result.blocks[0][10], 10);
  assert.equal(
    buildFirmwareBlocks(new Uint8Array(1024).fill(255)).checksum,
    0xfc00,
  );
  assert.throws(() => buildFirmwareBlocks(new Uint8Array()));
});

test("ACK validation requires header, matching command, status and final checksum", () => {
  validateFirmwareReply(ack(1), 1);
  validateFirmwareReply(ack(2), 2);
  validateFirmwareReply(ack(3, 0xcf00), 3, 0xcf00);
  assert.throws(() => validateFirmwareReply(ack(2), 1), /不匹配/);
  assert.throws(() => validateFirmwareReply(ack(1).slice(0, 7), 1), /不匹配/);
  const rejected = ack(1);
  rejected[6] = 0;
  assert.throws(() => validateFirmwareReply(rejected, 1), /拒绝/);
  assert.throws(
    () => validateFirmwareReply(ack(3, 0xc902), 3, 0xcf00),
    /校验和/,
  );
});

test("normal interface selection excludes the exact previously handshaken settings object", () => {
  const settings = fake("normal");
  const updater = fake("normal");
  for (const devices of [
    [settings.device, updater.device],
    [updater.device, settings.device],
  ])
    assert.equal(
      selectFirmwareInterface(devices, "normal", settings.device),
      updater.device,
    );
  assert.throws(
    () => selectFirmwareInterface([updater.device], "normal", settings.device),
    /无法确认/,
  );
  assert.throws(
    () => selectFirmwareInterface([updater.device, settings.device], "normal"),
    /无法确认/,
  );
  assert.throws(() =>
    selectFirmwareInterface(
      [updater.device, settings.device, fake("normal").device],
      "normal",
      settings.device,
    ),
  );
  assert.throws(() =>
    selectFirmwareInterface(
      [updater.device, settings.device],
      "normal",
      fake("normal").device,
    ),
  );
});

test("bootloader only accepts one exact 484d:0003 vendor input/output interface", () => {
  const target = fake();
  assert.equal(
    selectFirmwareInterface([target.device, target.device], "bootloader"),
    target.device,
  );
  assert.throws(() =>
    selectFirmwareInterface([target.device, fake().device], "bootloader"),
  );
  target.device.productId = 1;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  target.device.productId = 3;
  target.device.collections[0].outputReports![0].items![0].reportCount = 63;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
});

test("bootloader vendor usage need not match the normal firmware descriptor", () => {
  const target = fake();
  target.device.collections[0].usagePage = 0xff03;
  target.device.collections[0].usage = 7;
  assert.equal(
    selectFirmwareInterface([target.device], "bootloader"),
    target.device,
  );
  target.device.collections[0].usagePage = 1;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  const settings = fake("normal");
  const updater = fake("normal");
  updater.device.collections[0].usagePage = 0xff03;
  assert.throws(() =>
    selectFirmwareInterface(
      [settings.device, updater.device],
      "normal",
      settings.device,
    ),
  );
});

test("captured 484d:0003 bootloader accepts usage 1:0 with exact 64-byte report-zero I/O", () => {
  // Read-only live descriptor: .local/firmware-bootloader-ioreg.plist.
  // 05010900a10109011581257f75089540818209011581257f750895409182050c09001580257f95407508b102c0
  const target = fake();
  target.device.collections[0].usagePage = 1;
  target.device.collections[0].usage = 0;
  assert.equal(
    selectFirmwareInterface([target.device], "bootloader"),
    target.device,
  );
  for (const usage of [2, 6]) {
    target.device.collections[0].usage = usage;
    assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  }
  target.device.collections[0].usage = 0;
  target.device.productId = 1;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  target.device.productId = 3;
  target.device.collections[0].inputReports![0].items![0].reportCount = 63;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  target.device.collections[0].inputReports![0].items![0].reportCount = 64;
  target.device.collections[0].outputReports![0].reportId = 1;
  assert.throws(() => selectFirmwareInterface([target.device], "bootloader"));
  target.device.collections[0].outputReports![0].reportId = 0;
  const duplicate = fake();
  duplicate.device.collections[0].usagePage = 1;
  duplicate.device.collections[0].usage = 0;
  assert.throws(() => selectFirmwareInterface([target.device, duplicate.device], "bootloader"));
  assert.equal(target.calls.open, 0);
  assert.equal(target.reports.length, 0);
});

test("permissions request only the normal wired target or its exact bootloader PID", async () => {
  const target = fake();
  await requestFirmwareDevices("normal", target.hid);
  await requestFirmwareDevices("bootloader", target.hid);
  assert.deepEqual(target.filters, [
    { filters: [{ vendorId: 0x3710, productId: 0x3401 }] },
    { filters: [{ vendorId: 0x484d, productId: 3 }] },
  ]);
  assert.equal(target.calls.open, 0);
});

test("boot entry sends once on the sibling and cleans up on expected disconnect", async () => {
  const settings = fake("normal");
  const updater = fake("normal");
  updater.behavior.send = async () => updater.disconnect();
  await enterFirmwareBootloader([settings.device, updater.device], {
    settingsDevice: settings.device,
    hid: updater.hid,
  });
  assert.deepEqual(updater.reports, [command(255)]);
  assert.equal(settings.calls.open, 0);
  updater.clean();
});

test("unmount abort before entry, including observer abort, cannot send bootloader command", async () => {
  for (const phase of ["before", "progress", "log"]) {
    const settings = fake("normal");
    const updater = fake("normal");
    const controller = new AbortController();
    if (phase === "before") controller.abort();
    await assert.rejects(
      enterFirmwareBootloader([settings.device, updater.device], {
        settingsDevice: settings.device,
        hid: updater.hid,
        signal: controller.signal,
        onProgress: (progress) => {
          if (phase === "progress" && progress.phase === "entering")
            controller.abort();
        },
        onLog: () => {
          if (phase === "log") controller.abort();
        },
      }),
      /停止/,
    );
    assert.equal(updater.reports.length, 0);
    updater.clean(controller.signal);
  }
});

test("a hung opening times out, closes late completion, and never sends", async () => {
  const settings = fake("normal");
  const updater = fake("normal");
  let resolve!: () => void;
  updater.behavior.open = () =>
    new Promise<void>((done) => {
      resolve = done;
    });
  await assert.rejects(
    enterFirmwareBootloader([settings.device, updater.device], {
      settingsDevice: settings.device,
      hid: updater.hid,
      ioTimeoutMs: 10,
    }),
    /超时/,
  );
  assert.equal(updater.reports.length, 0);
  updater.clean(undefined, false);
  resolve();
  await setImmediate();
  assert.equal(updater.device.opened, false);
  assert.equal(updater.calls.close, 1);
});

test("unvalidated firmware metadata fails before opening or erasing", async () => {
  const target = fake();
  await assert.rejects(
    flashFirmware([target.device], {} as FirmwareImage),
    /校验/,
  );
  assert.equal(target.calls.open, 0);
  assert.equal(target.reports.length, 0);
});

// Vendor payload is intentionally untracked. These additional full-transfer
// tests run when the official updater was downloaded for static research.
const fixture = new URL(
  "../.local/firmware-research/xs1/Pulsar_Updater_v1017_v125_T01.exe",
  import.meta.url,
);
const fixtureOptions = { skip: !existsSync(fixture) };
async function image() {
  const buffer = readFileSync(fixture);
  return importFirmware(Uint8Array.from(buffer).buffer, "official-updater.exe");
}
const SYNTHETIC_IMAGE = Uint8Array.from({ length: 145 }, (_, index) => index);
function respond(
  target: ReturnType<typeof fake>,
  checksum = 0x3be0,
  blockCount = 3,
) {
  target.behavior.send = async (bytes) => {
    if (target.reports.length === 1) target.input(ack(1));
    else if (target.reports.length === 2) target.input(ack(2));
    else if (target.reports.length === blockCount + 3)
      target.input(ack(3, checksum));
    else if (target.reports.length === blockCount + 4) target.disconnect();
  };
}

test(
  "official image streams 1876 native blocks without data ACKs and verifies 0xcf00 before reboot",
  fixtureOptions,
  async () => {
    const target = fake();
    const logs: FirmwareLog[] = [];
    respond(target, 0xcf00, 1876);
    await flashFirmware([target.device], await image(), {
      hid: target.hid,
      onLog: (log) => logs.push(log),
    });
    assert.equal(target.reports.length, 1880);
    assert.deepEqual(target.reports[0], command(1));
    assert.deepEqual(target.reports[1], buildFirmwareCommand(2, 120020));
    assert.deepEqual(target.reports[1878], command(3));
    assert.deepEqual(target.reports[1879], command(4));
    assert.equal(
      target.reports
        .slice(2, 1878)
        .flatMap((bytes) => Array.from(bytes))
        .reduce((sum, value) => (sum + value) & 0xffff, 0),
      0xcf00,
    );
    assert.equal(
      logs.length,
      7,
      "Only commands and acknowledgements are logged, not firmware data",
    );
    target.clean();
  },
);

test("a checksum mismatch stops before reboot, without resending any firmware data", async () => {
  const target = fake();
  respond(target, 0xc902);
  await assert.rejects(
    transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, { hid: target.hid }),
    /校验和/,
  );
  assert.equal(target.reports.length, 6);
  target.clean();
});

test("erase rejection and stale ACK stop before any payload", async () => {
  for (const reply of [ack(2), command(1)]) {
    const target = fake();
    target.behavior.send = async () => {
      target.input(reply);
    };
    await assert.rejects(
      transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
        hid: target.hid,
      }),
      /不匹配|拒绝/,
    );
    assert.equal(target.reports.length, 1);
    target.clean();
  }
});

test("disconnect or unmount during payload stops every subsequent transmission", async () => {
  for (const action of ["disconnect", "abort"]) {
    const target = fake();
    const controller = new AbortController();
    respond(target);
    const send = target.behavior.send;
    target.behavior.send = async (bytes) => {
      await send(bytes);
      if (target.reports.length === 5) {
        if (action === "disconnect") target.disconnect();
        else controller.abort();
      }
    };
    await assert.rejects(
      transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
        hid: target.hid,
        signal: controller.signal,
      }),
      /断开|停止/,
    );
    assert.equal(target.reports.length, 5);
    target.clean(controller.signal);
  }
});

test("early ACK cannot hide send failure or cause a retry", async () => {
  const target = fake();
  target.behavior.send = async () => {
    target.input(ack(1));
    throw new Error("send rejected");
  };
  await assert.rejects(
    transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, { hid: target.hid }),
    /send rejected/,
  );
  assert.equal(target.reports.length, 1);
  target.clean();
});

test("synthetic full transfer is sequential, validates byte total/checksum, and reaches reboot", async () => {
  const target = fake();
  respond(target);
  const phases: string[] = [];
  await transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
    onProgress: (progress) => phases.push(progress.phase),
  });
  assert.equal(target.reports.length, 7);
  assert.deepEqual(target.reports[0], command(1));
  const expectedLength = command(2);
  expectedLength[6] = 145;
  assert.deepEqual(target.reports[1], expectedLength);
  assert.deepEqual(target.reports[5], command(3));
  assert.deepEqual(target.reports[6], command(4));
  assert.deepEqual(phases, [
    "opening",
    "erasing",
    "preparing",
    "writing",
    "writing",
    "writing",
    "verifying",
    "rebooting",
  ]);
  target.clean();
});

test("erase accepts a 6000 ms acknowledgement without resending", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const target = fake();
  respond(target);
  const send = target.behavior.send;
  target.behavior.send = async (bytes) => {
    if (target.reports.length === 1)
      setTimeout(() => target.input(ack(1)), 6000);
    else await send(bytes);
  };
  const transfer = transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
  });
  void transfer.catch(() => undefined);
  await setImmediate();
  assert.equal(target.reports.length, 1);
  context.mock.timers.tick(5999);
  await setImmediate();
  assert.equal(target.reports.length, 1);
  context.mock.timers.tick(1);
  await setImmediate();
  assert.equal(target.reports.length, 2);
  context.mock.timers.tick(10);
  await setImmediate();
  context.mock.timers.tick(10);
  await transfer;
  assert.equal(target.reports.length, 7);
  assert.deepEqual(target.reports[0], command(1));
  assert.deepEqual(target.reports[1], buildFirmwareCommand(2, 145));
  target.clean();
});

test("erase still times out at 10000 ms without sending length or payload", async (context) => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const target = fake();
  let settled = false;
  const transfer = transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
  }).finally(() => { settled = true; });
  const rejected = assert.rejects(transfer, /应答超时/);
  await setImmediate();
  assert.equal(target.reports.length, 1);
  context.mock.timers.tick(9999);
  await setImmediate();
  assert.equal(settled, false);
  assert.equal(target.reports.length, 1);
  context.mock.timers.tick(1);
  await rejected;
  target.clean();
  target.input(ack(1));
  await setImmediate();
  assert.deepEqual(target.reports, [command(1)]);
});

test("a hung payload send blocks handle reuse until its real completion", async () => {
  const target = fake();
  respond(target);
  const send = target.behavior.send;
  let resolve!: () => void;
  target.behavior.send = async (bytes) => {
    if (target.reports.length === 3)
      await new Promise<void>((done) => {
        resolve = done;
      });
    else await send(bytes);
  };
  await assert.rejects(
    transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
      hid: target.hid,
      ioTimeoutMs: 10,
    }),
    /超时/,
  );
  assert.equal(target.reports.length, 3);
  target.clean();
  assert.equal(target.device.opened, false);
  await assert.rejects(
    transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, { hid: target.hid }),
    /上一次.*未结束/,
  );
  assert.equal(target.reports.length, 3);
  assert.equal(target.calls.open, 1);
  assert.equal(target.calls.close, 1);
  resolve();
  await setImmediate();
  assert.equal(target.reports.length, 3);
  target.reports.length = 0;
  respond(target);
  await transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
  });
  assert.equal(target.reports.length, 7);
  assert.equal(target.calls.open, 2);
  target.clean();
});

test("wrong report framing cannot acknowledge erase, a valid subsequent input can", async () => {
  const target = fake();
  respond(target);
  const send = target.behavior.send;
  target.behavior.send = async (bytes) => {
    if (target.reports.length === 1) {
      target.input(ack(1), 1);
      target.input(ack(1).slice(0, 8));
    }
    await send(bytes);
  };
  await transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
  });
  assert.equal(target.reports.length, 7);
  target.clean();
});

test(
  "missing checksum acknowledgement times out without reboot or payload retries",
  { timeout: 3000 },
  async () => {
    const target = fake();
    target.behavior.send = async () => {
      if (target.reports.length === 1) target.input(ack(1));
      if (target.reports.length === 2) target.input(ack(2));
    };
    await assert.rejects(
      transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
        hid: target.hid,
      }),
      /应答超时/,
    );
    assert.equal(target.reports.length, 6);
    target.clean();
    target.input(ack(3, 0x3be0));
    await setImmediate();
    assert.equal(target.reports.length, 6);
  },
);

test("a timed-out close reserves the handle: manual retry cannot erase until cleanup settles", async () => {
  const target = fake();
  respond(target);
  let releaseClose!: () => void;
  target.behavior.close = () =>
    new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
  await transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
    ioTimeoutMs: 10,
  });
  assert.equal(target.reports.length, 7);
  assert.equal(target.calls.close, 1);
  await assert.rejects(
    transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
      hid: target.hid,
      ioTimeoutMs: 10,
    }),
    /上一次.*未结束/,
  );
  assert.equal(target.reports.length, 7);
  assert.equal(target.calls.open, 1);
  assert.equal(target.calls.close, 1);
  releaseClose();
  await setImmediate();
  target.behavior.close = async () => {};
  target.reports.length = 0;
  await transferFirmwareBytes(target.device, SYNTHETIC_IMAGE, {
    hid: target.hid,
  });
  assert.equal(target.reports.length, 7);
  assert.equal(target.calls.open, 2);
  target.clean();
});

test("a timed-out open and its late close reserve the handle across manual retries", async () => {
  const settings = fake("normal");
  const updater = fake("normal");
  const devices = [settings.device, updater.device];
  const options = {
    settingsDevice: settings.device,
    hid: updater.hid,
    ioTimeoutMs: 10,
  };
  let releaseOpen!: () => void;
  let releaseClose!: () => void;
  updater.behavior.open = () =>
    new Promise<void>((resolve) => {
      releaseOpen = resolve;
    });
  updater.behavior.close = () =>
    new Promise<void>((resolve) => {
      releaseClose = resolve;
    });
  await assert.rejects(enterFirmwareBootloader(devices, options), /超时/);
  await assert.rejects(
    enterFirmwareBootloader(devices, options),
    /上一次.*未结束/,
  );
  assert.equal(updater.calls.open, 1);
  assert.equal(updater.calls.close, 0);
  assert.equal(updater.reports.length, 0);
  releaseOpen();
  await setImmediate();
  assert.equal(updater.calls.close, 1);
  await assert.rejects(
    enterFirmwareBootloader(devices, options),
    /上一次.*未结束/,
  );
  assert.equal(updater.calls.open, 1);
  assert.equal(updater.calls.close, 1);
  releaseClose();
  await setImmediate();
  updater.behavior.open = async () => {};
  updater.behavior.close = async () => {};
  await enterFirmwareBootloader(devices, options);
  assert.equal(updater.calls.open, 2);
  assert.equal(updater.calls.close, 2);
  assert.deepEqual(updater.reports, [command(255)]);
  updater.clean();
});
