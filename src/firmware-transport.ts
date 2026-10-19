import { getHidApi, type HidApi, type HidDevice } from "./hid";
import type { FirmwareOptions, FirmwarePhase, FirmwareLog } from "./firmware";

// Internal protocol driver. The public entrypoint in firmware.ts validates the
// opaque official image and selected device before calling this transport.
const SIZE = 64;
const MAGIC = [0x44, 0x43, 0x44, 0x55, 0x00] as const;
// A timed-out browser promise is still running. Keep its handle reserved until
// the real operation and any late-open cleanup finish, across manual retries.
const pendingOpens = new WeakMap<HidDevice, Promise<void>>();
const pendingCloses = new WeakMap<HidDevice, Promise<void>>();
const pendingSends = new WeakMap<HidDevice, Promise<void>>();
const owners = new WeakMap<HidDevice, object>();

export function buildFirmwareCommand(
  command: 1 | 2 | 3 | 4 | 255,
  length?: number,
): Uint8Array<ArrayBuffer> {
  const report = new Uint8Array(SIZE);
  report.set(MAGIC);
  report[5] = command;
  if (command === 2) {
    if (!Number.isInteger(length) || length! < 1 || length! > 0xffffffff)
      throw new Error("固件长度无效");
    new DataView(report.buffer).setUint32(6, length!, true);
  } else if (length !== undefined) {
    throw new Error("当前固件命令不接受长度参数");
  }
  return report;
}

/** Native memcpy replaces only the used bytes of the final block. Its tail
 * retains the preceding block, and is included in the native u16 checksum.
 * Replacing that tail with zeroes changes the verified transfer checksum.
 */
export function buildFirmwareBlocks(bytes: Uint8Array): {
  blocks: Uint8Array<ArrayBuffer>[];
  checksum: number;
} {
  if (!bytes.length) throw new Error("固件内容为空");
  const block = new Uint8Array(SIZE);
  const blocks: Uint8Array<ArrayBuffer>[] = [];
  let checksum = 0;
  for (let offset = 0; offset < bytes.length; offset += SIZE) {
    block.set(bytes.subarray(offset, offset + SIZE));
    blocks.push(block.slice());
    for (const value of block) checksum = (checksum + value) & 0xffff;
  }
  return { blocks, checksum };
}

export function validateFirmwareReply(
  bytes: Uint8Array,
  command: 1 | 2 | 3,
  expectedChecksum?: number,
): void {
  if (
    bytes.length !== SIZE ||
    MAGIC.some((value, index) => bytes[index] !== value) ||
    bytes[5] !== command
  )
    throw new Error("固件应答与当前命令不匹配，刷写已停止");
  if (bytes[6] !== 1) throw new Error("设备拒绝固件命令，刷写已停止");
  if (
    command === 3 &&
    (expectedChecksum === undefined ||
      (bytes[7] | (bytes[8] << 8)) !== expectedChecksum)
  )
    throw new Error("设备返回的固件校验和不一致，未发送重启命令");
}

export class FirmwareConnection {
  private readonly owner = {};
  private active = true;
  private disconnected = false;
  private acceptDisconnect = false;
  private waiter?: {
    command: 1 | 2 | 3;
    resolve: (bytes: Uint8Array) => void;
    reject: (error: Error) => void;
  };
  private readonly hid: HidApi | undefined;
  private readonly input: EventListener;
  private readonly disconnect: EventListener;
  private readonly abort: () => void;
  private readonly disconnectedPromise: Promise<never>;
  private rejectDisconnected!: (error: Error) => void;

  constructor(
    readonly device: HidDevice,
    readonly options: FirmwareOptions,
  ) {
    if (
      owners.has(device) ||
      pendingOpens.has(device) ||
      pendingCloses.has(device) ||
      pendingSends.has(device)
    )
      throw new Error(
        "上一次固件通道操作仍未结束，请等待通道释放后重试；必要时重新插拔鼠标",
      );
    owners.set(device, this.owner);
    this.hid = options.hid ?? getHidApi();
    this.disconnectedPromise = new Promise<never>((_, reject) => {
      this.rejectDisconnected = reject;
    });
    void this.disconnectedPromise.catch(() => undefined);
    this.input = ((event: Event & { reportId: number; data: DataView }) => {
      if (!this.active || !this.waiter) return;
      const bytes = new Uint8Array(
        event.data.buffer,
        event.data.byteOffset,
        event.data.byteLength,
      ).slice();
      this.log("in", event.reportId, bytes);
      // Unexpected report IDs/lengths cannot complete a command. Header/status
      // failures on correctly-framed replies stop the transfer, never retry.
      if (event.reportId !== 0 || bytes.length !== SIZE) return;
      const waiter = this.waiter;
      this.waiter = undefined;
      waiter.resolve(bytes);
    }) as EventListener;
    this.disconnect = ((event: Event & { device?: HidDevice }) => {
      if (event.device !== device || !this.active || this.acceptDisconnect)
        return;
      this.disconnected = true;
      const error = new Error(
        "鼠标在刷写期间断开，结果未确认。请保持 USB 连接并使用官方升级工具恢复。",
      );
      this.waiter?.reject(error);
      this.rejectDisconnected(error);
    }) as EventListener;
    this.abort = () => {
      this.disconnected = true;
      const error = new Error(
        "固件操作已停止，已发送的命令无法撤回；请保持 USB 连接并检查恢复状态",
      );
      this.waiter?.reject(error);
      this.rejectDisconnected(error);
    };
    device.addEventListener!("inputreport", this.input);
    this.hid?.addEventListener?.("disconnect", this.disconnect);
    options.signal?.addEventListener("abort", this.abort, { once: true });
    if (options.signal?.aborted) this.abort();
  }

  private log(
    direction: FirmwareLog["direction"],
    reportId: number,
    bytes: Uint8Array,
  ) {
    this.options.onLog?.({
      time: new Date().toISOString(),
      direction,
      reportId,
      bytes: Array.from(bytes),
    });
  }

  private releaseIfIdle(): void {
    if (
      !this.active &&
      owners.get(this.device) === this.owner &&
      !pendingOpens.has(this.device) &&
      !pendingCloses.has(this.device) &&
      !pendingSends.has(this.device)
    )
      owners.delete(this.device);
  }

  private closeHandle(): Promise<void> {
    // Cleanup from a previous session must never close a newer session's handle.
    if (owners.get(this.device) !== this.owner) return Promise.resolve();
    const pending = pendingCloses.get(this.device);
    if (pending) return pending;
    const closing = Promise.resolve().then(() => this.device.close());
    pendingCloses.set(this.device, closing);
    const settled = () => {
      if (pendingCloses.get(this.device) === closing)
        pendingCloses.delete(this.device);
      this.releaseIfIdle();
    };
    void closing.then(settled, settled);
    return closing;
  }

  private async bounded<T>(
    operation: Promise<T>,
    timeout = this.options.ioTimeoutMs ?? 1200,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        this.disconnectedPromise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error(
                  "固件传输超时，已停止发送；请保持 USB 连接并检查恢复状态",
                ),
              ),
            timeout,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  async open(): Promise<void> {
    if (this.disconnected || this.options.signal?.aborted)
      throw new Error("固件操作已停止，尚未打开刷写通道");
    if (this.device.opened) return;
    const opening = Promise.resolve()
      .then(() => this.device.open())
      .then(async () => {
        if (!this.active) await this.closeHandle().catch(() => undefined);
      });
    pendingOpens.set(this.device, opening);
    const settled = () => {
      if (pendingOpens.get(this.device) === opening)
        pendingOpens.delete(this.device);
      this.releaseIfIdle();
    };
    void opening.then(settled, settled);
    await this.bounded(opening);
  }

  async send(
    bytes: Uint8Array<ArrayBuffer>,
    expectedDisconnect = false,
    log = true,
  ): Promise<void> {
    if (
      !this.active ||
      this.disconnected ||
      this.options.signal?.aborted ||
      owners.get(this.device) !== this.owner ||
      pendingSends.has(this.device)
    )
      throw new Error("固件通道已断开或操作已停止，已停止发送");
    this.acceptDisconnect = expectedDisconnect;
    if (log) this.log("out", 0, bytes);
    // Observers may synchronously abort, including component unmount cleanup.
    if (this.options.signal?.aborted || this.disconnected)
      throw new Error("固件操作已停止，已停止发送");
    const sending = this.device.sendReport!(0, bytes);
    pendingSends.set(this.device, sending);
    const settled = () => {
      if (pendingSends.get(this.device) === sending)
        pendingSends.delete(this.device);
      this.releaseIfIdle();
    };
    void sending.then(settled, settled);
    await this.bounded(sending);
  }

  async command(
    command: 1 | 2 | 3,
    length?: number,
    expectedChecksum?: number,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const response = new Promise<Uint8Array>((resolve, reject) => {
      this.waiter = { command, resolve, reject };
      timer = setTimeout(
        () =>
          reject(
            new Error(
              "固件应答超时，刷写已停止；请保持 USB 连接并检查恢复状态",
            ),
          ),
        // The accepted browser flash needed 4945 ms for erase. Leave margin
        // for device/host scheduling while retaining a finite, no-retry limit.
        command === 1 ? 10_000 : 1000,
      );
    });
    // Listener and deadline exist before sendReport, including synchronous ACKs.
    const pending = Promise.race([response, this.disconnectedPromise]);
    void pending.catch(() => undefined);
    try {
      await this.send(buildFirmwareCommand(command, length));
      const bytes = await pending;
      validateFirmwareReply(bytes, command, expectedChecksum);
    } finally {
      clearTimeout(timer);
      this.waiter = undefined;
    }
  }

  async close(): Promise<void> {
    this.active = false;
    this.waiter = undefined;
    this.device.removeEventListener!("inputreport", this.input);
    this.hid?.removeEventListener?.("disconnect", this.disconnect);
    this.options.signal?.removeEventListener("abort", this.abort);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // An outstanding open owns its late close. Do not issue a concurrent
      // close that could finish before that open and leave an orphan handle.
      const cleanup = pendingOpens.get(this.device) ?? this.closeHandle();
      await Promise.race([
        cleanup.catch(() => undefined),
        new Promise<void>((resolve) => {
          timer = setTimeout(resolve, this.options.ioTimeoutMs ?? 1200);
        }),
      ]);
    } finally {
      clearTimeout(timer);
      this.releaseIfIdle();
    }
  }
}

export async function transferFirmwareBytes(
  device: HidDevice,
  bytes: Uint8Array,
  options: FirmwareOptions = {},
): Promise<void> {
  const { blocks, checksum } = buildFirmwareBlocks(bytes);
  const connection = new FirmwareConnection(device, options);
  const progress = (phase: FirmwarePhase, completed = 0) =>
    options.onProgress?.({ phase, completed, total: bytes.length });
  const delay = () => new Promise<void>((resolve) => setTimeout(resolve, 10));
  try {
    progress("opening");
    await connection.open();
    progress("erasing");
    await connection.command(1);
    progress("preparing");
    await connection.command(2, bytes.length);
    await delay();
    for (let index = 0; index < blocks.length; index++) {
      await connection.send(blocks[index], false, false);
      progress("writing", Math.min((index + 1) * SIZE, bytes.length));
    }
    progress("verifying", bytes.length);
    await connection.command(3, undefined, checksum);
    await delay();
    progress("rebooting", bytes.length);
    await connection.send(buildFirmwareCommand(4), true);
  } finally {
    await connection.close();
  }
}
