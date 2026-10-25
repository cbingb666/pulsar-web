import { t } from "./i18n";
import {
  getHidApi,
  type HidApi,
  type HidCollection,
  type HidDevice,
} from "./hid";
import { getFirmwareBytes, type FirmwareImage } from "./firmware-package";
import {
  buildFirmwareCommand,
  FirmwareConnection,
  transferFirmwareBytes,
} from "./firmware-transport";
export {
  buildFirmwareCommand,
  buildFirmwareBlocks,
  validateFirmwareReply,
} from "./firmware-transport";

// Official XS1 v1017 updater, x64 VA 0x140004770 / 0x140004c30.
// 3710:3401 uses DCDU, one image, and bootloader 484d:0003.
// See docs/firmware.md. No commands from the different 23DG path.
export const FIRMWARE_VENDOR_ID = 0x3710;
export const FIRMWARE_PRODUCT_ID = 0x3401;
export const BOOTLOADER_VENDOR_ID = 0x484d;
export const BOOTLOADER_PRODUCT_ID = 0x0003;
export type FirmwareDeviceMode = "normal" | "bootloader";
export type FirmwarePhase =
  | "opening"
  | "entering"
  | "erasing"
  | "preparing"
  | "writing"
  | "verifying"
  | "rebooting";
export interface FirmwareProgress {
  phase: FirmwarePhase;
  completed: number;
  total: number;
}
export interface FirmwareLog {
  time: string;
  direction: "out" | "in";
  reportId: number;
  bytes: number[];
}
export interface FirmwareOptions {
  hid?: HidApi;
  signal?: AbortSignal;
  /** The exact wired HID object that passed the settings identity handshake. */
  settingsDevice?: HidDevice;
  ioTimeoutMs?: number;
  onProgress?: (progress: FirmwareProgress) => void;
  onLog?: (entry: FirmwareLog) => void;
}

const SIZE = 64;
let inProgress = false;

function hasFirmwareCollection(
  collections: HidCollection[],
  mode: FirmwareDeviceMode,
): boolean {
  const report64 = (reports: HidCollection["inputReports"]) =>
    reports?.some(
      (report) =>
        report.reportId === 0 &&
        report.items?.reduce(
          (bits, item) => bits + item.reportSize * item.reportCount,
          0,
        ) ===
          SIZE * 8,
    );
  return collections.some(
    (collection) =>
      ((mode === "normal"
        ? collection.usagePage === 0xffff && collection.usage === 1
        : collection.usagePage >= 0xff00 ||
          // Live 484d:0003 bootloader advertises Generic Desktop / Undefined.
          // Do not admit mouse (1:2) or keyboard (1:6) collections.
          (collection.usagePage === 1 && collection.usage === 0)) &&
        report64(collection.inputReports) &&
        report64(collection.outputReports)) ||
      hasFirmwareCollection(collection.children ?? [], mode),
  );
}

function candidates(
  devices: HidDevice[],
  mode: FirmwareDeviceMode,
): HidDevice[] {
  const vendor = mode === "normal" ? FIRMWARE_VENDOR_ID : BOOTLOADER_VENDOR_ID;
  const product =
    mode === "normal" ? FIRMWARE_PRODUCT_ID : BOOTLOADER_PRODUCT_ID;
  return [...new Set(devices)].filter(
    (device) =>
      device.vendorId === vendor &&
      device.productId === product &&
      hasFirmwareCollection(device.collections, mode),
  );
}

export function selectFirmwareInterface(
  devices: HidDevice[],
  mode: FirmwareDeviceMode,
  settingsDevice?: HidDevice,
): HidDevice {
  const found = candidates(devices, mode);
  let device: HidDevice | undefined;
  if (mode === "normal") {
    // The official app selects MI02; MI03 is the already-handshaken settings
    // interface. Their descriptors are identical, so never use chooser order.
    if (found.length === 2 && settingsDevice && found.includes(settingsDevice))
      device = found.find((candidate) => candidate !== settingsDevice);
  } else if (found.length === 1) {
    device = found[0];
  }
  if (!device)
    throw new Error(
      mode === "normal"
        ? t("无法确认鼠标刷写通道：请只保留目标有线鼠标，先连接并读取配置，再重新选择同一鼠标。尚未发送刷写命令。")
        : t("未找到唯一的 484D:0003 鼠标引导程序通道，请只保留目标鼠标并重新选择。"),
    );
  if (
    !device.sendReport ||
    !device.addEventListener ||
    !device.removeEventListener
  )
    throw new Error(t("当前 HID 接口不支持固件刷写所需的输入 / 输出报告"));
  return device;
}

/** Call from a user gesture. The second chooser is needed after USB re-enumeration. */
export async function requestFirmwareDevices(
  mode: FirmwareDeviceMode,
  hid = getHidApi(),
): Promise<HidDevice[]> {
  if (!hid) throw new Error(t("固件刷写需要桌面版 Chrome / Edge 的 WebHID 支持"));
  const devices = await hid.requestDevice({
    filters: [
      {
        vendorId: mode === "normal" ? FIRMWARE_VENDOR_ID : BOOTLOADER_VENDOR_ID,
        productId:
          mode === "normal" ? FIRMWARE_PRODUCT_ID : BOOTLOADER_PRODUCT_ID,
      },
    ],
  });
  if (!devices.length) throw new Error(t("未选择鼠标，尚未开始本次操作"));
  return devices;
}

async function exclusive<T>(run: () => Promise<T>): Promise<T> {
  if (inProgress) throw new Error(t("已有固件操作正在进行，请等待完成"));
  inProgress = true;
  try {
    return await run();
  } finally {
    inProgress = false;
  }
}

/** Only enters bootloader. No erase or firmware payload is sent here. */
export async function enterFirmwareBootloader(
  devices: HidDevice[],
  options: FirmwareOptions = {},
): Promise<void> {
  return exclusive(async () => {
    const device = selectFirmwareInterface(
      devices,
      "normal",
      options.settingsDevice,
    );
    const connection = new FirmwareConnection(device, options);
    try {
      options.onProgress?.({ phase: "opening", completed: 0, total: 0 });
      await connection.open();
      options.onProgress?.({ phase: "entering", completed: 0, total: 0 });
      await connection.send(buildFirmwareCommand(255), true);
    } finally {
      await connection.close();
    }
  });
}

/** Returns after checksum acceptance and reboot dispatch, not a successful
 * firmware-version readback. The caller must reconnect and verify version.
 * There is intentionally no cancel/retry after erase starts.
 */
export async function flashFirmware(
  devices: HidDevice[],
  image: FirmwareImage,
  options: FirmwareOptions = {},
): Promise<void> {
  // Resolve the opaque allowlisted image before opening or sending anything.
  const bytes = getFirmwareBytes(image);
  return exclusive(async () => {
    const device = selectFirmwareInterface(devices, "bootloader");
    await transferFirmwareBytes(device, bytes, options);
  });
}
