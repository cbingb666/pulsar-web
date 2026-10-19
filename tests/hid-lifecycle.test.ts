import test from "node:test";
import assert from "node:assert/strict";
import { setImmediate } from "node:timers/promises";
import { PulsarHidClient, type HidDevice } from "../src/hid";
import { checksum, readCommand } from "../src/protocol";
import { withMockClock } from "./helpers/mock-clock";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mouse() {
  const calls = { open: 0, close: 0, send: 0, receive: 0 };
  const operations: {
    open?: () => Promise<void>;
    close?: () => Promise<void>;
    receive?: () => Promise<DataView>;
  } = {};
  let request = new Uint8Array(64);
  let pollingCode = 8;
  const device: HidDevice = {
    vendorId: 0x3710,
    productId: 0x3401,
    productName: "Xlite v4 Mini",
    opened: false,
    collections: [
      { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
    ],
    async open() {
      calls.open++;
      await operations.open?.();
      this.opened = true;
    },
    async close() {
      calls.close++;
      await operations.close?.();
      this.opened = false;
    },
    async sendFeatureReport(_reportId, data) {
      calls.send++;
      assert.equal(this.opened, true);
      request = ArrayBuffer.isView(data)
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice()
        : new Uint8Array(data).slice();
    },
    async receiveFeatureReport() {
      calls.receive++;
      if (operations.receive) return operations.receive();
      const reply = request.slice();
      reply[0] = 1;
      reply[7] = pollingCode;
      const sum = checksum(reply);
      reply[62] = sum & 255;
      reply[63] = sum >> 8;
      return new DataView(reply.buffer);
    },
  };
  return {
    device,
    calls,
    operations,
    polling: (code: number) => {
      pollingCode = code;
    },
  };
}

test(
  "a hung open times out without any command and a late open is closed",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const fake = mouse();
      const opening = deferred();
      fake.operations.open = () => opening.promise;
      const client = new PulsarHidClient({ timeoutMs: 10 });
      await assert.rejects(
        client.connectDevices([fake.device]),
        /打开 HID 通道超时/,
      );
      assert.equal(client.connected, false);
      assert.equal(client.device, null);
      assert.equal(fake.calls.send, 0);
      assert.equal(fake.calls.receive, 0);
      assert.throws(
        () => client.assertDevicesReleased([fake.device]),
        /尚未完全释放/,
      );

      // Retrying cannot start a second open on the unresolved browser handle.
      await assert.rejects(
        client.connectDevices([fake.device]),
        /上一项操作尚未结束/,
      );
      assert.equal(fake.calls.open, 1);
      opening.resolve();
      await setImmediate();
      assert.equal(fake.device.opened, false);
      assert.equal(fake.calls.close, 1);
      assert.equal(fake.calls.send, 0);
      assert.doesNotThrow(() => client.assertDevicesReleased([fake.device]));
      await client.dispose();
    });
  },
);

test(
  "dispose during an open prevents the later handle from starting a handshake",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const fake = mouse();
      const opening = deferred();
      fake.operations.open = () => opening.promise;
      const client = new PulsarHidClient({ timeoutMs: 100 });
      const connecting = client.connectDevices([fake.device]);
      const rejected = assert.rejects(connecting, /连接已取消/);
      await setImmediate();
      assert.equal(fake.calls.open, 1);
      await client.dispose();
      opening.resolve();
      await rejected;
      await setImmediate();
      assert.equal(fake.calls.send, 0);
      assert.equal(fake.calls.receive, 0);
      assert.equal(fake.device.opened, false);
      assert.ok(fake.calls.close >= 1);
      assert.equal(client.device, null);
    });
  },
);

test(
  "explicit disconnect during open invalidates that connection attempt",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const fake = mouse();
      const opening = deferred();
      fake.operations.open = () => opening.promise;
      const client = new PulsarHidClient({ timeoutMs: 100 });
      const rejected = assert.rejects(
        client.connectDevices([fake.device]),
        /连接已取消/,
      );
      await setImmediate();
      await client.disconnect();
      opening.resolve();
      await rejected;
      await setImmediate();
      assert.equal(fake.calls.send, 0);
      assert.equal(fake.device.opened, false);
      assert.equal(client.connected, false);
      await client.dispose();
    });
  },
);

test(
  "hung disconnect is bounded, invalidates settings, and blocks reuse of the closing handle",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const fake = mouse();
      const closing = deferred();
      const client = new PulsarHidClient({ timeoutMs: 10 });
      await client.connectDevices([fake.device]);
      fake.operations.close = () => closing.promise;
      await assert.rejects(client.disconnect(), /关闭 HID 通道超时/);
      assert.equal(client.device, null);
      assert.equal(client.connected, false);
      await assert.rejects(client.transact(readCommand(1, 9, 2)), /请先连接鼠标/);
      await assert.rejects(
        client.connectDevices([fake.device]),
        /上一项操作尚未结束/,
      );
      assert.equal(fake.calls.send, 1);
      assert.equal(fake.calls.open, 1);
      assert.equal(fake.calls.close, 1);
      closing.resolve();
      await setImmediate();
      assert.equal(fake.device.opened, false);
      await client.dispose();
    });
  },
);

test(
  "dispose finishes even when closing its device never settles",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const fake = mouse();
      const client = new PulsarHidClient({ timeoutMs: 10 });
      await client.connectDevices([fake.device]);
      fake.operations.close = () => new Promise<void>(() => {});
      await client.dispose();
      assert.equal(client.connected, false);
      assert.equal(client.device, null);
      assert.equal(fake.calls.close, 1);
      await assert.rejects(client.connectDevices([fake.device]), /连接已取消/);
      assert.equal(fake.calls.send, 1);
    });
  },
);

test(
  "a wrong-interface query timeout still falls back to the next candidate",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const wrong = mouse();
      const settings = mouse();
      wrong.operations.receive = () => new Promise<DataView>(() => {});
      const client = new PulsarHidClient({ timeoutMs: 10 });
      assert.equal(
        await client.connectDevices([wrong.device, settings.device]),
        settings.device,
      );
      assert.equal(wrong.calls.send, 1);
      assert.equal(wrong.device.opened, false);
      assert.equal(settings.calls.send, 1);
      assert.equal(client.connected, true);
      assert.match(client.connectionAttempts[0].error ?? "", /I\/O 超时/);
      assert.equal(client.connectionAttempts[1].phase, "connected");
      await client.dispose();
    });
  },
);

test(
  "a failed candidate's hung cleanup cannot stall connection fallback",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const wrong = mouse();
      const settings = mouse();
      wrong.polling(3);
      wrong.operations.close = () => new Promise<void>(() => {});
      const client = new PulsarHidClient({ timeoutMs: 10 });
      assert.equal(
        await client.connectDevices([wrong.device, settings.device]),
        settings.device,
      );
      assert.equal(wrong.calls.close, 1);
      assert.equal(settings.calls.send, 1);
      assert.equal(client.connected, true);
      await client.dispose();
    });
  },
);

test(
  "firmware handoff rejects a pending failed-candidate close until every selected handle is released",
  { timeout: 1000 },
  async (t) => {
    await withMockClock(t, async () => {
      const updater = mouse();
      const settings = mouse();
      const closing = deferred();
      updater.polling(3);
      updater.operations.close = () => closing.promise;
      const client = new PulsarHidClient({ timeoutMs: 10 });
      const devices = [updater.device, settings.device];
      assert.equal(await client.connectDevices(devices), settings.device);
      assert.throws(
        () => client.assertDevicesReleased([settings.device]),
        /尚未完全释放/,
      );
      await client.disconnect();
      assert.equal(settings.device.opened, false);
      const calls = {
        updater: { ...updater.calls },
        settings: { ...settings.calls },
      };
      assert.throws(() => client.assertDevicesReleased(devices), /尚未完全释放/);
      assert.deepEqual(
        updater.calls,
        calls.updater,
        "The handoff check performs no I/O",
      );
      assert.deepEqual(settings.calls, calls.settings);
      // Even if the browser updates `opened` before the close Promise resolves,
      // the unresolved operation must keep this raw handle out of the updater.
      updater.device.opened = false;
      assert.throws(() => client.assertDevicesReleased(devices), /尚未完全释放/);
      closing.resolve();
      await setImmediate();
      assert.doesNotThrow(() => client.assertDevicesReleased(devices));
      await client.dispose();
    });
  },
);
