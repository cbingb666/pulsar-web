// Exact payload in the official XS1 v1017/v125 T01 updater. No firmware is
// bundled or executed. See docs/firmware.md for source and extraction evidence.
export const FIRMWARE_RELEASE = Object.freeze({
  version: "1.0.1.7",
  deviceVersion: "00.00.10.17",
  target: "Xlite v4 Mini · USB 有线",
  vendorId: 0x3710,
  productId: 0x3401,
  size: 120020,
  sha256: "53b7aa8ca14600d385448263d2d1761d7d4517c9c3fb4d59b7657c6a9b6ba29a",
  updaterSize: 4830208,
  updaterSha256:
    "64260b82185aa80bcb70fcab427340139c115ae95f4e0fd2101e0bdf54ee30d5",
  offset: 0x261210,
});

export interface FirmwareImage {
  readonly name: string;
  readonly version: string;
  readonly target: string;
  readonly size: number;
  readonly sha256: string;
}

// Callers receive metadata only. Validated bytes stay private, so later changes
// to the input buffer or a fabricated metadata object cannot alter what is sent.
const images = new WeakMap<FirmwareImage, Uint8Array<ArrayBuffer>>();

async function sha256(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  if (!globalThis.crypto?.subtle)
    throw new Error("无法校验固件，请通过 HTTPS 或 localhost 打开本页");
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (v) =>
    v.toString(16).padStart(2, "0"),
  ).join("");
}

export async function importFirmware(
  buffer: ArrayBuffer,
  name: string,
): Promise<FirmwareImage> {
  if (
    buffer.byteLength !== FIRMWARE_RELEASE.size &&
    buffer.byteLength !== FIRMWARE_RELEASE.updaterSize
  )
    throw new Error(
      "文件大小不匹配。请解压官方 XS1 v1017_v125_T01 升级包，选择其中的 .exe；也可选择已校验的原始鼠标 .bin 固件。",
    );
  const bytes = new Uint8Array(buffer.slice(0));
  const hash = await sha256(bytes);
  let payload: Uint8Array<ArrayBuffer>;
  if (
    bytes.length === FIRMWARE_RELEASE.updaterSize &&
    hash === FIRMWARE_RELEASE.updaterSha256
  ) {
    payload = bytes.slice(
      FIRMWARE_RELEASE.offset,
      FIRMWARE_RELEASE.offset + FIRMWARE_RELEASE.size,
    );
  } else if (
    bytes.length === FIRMWARE_RELEASE.size &&
    hash === FIRMWARE_RELEASE.sha256
  ) {
    payload = bytes;
  } else {
    throw new Error(
      "SHA-256 不匹配：只接受已核对的官方 XS1 1.0.1.7 升级器或鼠标固件。文件可能损坏或属于其他型号/版本，未发送任何刷写命令。",
    );
  }
  if ((await sha256(payload)) !== FIRMWARE_RELEASE.sha256)
    throw new Error("内嵌鼠标固件校验失败，未发送任何刷写命令");
  const image = Object.freeze({
    name,
    version: FIRMWARE_RELEASE.version,
    target: FIRMWARE_RELEASE.target,
    size: payload.length,
    sha256: FIRMWARE_RELEASE.sha256,
  });
  images.set(image, payload);
  return image;
}

export function getFirmwareBytes(
  image: FirmwareImage,
): Uint8Array<ArrayBuffer> {
  const bytes = images.get(image);
  if (!bytes) throw new Error("固件尚未通过官方文件校验，请重新选择文件");
  return bytes.slice();
}

export async function readFirmwareFile(file: File): Promise<FirmwareImage> {
  if (
    file.size !== FIRMWARE_RELEASE.size &&
    file.size !== FIRMWARE_RELEASE.updaterSize
  )
    throw new Error(
      "请选择解压后的官方 Pulsar_Updater_v1017_v125_T01.exe，或已校验的鼠标 .bin 固件。当前文件大小不匹配。",
    );
  return importFirmware(await file.arrayBuffer(), file.name);
}
