import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import {
  FIRMWARE_RELEASE,
  getFirmwareBytes,
  importFirmware,
  readFirmwareFile,
} from "../src/firmware-package";

test("firmware import rejects empty, truncated, oversized and archive-sized files", async () => {
  for (const size of [
    0,
    64,
    FIRMWARE_RELEASE.size - 1,
    2463017,
    FIRMWARE_RELEASE.updaterSize + 1,
  ])
    await assert.rejects(
      importFirmware(
        new ArrayBuffer(size),
        "Pulsar_Updater_v1017_v125_T01.exe",
      ),
      /大小不匹配/,
    );
});

test("filename and length cannot authorize a firmware image", async () => {
  await assert.rejects(
    importFirmware(new ArrayBuffer(FIRMWARE_RELEASE.size), "official.bin"),
    /SHA-256 不匹配/,
  );
  await assert.rejects(
    importFirmware(
      new ArrayBuffer(FIRMWARE_RELEASE.updaterSize),
      "Pulsar_Updater_v1017_v125_T01.exe",
    ),
    /SHA-256 不匹配/,
  );
});

test("file size is checked before allocating or reading its bytes", async () => {
  let reads = 0;
  const file = {
    size: 50_000_000,
    name: "firmware.exe",
    arrayBuffer: async () => {
      reads++;
      return new ArrayBuffer(0);
    },
  } as File;
  await assert.rejects(readFirmwareFile(file), /大小不匹配/);
  assert.equal(reads, 0);
});

test("forged metadata never exposes bytes for flashing", () => {
  assert.throws(
    () =>
      getFirmwareBytes({
        name: "fake.bin",
        version: FIRMWARE_RELEASE.version,
        target: FIRMWARE_RELEASE.target,
        size: FIRMWARE_RELEASE.size,
        sha256: FIRMWARE_RELEASE.sha256,
      }),
    /尚未通过/,
  );
});

// Proprietary firmware is not redistributed with the repo. This additional
// extraction/immutability check runs when the downloaded official package is
// present locally; rejection and HID state-machine tests do not depend on it.
const path = new URL(
  "../.local/firmware-research/xs1/Pulsar_Updater_v1017_v125_T01.exe",
  import.meta.url,
);
const available = await access(path).then(
  () => true,
  () => false,
);
test(
  "official EXE extracts exactly the allowlisted mouse image and keeps bytes immutable",
  { skip: !available },
  async () => {
    const source = new Uint8Array(await readFile(path));
    const image = await importFirmware(source.buffer, "official.exe");
    assert.equal(
      image.sha256,
      "53b7aa8ca14600d385448263d2d1761d7d4517c9c3fb4d59b7657c6a9b6ba29a",
    );
    assert.equal(image.size, 120020);
    assert.equal(Object.isFrozen(image), true);
    const extracted = getFirmwareBytes(image);
    const raw = await importFirmware(extracted.buffer, "mouse.bin");
    assert.equal(raw.sha256, image.sha256);
    source.fill(0);
    extracted.fill(0);
    assert.deepEqual(getFirmwareBytes(image), getFirmwareBytes(raw));
    const changed = getFirmwareBytes(image);
    changed[120019] ^= 1;
    await assert.rejects(
      importFirmware(changed.buffer, "mouse.bin"),
      /SHA-256 不匹配/,
    );
    assert.throws(() => getFirmwareBytes({ ...image }), /尚未通过/);
  },
);
