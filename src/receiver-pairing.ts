import {
  getHidApi,
  type HidApi,
  type HidCollection,
  type HidDevice,
} from "./hid";
import { VENDOR_ID, checksum } from "./protocol";

// Official Pairing Tool V0.11 / V0.12, not the Sonix settings envelope.
// Evidence and the descriptor assumptions awaiting hardware: docs/receiver-pairing-evidence.md.
export const PAIRING_PRODUCT_ID = 0x5403;
export const PAIRING_TIMEOUT_MS = 30_000;
export type PairingResult = "paired" | "already-paired";
export interface PairingLog {
  time: string;
  direction: "out" | "in";
  reportId: number;
  bytes: number[];
}
export interface PairingOptions {
  signal?: AbortSignal;
  hid?: HidApi;
  timeoutMs?: number;
  ioTimeoutMs?: number;
  onProgress?: (message: string) => void;
  onLog?: (entry: PairingLog) => void;
  onProbe?: (probe: PairingProbe) => void;
  onSelected?: (device: HidDevice) => void;
}
export interface PairingProbe {
  candidate: number;
  reads: {
    kind: "settings" | "unavailable" | "unknown";
    byteLength?: number;
    bytes?: number[];
    errorName?: string;
    error?: string;
  }[];
  errorName?: string;
  error?: string;
}

export function buildPairingReport(): Uint8Array<ArrayBuffer> {
  const report = new Uint8Array(64);
  report.set([0x48, 0x4d, 0x52, 0x44, 0xfc, 0x24]);
  return report;
}

function hasPairingReports(collections: HidCollection[]): boolean {
  const has64Bytes = (reports: HidCollection["inputReports"]) =>
    reports?.some(
      (report) =>
        report.reportId === 0 &&
        report.items?.reduce(
          (bits, item) => bits + item.reportSize * item.reportCount,
          0,
        ) === 512,
    );
  return collections.some(
    (collection) =>
      (collection.usagePage >= 0xff00 &&
        has64Bytes(collection.inputReports) &&
        has64Bytes(collection.outputReports)) ||
      hasPairingReports(collection.children ?? []),
  );
}

function pairingCandidates(devices: HidDevice[]): HidDevice[] {
  return [...new Set(devices)].filter(
    (device) =>
      device.vendorId === VENDOR_ID &&
      device.productId === PAIRING_PRODUCT_ID &&
      hasPairingReports(device.collections),
  );
}

export function selectPairingInterface(devices: HidDevice[]): HidDevice {
  const candidates = pairingCandidates(devices);
  if (candidates.length !== 1)
    throw new Error(
      candidates.length > 1
        ? "浏览器返回了多个无法区分的 8K 配对通道，尚未发送命令。一个接收器也可能提供相同接口；请只保留目标接收器，若仍失败，请导出诊断以完成接口适配。"
        : "未找到兼容的 8K 配对通道（64 字节输入 / 输出报告 0）。请确认选择的是 8K Dongle；可导出诊断以核对接口。",
    );
  const device = candidates[0];
  if (
    !device.sendReport ||
    !device.addEventListener ||
    !device.removeEventListener
  )
    throw new Error("当前 HID 接口不支持配对所需的输入 / 输出报告");
  return device;
}

function hasFeatureZero(
  collections: HidCollection[],
  exactSize = false,
): boolean {
  return collections.some(
    (collection) =>
      (collection.usagePage >= 0xff00 &&
        collection.featureReports?.some(
          (report) =>
            report.reportId === 0 &&
            (!exactSize ||
              report.items?.reduce(
                (bits, item) => bits + item.reportSize * item.reportCount,
                0,
              ) === 512),
        )) ||
      hasFeatureZero(collection.children ?? [], exactSize),
  );
}

async function routingIo<T>(
  operation: () => Promise<T>,
  options: PairingOptions,
): Promise<T> {
  if (options.signal?.aborted) throw routingCancelled();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation(),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error("配对通道只读检查超时，尚未发送配对命令")),
          options.ioTimeoutMs ?? 1200,
        );
        abort = () => reject(routingCancelled());
        options.signal?.addEventListener("abort", abort, { once: true });
        if (options.signal?.aborted) abort();
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (abort) options.signal?.removeEventListener("abort", abort);
  }
}

function isSettingsReport(view: DataView): boolean {
  const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const packet =
    bytes.length === 65 && bytes[0] === 0 ? bytes.subarray(1) : bytes;
  // A zero-filled buffer proves only its size, never a settings protocol reply.
  return (
    packet.length === 64 &&
    [1, 2, 4, 5].includes(packet[0]) &&
    checksum(packet) === (packet[62] | (packet[63] << 8))
  );
}

async function probePairingInterface(
  device: HidDevice,
  candidate: number,
  options: PairingOptions,
): Promise<PairingProbe> {
  const probe: PairingProbe = { candidate, reads: [] };
  let active = true;
  try {
    if (!device.opened)
      await routingIo(() => {
        const opening = device.open();
        void opening.then(
          () => {
            if (!active) void device.close().catch(() => undefined);
          },
          () => undefined,
        );
        return opening;
      }, options);
    for (let i = 0; i < 2; i++) {
      try {
        const view = await routingIo(
          () => device.receiveFeatureReport(0),
          options,
        );
        probe.reads.push({
          kind: isSettingsReport(view) ? "settings" : "unknown",
          byteLength: view.byteLength,
          bytes: Array.from(
            new Uint8Array(view.buffer, view.byteOffset, view.byteLength),
          ),
        });
      } catch (error) {
        // Chromium uses NotAllowedError for this transport failure; the spec
        // specifies NetworkError. Other permission/open/timeout errors are not
        // evidence of the pairing interface. See the real 5403 capture in docs.
        if (
          !(error instanceof Error) ||
          !["NotAllowedError", "NetworkError"].includes(error.name) ||
          error.message !== "Failed to receive the feature report."
        )
          throw error;
        probe.reads.push({
          kind: "unavailable",
          errorName: error.name,
          error: error.message,
        });
      }
    }
    return probe;
  } catch (error) {
    probe.errorName = error instanceof Error ? error.name : typeof error;
    probe.error = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    active = false;
    try {
      if (device.opened)
        await routingIo(() => device.close(), {
          ioTimeoutMs: options.ioTimeoutMs,
        });
    } catch (error) {
      probe.errorName = error instanceof Error ? error.name : typeof error;
      probe.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      options.onProbe?.(probe);
    }
  }
}

/** Distinguish the captured 5403 MI02/MI03 pair without output or SET_FEATURE.
 * Repeated failed GETs alone are insufficient: the sibling must positively
 * return valid settings reports on both reads, with neither probe incomplete.
 */
export async function resolvePairingInterface(
  devices: HidDevice[],
  options: PairingOptions = {},
): Promise<HidDevice> {
  const candidates = pairingCandidates(devices);
  if (candidates.length === 1 && !hasFeatureZero(candidates[0].collections))
    return selectPairingInterface(candidates);
  if (candidates.length === 0) return selectPairingInterface(candidates);
  if (
    candidates.length !== 2 ||
    candidates.some((device) => !hasFeatureZero(device.collections, true))
  )
    throw new Error(
      "无法确认 8K 配对通道：需要同一接收器的两个完整接口。请只保留目标接收器并重新选择；仍失败时请导出诊断。",
    );
  candidates.forEach((device) => selectPairingInterface([device]));
  options.onProgress?.("正在只读检查 8K 接收器的配对和配置通道…");
  const probes: PairingProbe[] = [];
  for (const [index, device] of candidates.entries()) {
    if (options.signal?.aborted) throw routingCancelled();
    probes.push(await probePairingInterface(device, index + 1, options));
  }
  if (options.signal?.aborted) throw routingCancelled();
  const role = (
    probe: PairingProbe,
    kind: PairingProbe["reads"][number]["kind"],
  ) =>
    !probe.error &&
    probe.reads.length === 2 &&
    probe.reads.every((read) => read.kind === kind);
  const pairing = probes.findIndex((probe) => role(probe, "unavailable"));
  if (pairing !== -1 && role(probes[1 - pairing], "settings"))
    return candidates[pairing];
  throw new Error(
    "8K 接口只读检查结果不足以确认配对通道，尚未发送配对命令。请重新插拔接收器，或导出诊断以核对接口。",
  );
}

/** Call directly from a user gesture. Never requests mouse/1K/Gen.2 permissions. */
export async function requestPairingDevices(
  hid = getHidApi(),
): Promise<HidDevice[]> {
  if (!hid) throw new Error("配对需要桌面版 Chrome / Edge 的 WebHID 支持");
  const devices = await hid.requestDevice({
    filters: [{ vendorId: VENDOR_ID, productId: PAIRING_PRODUCT_ID }],
  });
  if (!devices.length) throw new Error("未选择 8K 接收器，配对未开始");
  return devices;
}

function routingCancelled(): Error {
  return new Error("已停止只读检查，尚未发送配对命令");
}

function cancelled(): Error {
  return new Error(
    "已停止等待配对。已发送的配对命令无法撤回；接收器可能继续等待，请重新连接检查状态。",
  );
}

/** Sends once on the dedicated pairing interface, closes it on every exit.
 * A result is only the receiver's pairing status. The caller must perform the
 * normal Xlite v4 identity handshake before exposing settings for that mouse.
 */
export async function pairReceiver(
  devices: HidDevice[],
  options: PairingOptions = {},
): Promise<PairingResult> {
  const device = await resolvePairingInterface(devices, options);
  options.onSelected?.(device);
  const { signal } = options;
  const hid = options.hid ?? getHidApi();
  const ioTimeout = options.ioTimeoutMs ?? 1200;
  let active = true;
  let sent = false;
  let received = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inputListener: EventListener | undefined;
  let disconnectListener: EventListener | undefined;
  let abortListener: (() => void) | undefined;
  const checkCancelled = () => {
    if (signal?.aborted) throw cancelled();
  };
  const bounded = async <T>(operation: Promise<T>): Promise<T> => {
    checkCancelled();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(
            () =>
              reject(new Error("配对接口 I/O 超时，请重新插拔接收器后重试")),
            ioTimeout,
          );
          abort = () => reject(cancelled());
          signal?.addEventListener("abort", abort, { once: true });
        }),
      ]);
    } finally {
      clearTimeout(timeout);
      if (abort) signal?.removeEventListener("abort", abort);
    }
  };
  const log = (
    direction: PairingLog["direction"],
    reportId: number,
    data: Uint8Array,
  ) =>
    options.onLog?.({
      time: new Date().toISOString(),
      direction,
      reportId,
      bytes: Array.from(data),
    });
  try {
    checkCancelled();
    options.onProgress?.("正在打开 8K 接收器的配对通道…");
    if (!device.opened) {
      const opening = device.open();
      // WebHID open itself cannot be aborted. Close a late completion as well.
      void opening.then(
        () => {
          if (!active) void device.close().catch(() => undefined);
        },
        () => undefined,
      );
      await bounded(opening);
    }
    checkCancelled();
    const outcome = new Promise<PairingResult>((resolve, reject) => {
      inputListener = ((
        event: Event & { reportId: number; data: DataView },
      ) => {
        if (!sent || !active) return;
        const data = new Uint8Array(
          event.data.buffer,
          event.data.byteOffset,
          event.data.byteLength,
        );
        log("in", event.reportId, data);
        if (event.reportId !== 0 || event.data.byteLength !== 64) return;
        // Native tool only interprets this status byte; no echoed header or
        // checksum is evidenced. Never invent a settings-style checksum here.
        if (!received && data[6] === 2) resolve("already-paired");
        else if (data[6] === 3) resolve("paired");
        else if (data[6] === 4)
          reject(
            new Error("接收器报告配对失败。请让鼠标重新进入配对模式后重试。"),
          );
        received = true;
      }) as EventListener;
      disconnectListener = ((event: Event & { device?: HidDevice }) => {
        if (event.device === device)
          reject(new Error("8K 接收器已拔出，配对结果未确认"));
      }) as EventListener;
      abortListener = () => reject(cancelled());
      device.addEventListener!("inputreport", inputListener);
      hid?.addEventListener?.("disconnect", disconnectListener);
      signal?.addEventListener("abort", abortListener, { once: true });
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "30 秒内未确认配对结果。请重新连接检查状态，或让鼠标重新进入配对模式后重试。",
            ),
          ),
        options.timeoutMs ?? PAIRING_TIMEOUT_MS,
      );
    });
    // Observe an early cancel/disconnect while sendReport is still pending.
    void outcome.catch(() => undefined);
    checkCancelled();
    const report = buildPairingReport();
    options.onProgress?.("正在配对，最多等待 30 秒。请保持鼠标靠近接收器…");
    sent = true;
    log("out", 0, report);
    checkCancelled();
    await bounded(
      Promise.race([
        device.sendReport!(0, report),
        // A terminal failure/disconnect should interrupt a hanging send, but an
        // early success must still wait for sendReport itself to succeed.
        outcome.then(() => new Promise<never>(() => {})),
      ]),
    );
    checkCancelled();
    return await outcome;
  } finally {
    active = false;
    clearTimeout(timer);
    if (inputListener)
      device.removeEventListener!("inputreport", inputListener);
    if (disconnectListener)
      hid?.removeEventListener?.("disconnect", disconnectListener);
    if (abortListener) signal?.removeEventListener("abort", abortListener);
    // Closing is local cleanup, not an undocumented cancel command.
    let closeTimer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        device.close().catch(() => undefined),
        new Promise<void>((resolve) => {
          closeTimer = setTimeout(resolve, ioTimeout);
        }),
      ]);
    } finally {
      clearTimeout(closeTimer);
    }
  }
}
