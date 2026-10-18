import {
  BUTTON_IDS,
  REPORT_SIZE,
  PROFILE_COUNT,
  VENDOR_ID,
  SUPPORTED_PRODUCT_IDS,
  buildCommand,
  checksum,
  readCommand,
  matchesReply,
  parseDpiStages,
  dpiPayload,
  validateGlobal,
  validateProfile,
  integerInRange,
  type Command,
  type GlobalSettings,
  type ProfileSettings,
  type PowerStatus,
  type DeviceSnapshot,
  type Rgb,
} from "./protocol";

// WebHID is intentionally a small local interface: TypeScript's DOM lib does not include it.
export interface HidCollection {
  usagePage: number;
  usage: number;
  featureReports: {
    reportId: number;
    items?: { reportSize: number; reportCount: number }[];
  }[];
  inputReports?: {
    reportId: number;
    items?: { reportSize: number; reportCount: number }[];
  }[];
  outputReports?: {
    reportId: number;
    items?: { reportSize: number; reportCount: number }[];
  }[];
  children?: HidCollection[];
}
export interface HidDevice {
  vendorId: number;
  productId: number;
  productName: string;
  opened: boolean;
  collections: HidCollection[];
  open(): Promise<void>;
  close(): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number): Promise<DataView>;
  sendReport?(reportId: number, data: BufferSource): Promise<void>;
  addEventListener?(type: string, callback: EventListener): void;
  removeEventListener?(type: string, callback: EventListener): void;
}
export interface HidApi {
  requestDevice(options: {
    filters: { vendorId: number; productId: number; usagePage?: number }[];
  }): Promise<HidDevice[]>;
  getDevices(): Promise<HidDevice[]>;
  addEventListener?(type: string, callback: EventListener): void;
  removeEventListener?(type: string, callback: EventListener): void;
}
export interface ProtocolLog {
  time: string;
  direction: "out" | "in";
  bytes: number[];
  category: number;
  register: number;
}
export interface ConnectionAttempt {
  /** One-based position in the filtered candidate list, not a USB interface number. */
  candidate: number;
  productName: string;
  productId: number;
  phase: "open" | "probe" | "polling" | "identity" | "connected";
  probeLength?: number;
  identityTries?: number;
  identityReplyVariant?: "previous-polling-header";
  errorName?: string;
  error?: string;
}
export interface DeviceMacroSummary {
  id: number;
  name: string;
  size: number;
}
export interface DeviceMacro extends DeviceMacroSummary {
  data: number[];
}
export interface ClientOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  onLog?: (entry: ProtocolLog) => void;
  onDisconnect?: () => void;
  hid?: HidApi;
}
const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));
class FeatureSendError extends Error {
  constructor(cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.name = cause instanceof Error ? cause.name : "Error";
  }
}
export class UnsupportedCommandError extends Error {}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
export function getHidApi(): HidApi | undefined {
  return typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { hid?: HidApi }).hid;
}
export function isWebHidSupported(): boolean {
  return Boolean(getHidApi()) && globalThis.isSecureContext;
}
export function isSupportedDevice(device: HidDevice): boolean {
  return (
    device.vendorId === VENDOR_ID &&
    (SUPPORTED_PRODUCT_IDS as readonly number[]).includes(device.productId)
  );
}
function containsFeature(collections: HidCollection[]): boolean {
  return collections.some(
    (collection) =>
      (collection.usagePage >= 0xff00 &&
        collection.featureReports?.some((report) => report.reportId === 0)) ||
      containsFeature(collection.children ?? []),
  );
}
export class PulsarHidClient {
  device: HidDevice | null = null;
  private readonly options: ClientOptions;
  private readonly api: HidApi | undefined;
  private queue: Promise<unknown> = Promise.resolve();
  private epoch = 0;
  private lastCompletedReply?: {
    device: HidDevice;
    epoch: number;
    bytes: Uint8Array;
  };
  private disposed = false;
  readonly logs: ProtocolLog[] = [];
  readonly connectionAttempts: ConnectionAttempt[] = [];
  private readonly disconnectListener: EventListener;
  constructor(options: ClientOptions = {}) {
    this.options = options;
    this.api = options.hid ?? getHidApi();
    this.disconnectListener = ((event: Event & { device?: HidDevice }) => {
      if (event.device === this.device) {
        this.epoch++;
        this.device = null;
        options.onDisconnect?.();
      }
    }) as EventListener;
    this.api?.addEventListener?.("disconnect", this.disconnectListener);
  }
  get connected(): boolean {
    return this.device?.opened ?? false;
  }
  get name(): string {
    return this.device?.productName ?? "Pulsar Xlite v4 Mini";
  }
  get productId(): number | undefined {
    return this.device?.productId;
  }
  get maxPollingRate(): number {
    return this.productId === 0x5403 ? 8000 : 1000;
  }
  async getGrantedDevices(): Promise<HidDevice[]> {
    return ((await this.api?.getDevices()) ?? []).filter(isSupportedDevice);
  }
  async connect(): Promise<HidDevice> {
    if (!this.api)
      throw new Error(
        "当前浏览器不支持 WebHID，请使用桌面版 Chrome 或 Edge，并通过 localhost 或 HTTPS 打开。",
      );
    const devices = await this.api.requestDevice({
      filters: SUPPORTED_PRODUCT_IDS.map((productId) => ({
        vendorId: VENDOR_ID,
        productId,
        usagePage: 0xffff,
      })),
    });
    if (!devices.length)
      throw new Error("未选择设备。请重新连接并选择 Pulsar 鼠标。");
    return this.connectDevices(devices);
  }
  async reconnect(): Promise<HidDevice | null> {
    const devices = (await this.getGrantedDevices()).filter((device) =>
      containsFeature(device.collections),
    );
    // No permission/device is a normal first visit, never a reason to open a picker.
    if (this.disposed || !devices.length) return null;
    return this.connectDevices(devices);
  }
  async connectDevices(devices: HidDevice[]): Promise<HidDevice> {
    this.connectionAttempts.length = 0;
    await this.disconnect();
    const candidates = devices.filter(
      (device) =>
        isSupportedDevice(device) && containsFeature(device.collections),
    );
    let lastError = "";
    let lastErrorPriority = -1;
    for (const [index, device] of candidates.entries()) {
      this.assertNotDisposed();
      const attempt: ConnectionAttempt = {
        candidate: index + 1,
        productName: device.productName,
        productId: device.productId,
        phase: "open",
      };
      this.connectionAttempts.push(attempt);
      try {
        if (!device.opened) await device.open();
        this.assertNotDisposed();
        if (device.productId === 0x5402 || device.productId === 0x5403) {
          attempt.phase = "probe";
          const probe = await this.readReceiverProbe(device);
          attempt.probeLength = probe.byteLength;
          // Both receivers advertise identical vendor descriptors. The 1K
          // pairing interface returns a short feature report; captured 8K MI02
          // rejects the GET. Only a 64-byte route may receive settings queries.
          if (
            probe.byteLength !== REPORT_SIZE &&
            !(probe.byteLength === REPORT_SIZE + 1 && probe.getUint8(0) === 0)
          )
            throw new Error(
              `接收器接口报告长度不匹配（${probe.byteLength} 字节）`,
            );
          // The passive read may contain zeros or an old reply. Only the new
          // polling and identity requests below can confirm this connection.
        }
        this.assertNotDisposed();
        this.device = device;
        attempt.phase = "polling";
        // There are two identically-described vendor collections on this mouse.
        // Identify the settings interface using a read-only register query.
        const response = await this.transact(readCommand(1, 9, 2));
        if (
          ![
            1,
            2,
            4,
            8,
            ...(device.productId === 0x5403 ? [16, 32, 64] : []),
          ].includes(response[7])
        )
          throw new Error("设备返回了未知轮询率");
        if (device.productId !== 0x3401) {
          attempt.phase = "identity";
          // Fusion2 receivers are shared across mouse models. The receiver's
          // USB PID alone does not identify the mouse receiving our settings.
          const identity = await this.readReceiverIdentity(device, attempt);
          const vendorId = identity[6] | (identity[7] << 8),
            productId = identity[8] | (identity[9] << 8);
          if (vendorId !== VENDOR_ID || productId !== 0x3401) {
            const id = [vendorId, productId]
              .map((value) => value.toString(16).padStart(4, "0"))
              .join(":");
            throw new Error(
              `接收器尚未确认连接 Xlite v4（返回型号 ${id}），已停止连接。请检查鼠标电源和接收器配对。`,
            );
          }
        }
        this.assertNotDisposed();
        attempt.phase = "connected";
        return device;
      } catch (error) {
        attempt.errorName = error instanceof Error ? error.name : typeof error;
        attempt.error = error instanceof Error ? error.message : String(error);
        const priority =
          attempt.phase === "polling" || attempt.phase === "identity" ? 1 : 0;
        if (priority >= lastErrorPriority) {
          lastError = attempt.error;
          lastErrorPriority = priority;
        }
        this.device = null;
        if (device.opened) await device.close().catch(() => undefined);
        if (this.disposed) throw error;
      }
    }
    const recovery = devices.some(
      (device) => isSupportedDevice(device) && device.productId !== 0x3401,
    )
      ? "请确认鼠标已开启无线模式并移动鼠标唤醒，关闭其他配置软件或配置网页后重试；仍失败时重新插拔接收器。"
      : "请关闭占用设备的软件后重试。";
    throw new Error(
      `无法读取 Pulsar 配置接口。${recovery}${lastError ? ` ${lastError}` : ""}`,
    );
  }
  private async readReceiverIdentity(
    device: HidDevice,
    attempt: ConnectionAttempt,
  ): Promise<Uint8Array> {
    const epoch = this.epoch;
    // Native discovery makes one identity read, then up to three more.
    const maxTries = device.productId === 0x5402 ? 4 : 1;
    for (let tries = 1; ; tries++) {
      attempt.identityTries = tries;
      try {
        const reply = await this.exchange(
          readCommand(1, 4, 4),
          device.productId === 0x5403 ? "identity-polling" : undefined,
        );
        if (device.productId === 0x5403 && reply[2] === 0x89)
          attempt.identityReplyVariant = "previous-polling-header";
        return reply;
      } catch (error) {
        if (
          !(error instanceof FeatureSendError) ||
          tries >= maxTries ||
          this.device !== device ||
          this.epoch !== epoch ||
          !device.opened
        )
          throw error;
      }
      // Fusion retries this read-only identity query. Recovery is restricted
      // to send failures; replies and configuration writes are never retried.
      await delay(30);
      if (this.device !== device || this.epoch !== epoch || !device.opened)
        throw new Error("设备已断开连接");
    }
  }
  private async readReceiverProbe(device: HidDevice): Promise<DataView> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        device.receiveFeatureReport(0),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error("接收器接口读取超时，已停止探测")),
            Math.max(1, this.options.timeoutMs ?? 1200),
          );
        }),
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  async disconnect(): Promise<void> {
    this.epoch++;
    const device = this.device;
    this.device = null;
    if (device?.opened) await device.close();
  }
  async dispose(): Promise<void> {
    this.disposed = true;
    this.api?.removeEventListener?.("disconnect", this.disconnectListener);
    await this.disconnect();
  }
  private assertNotDisposed(): void {
    if (this.disposed) throw new Error("设备连接已取消");
  }
  private log(direction: "out" | "in", bytes: Uint8Array): void {
    const entry: ProtocolLog = {
      time: new Date().toISOString(),
      direction,
      bytes: Array.from(bytes),
      category: bytes[1],
      register: bytes[2],
    };
    this.logs.push(entry);
    if (this.logs.length > 300) this.logs.shift();
    this.options.onLog?.(entry);
  }
  transact(command: Command): Promise<Uint8Array> {
    return this.exchange(command);
  }
  private exchange(
    command: Command,
    receiverEcho?:
      | "identity-polling"
      | "indicator-low-power"
      | "profile-read"
      | "settings-read"
      | "indicator-write",
  ): Promise<Uint8Array> {
    const epoch = this.epoch;
    const operation = this.queue.then(async () => {
      if (epoch !== this.epoch) throw new Error("设备连接已经更改，请重试");
      const device = this.device;
      if (!device?.opened) throw new Error("请先连接鼠标");
      const previousReply =
        this.lastCompletedReply?.device === device &&
        this.lastCompletedReply.epoch === epoch
          ? this.lastCompletedReply.bytes
          : undefined;
      const recoverCachedRead =
        receiverEcho !== undefined &&
        receiverEcho !== "indicator-write" &&
        (command.register & 0x80) !== 0 &&
        device.productId === 0x5403;
      // Native QD7R5XpBRr recovers these getters after repeated pending reads.
      // This opt-in is never used by public transact or any setting write.
      const recoverPending =
        receiverEcho === "profile-read" &&
        device.productId === 0x5403 &&
        ((command.category === 5 && [0x81, 0x84].includes(command.register)) ||
          (command.category === 4 && command.register === 0x81));
      const request = buildCommand(command);
      this.log("out", request);
      const deadline =
        Date.now() +
        (command.timeoutMs ??
          this.options.timeoutMs ??
          (recoverPending ? 3000 : 1200));
      let pendingPolls = 0;
      let readRetries = 0;
      let cachedPolls = 0;
      let cachedRetries = 0;
      const assertCurrent = () => {
        if (this.device !== device || epoch !== this.epoch || !device.opened)
          throw new Error("设备已断开连接");
      };
      const io = async <T>(operation: () => Promise<T>): Promise<T> => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          return await Promise.race([
            operation(),
            new Promise<never>((_resolve, reject) => {
              timer = setTimeout(
                () => {
                  // An in-flight HID operation cannot be cancelled independently.
                  // Invalidate and close this session before allowing another command.
                  if (this.device === device) {
                    this.epoch++;
                    this.device = null;
                    void device.close().catch(() => undefined);
                    this.options.onDisconnect?.();
                  }
                  reject(new Error("HID I/O 超时，连接已关闭；请重新连接设备"));
                },
                Math.max(1, deadline - Date.now()),
              );
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      };
      const send = () =>
        io(async () => {
          assertCurrent();
          try {
            await device.sendFeatureReport(0, request);
          } catch (error) {
            throw new FeatureSendError(error);
          }
        });
      await send();
      if (device.productId === 0x5402 || device.productId === 0x5403) {
        // Fusion uses this timing for both receivers; hardware reads confirm it.
        // Subsequent pending polls keep the existing cadence and same request.
        await delay(
          (command.category === 1 && command.register === 0x87) ||
            (device.productId === 0x5403 &&
              command.category === 8 &&
              (command.register === 0x89 || command.register === 9))
            ? 100
            : 30,
        );
        if (this.device !== device || epoch !== this.epoch || !device.opened)
          throw new Error("设备已断开连接");
      }
      while (Date.now() <= deadline) {
        if (this.device !== device || epoch !== this.epoch)
          throw new Error("设备已断开连接");
        const response = await io(() => device.receiveFeatureReport(0));
        if (this.device !== device || epoch !== this.epoch)
          throw new Error("设备已断开连接");
        // WebHID includes an ID byte for numbered reports, but not report ID 0.
        const bytes = new Uint8Array(
          response.buffer,
          response.byteOffset,
          response.byteLength,
        );
        const packet =
          bytes.length === REPORT_SIZE + 1 && bytes[0] === 0
            ? bytes.slice(1)
            : bytes.slice();
        this.log("in", packet);
        if (
          packet.length === REPORT_SIZE &&
          packet[0] === 5 &&
          packet[1] === command.category &&
          packet[2] === command.register
        ) {
          const actual = packet[62] | (packet[63] << 8);
          if (checksum(packet) !== actual)
            throw new Error("设备响应校验和不匹配，已停止操作");
          // Fusion treats status 05 as offline, unlike pending status 02.
          // This ends the request; a setting write must never be resent here.
          throw new Error(
            "接收器未收到鼠标响应（状态 05）。请确认鼠标已开启无线模式并移动鼠标唤醒后重试。",
          );
        }
        if (
          packet.length === REPORT_SIZE &&
          packet[0] === 4 &&
          packet[1] === command.category &&
          packet[2] === command.register
        ) {
          if (checksum(packet) !== (packet[62] | (packet[63] << 8)))
            throw new Error("设备响应校验和不匹配，已停止操作");
          throw new UnsupportedCommandError("设备不支持或拒绝了此操作");
        }
        // Captured 5403 firmware replaces the identity body/length but retains
        // the preceding response's category/register. Discovery has just read
        // 01/89, so only its 01/89/04 success variant is accepted here. General
        // transactions remain strict; checksum and VID/PID validation still run.
        const identityPollingEcho =
          receiverEcho === "identity-polling" &&
          device.productId === 0x5403 &&
          packet[3] === 4 &&
          matchesReply(packet, { ...command, register: 0x89 });
        // The receiver-local LED read has the same partial-header behavior.
        // Its preceding low-power query has range 5–100; only mode 1/2 may
        // satisfy this alias, so the unchanged threshold is never accepted.
        const indicatorLowPowerEcho =
          receiverEcho === "indicator-low-power" &&
          device.productId === 0x5403 &&
          packet[3] === 2 &&
          (packet[7] === 1 || packet[7] === 2) &&
          matchesReply(packet, { ...command, register: 0x88 });
        if (
          matchesReply(packet, command) ||
          identityPollingEcho ||
          indicatorLowPowerEcho
        ) {
          const actual = packet[62] | (packet[63] << 8);
          if (checksum(packet) !== actual)
            throw new Error("设备响应校验和不匹配，已停止操作");
          this.lastCompletedReply = { device, epoch, bytes: packet.slice() };
          return packet;
        }
        // Captured 5403 LED setters leave the entire prior response unchanged.
        // This private path only releases the queue for mandatory fresh readback
        // in writePower. It is not an ACK and must not update the completion cache.
        if (
          receiverEcho === "indicator-write" &&
          device.productId === 0x5403 &&
          command.category === 8 &&
          command.register === 9 &&
          command.sub === 2 &&
          command.payload?.length === 1 &&
          [1, 2].includes(command.payload[0]) &&
          previousReply &&
          packet.length === REPORT_SIZE &&
          packet.every((value, index) => value === previousReply[index])
        )
          return packet;
        if (
          recoverPending &&
          packet.length === REPORT_SIZE &&
          packet[0] === 2
        ) {
          const pending = packet.slice();
          pending[0] = 1;
          if (matchesReply(pending, command)) {
            const validChecksum =
              checksum(packet) === (packet[62] | (packet[63] << 8));
            // Captured firmware also exposes a byte-for-byte request echo with
            // only status changed to 02, retaining the request's checksum.
            const exactRequestEcho = packet.every(
              (value, index) => index === 0 || value === request[index],
            );
            if (!validChecksum && !exactRequestEcho)
              throw new Error("设备响应校验和不匹配，已停止操作");
            pendingPolls++;
            if (pendingPolls >= 30) {
              if (readRetries >= 5 || Date.now() + 100 >= deadline) break;
              await delay(50);
              assertCurrent();
              if (Date.now() + 50 >= deadline) break;
              this.log("out", request);
              await send();
              readRetries++;
              pendingPolls = 0;
              await delay(50);
              assertCurrent();
              continue;
            }
          } else pendingPolls = 0;
        } else pendingPolls = 0;
        // A rejected old reply is never data for the current request. If an
        // internal read keeps receiving the exact previous verified completion,
        // ask once more; unrelated/malformed replies cannot trigger this path.
        if (
          recoverCachedRead &&
          previousReply &&
          packet.length === REPORT_SIZE &&
          packet.every((value, index) => value === previousReply[index])
        ) {
          cachedPolls++;
          if (cachedPolls >= 30) {
            if (cachedRetries >= 1 || Date.now() + 100 >= deadline) break;
            await delay(50);
            assertCurrent();
            if (Date.now() + 50 >= deadline) break;
            this.log("out", request);
            await send();
            cachedRetries++;
            cachedPolls = 0;
            await delay(50);
            assertCurrent();
            continue;
          }
        } else cachedPolls = 0;
        await delay(this.options.pollIntervalMs ?? (recoverPending ? 10 : 20));
      }
      throw new Error(
        `设备响应超时 (${command.category.toString(16)}:${command.register.toString(16)})。${readRetries + cachedRetries ? `已重新查询 ${readRetries + cachedRetries} 次，` : ""}未收到匹配的完成响应，请重新读取设备；持续失败时请导出诊断。`,
      );
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private read(
    category: number,
    register: number,
    sub: number,
    profile = 0,
    payload: number[] = [],
    echo?: number,
  ) {
    return this.exchange(
      readCommand(category, register, sub, profile, payload, echo),
      "settings-read",
    );
  }
  private write(
    category: number,
    register: number,
    sub: number,
    profile: number,
    payload: number[] = [],
  ) {
    return this.transact({ category, register, sub, profile, payload });
  }
  async readGlobalSettings(): Promise<GlobalSettings> {
    const polling = await this.read(1, 9, 2),
      debounce = await this.read(4, 3, 3);
    const angle = await this.read(7, 4, 2),
      ripple = await this.read(7, 3, 2),
      motion = await this.read(7, 5, 2);
    const value: GlobalSettings = {
      pollingRate: polling[7] * 125,
      debounce: debounce[7],
      angleSnap: !!angle[7],
      rippleControl: !!ripple[7],
      motionSync: !!motion[7],
    };
    validateGlobal(value);
    return value;
  }
  async readProfile(profile = 1): Promise<ProfileSettings> {
    integerInRange(profile, 1, PROFILE_COUNT, "Profile");
    const dpi = parseDpiStages(
      await this.exchange(readCommand(5, 4, 0x15, profile), "profile-read"),
    );
    // Fusion reads the dedicated active-stage register after the bulk table.
    dpi.activeStage = integerInRange(
      (await this.exchange(readCommand(5, 1, 2, profile), "profile-read"))[7],
      1,
      dpi.dpiStages.length,
      "Active DPI stage",
    );
    const lodReply = await this.read(7, 2, 3, profile);
    // Fusion2's selector 2 uses tenths of millimeters; older X2A enums differ.
    if (lodReply[7] !== 2) throw new Error("设备返回了尚未支持的 LOD 编码");
    const brightness = await this.read(3, 3, 3, profile, [1], 1),
      led = await this.read(3, 4, 15, profile, [1], 1);
    if (led[8] > 2) throw new Error("设备返回了未知灯光模式");
    for (let index = 0; index < dpi.dpiStages.length; index++) {
      const color = await this.read(5, 5, 5, profile, [index + 1], index + 1);
      dpi.dpiStages[index].color = Array.from(color.slice(8, 11)) as Rgb;
    }
    const buttons: ProfileSettings["buttons"] = {};
    for (const button of BUTTON_IDS) {
      const reply = await this.exchange(
        readCommand(4, 1, 6, profile, [button, 255], button),
        "profile-read",
      );
      buttons[button] = {
        type: reply[8],
        a1: reply[9],
        a2: reply[10],
        ...(reply[8] === 4 || (reply[8] === 9 && reply[9] === 7)
          ? { a3: reply[11] }
          : {}),
      };
    }
    return {
      profile,
      ...dpi,
      lod: lodReply[8] / 10,
      brightness: brightness[8],
      ledEffect: (["off", "steady", "breathe"] as const)[led[8]],
      breatheSpeed: led[11],
      buttons,
    };
  }
  async readPower(): Promise<PowerStatus> {
    const battery = await this.read(8, 1, 1),
      charging = await this.read(8, 3, 1);
    // Fusion explicitly handles 0xff instead of rejecting the power response.
    // Keep that sentinel unknown rather than displaying a false 0% battery.
    const batteryPercent =
      battery[6] === 0xff
        ? undefined
        : integerInRange(battery[6], 0, 100, "Battery percent");
    const sleep = await this.read(8, 5, 3),
      low = await this.read(8, 8, 2);
    integerInRange(low[7], 5, 100, "Low power threshold");
    let receiverIndicator: 1 | 2 | undefined;
    if (this.productId === 0x5403) {
      try {
        receiverIndicator = await this.readIndicatorAfterLowPower();
      } catch (error) {
        // Only a valid unsupported reply establishes an absent indicator.
        if (!(error instanceof UnsupportedCommandError)) throw error;
      }
    }
    return {
      batteryPercent,
      charging: !!charging[6],
      sleepSeconds: sleep[7] | (sleep[8] << 8),
      lowPowerPercent: low[7],
      ...(receiverIndicator ? { receiverIndicator } : {}),
    };
  }
  async readActiveProfile(): Promise<number> {
    const reply = await this.read(2, 6, 1);
    return integerInRange(reply[6], 1, PROFILE_COUNT, "Active profile");
  }
  async readProfileIds(): Promise<number[]> {
    const reply = await this.read(2, 2, 0x10);
    const count = integerInRange(reply[6], 1, PROFILE_COUNT, "Profile count");
    const ids = Array.from(reply.slice(7, 7 + count));
    ids.forEach((id) => integerInRange(id, 1, PROFILE_COUNT, "Profile ID"));
    if (new Set(ids).size !== ids.length)
      throw new Error("设备返回了重复配置编号");
    return ids;
  }
  async setActiveProfile(profile: number): Promise<DeviceSnapshot> {
    integerInRange(profile, 1, PROFILE_COUNT, "Profile");
    await this.write(2, 6, 1, profile);
    // Fusion itself waits 500 ms after the switch; globals otherwise address
    // the old active profile during the settling interval.
    await delay(500);
    if ((await this.readActiveProfile()) !== profile)
      throw new Error("设备配置切换回读不一致");
    return this.readSnapshot(profile);
  }
  async readFirmwareVersion(): Promise<string> {
    const reply = await this.read(1, 7, 4);
    return Array.from(reply.slice(6, 10))
      .reverse()
      .map((value) => value.toString(16).padStart(2, "0"))
      .join(".");
  }
  async readSnapshot(profile?: number): Promise<DeviceSnapshot> {
    const activeProfile = await this.readActiveProfile();
    const selectedProfile = profile ?? activeProfile;
    const global = await this.readGlobalSettings(),
      settings = await this.readProfile(selectedProfile);
    const warnings: string[] = [];
    let power: PowerStatus | undefined,
      firmwareVersion: string | undefined,
      availableProfiles: number[] | undefined;
    if (selectedProfile !== activeProfile)
      warnings.push("正在查看存储配置；性能和电源参数属于当前激活配置");
    try {
      power = await this.readPower();
    } catch {
      warnings.push("设备电池 / 电源信息尚不可用");
    }
    try {
      firmwareVersion = await this.readFirmwareVersion();
    } catch {
      warnings.push("固件版本读取失败");
    }
    try {
      availableProfiles = await this.readProfileIds();
    } catch {
      warnings.push("设备配置列表读取失败");
    }
    if ((await this.readActiveProfile()) !== activeProfile)
      throw new Error("设备活动配置在读取期间发生变化，请重新读取");
    return {
      global,
      profile: settings,
      power,
      activeProfile,
      availableProfiles,
      firmwareVersion,
      warnings,
    };
  }
  async writeGlobalSettings(
    next: GlobalSettings,
    previous: GlobalSettings,
    profile = 0,
  ): Promise<GlobalSettings> {
    validateGlobal(next);
    validateGlobal(previous);
    integerInRange(profile, 0, PROFILE_COUNT, "Profile");
    if (profile && (await this.readActiveProfile()) !== profile)
      throw new Error("活动配置已经变化，请重新读取后再应用");
    if (next.pollingRate > this.maxPollingRate)
      throw new Error("当前连接最高支持 1000 Hz；更高轮询率需要 8K 接收器");
    if (next.pollingRate !== previous.pollingRate)
      await this.write(1, 9, 2, profile, [next.pollingRate / 125]);
    if (next.debounce !== previous.debounce)
      await this.write(4, 3, 3, profile, [next.debounce, 0]);
    if (next.angleSnap !== previous.angleSnap)
      await this.write(7, 4, 2, profile, [Number(next.angleSnap)]);
    if (next.rippleControl !== previous.rippleControl)
      await this.write(7, 3, 2, profile, [Number(next.rippleControl)]);
    if (next.motionSync !== previous.motionSync)
      await this.write(7, 5, 2, profile, [Number(next.motionSync)]);
    const actual = await this.readGlobalSettings();
    for (const key of [
      "pollingRate",
      "debounce",
      "angleSnap",
      "rippleControl",
      "motionSync",
    ] as const)
      if (actual[key] !== next[key])
        throw new Error(`设置 ${key} 的设备回读不一致，请重新读取设备`);
    if (profile && (await this.readActiveProfile()) !== profile)
      throw new Error("活动配置在写入期间发生变化，请重新读取");
    return actual;
  }
  async writeProfile(
    next: ProfileSettings,
    previous: ProfileSettings,
  ): Promise<ProfileSettings> {
    validateProfile(next);
    validateProfile(previous);
    if (next.profile !== previous.profile)
      throw new Error("请先读取目标配置再写入");
    const profile = next.profile;
    const changedMacroBindings = BUTTON_IDS.map((button) => ({
      button,
      binding: next.buttons[button],
    })).filter(
      ({ button, binding }) =>
        [4, 5, 6].includes(binding.type) &&
        !same(binding, previous.buttons[button]),
    );
    if (changedMacroBindings.length) {
      const available = new Set(
        (await this.listMacros()).map((macro) => macro.id),
      );
      for (const { binding } of changedMacroBindings)
        if (!available.has(binding.a1 | (binding.a2 << 8)))
          throw new Error("按键引用的宏不存在于当前设备，请先上传对应宏");
    }
    if (
      next.activeStage !== previous.activeStage ||
      !same(
        next.dpiStages.map(({ x, y }) => [x, y]),
        previous.dpiStages.map(({ x, y }) => [x, y]),
      )
    )
      await this.write(
        5,
        4,
        0x21,
        profile,
        dpiPayload(next.dpiStages, next.activeStage),
      );
    if (next.lod !== previous.lod)
      await this.write(7, 2, 3, profile, [2, Math.round(next.lod * 10)]);
    if (next.brightness !== previous.brightness)
      await this.write(3, 3, 3, profile, [1, next.brightness]);
    if (
      next.ledEffect !== previous.ledEffect ||
      next.breatheSpeed !== previous.breatheSpeed
    ) {
      // Preserve all unexposed bytes in the shared LED block.
      const raw = await this.read(3, 4, 15, profile, [1], 1);
      const payload = Array.from(raw.slice(7, 21));
      payload[1] = ["off", "steady", "breathe"].indexOf(next.ledEffect);
      payload[4] = next.breatheSpeed;
      await this.write(3, 4, 15, profile, payload);
    }
    for (let index = 0; index < next.dpiStages.length; index++)
      if (!same(next.dpiStages[index].color, previous.dpiStages[index]?.color))
        await this.write(5, 5, 5, profile, [
          index + 1,
          ...next.dpiStages[index].color,
        ]);
    const changedButtons = BUTTON_IDS.filter(
      (button) => !same(next.buttons[button], previous.buttons[button]),
    );
    // Assign a replacement left click before removing the old one, so even a
    // disconnected partial write retains a way to operate the desktop.
    changedButtons.sort(
      (a, b) =>
        Number(next.buttons[b]?.type === 1 && next.buttons[b]?.a1 === 1) -
        Number(next.buttons[a]?.type === 1 && next.buttons[a]?.a1 === 1),
    );
    for (const button of changedButtons) {
      const binding = next.buttons[button];
      if (binding)
        await this.write(4, 1, 6, profile, [
          button,
          binding.type,
          binding.a1,
          binding.a2,
          ...(binding.a3 === undefined ? [] : [binding.a3]),
        ]);
    }
    const actual = await this.readProfile(profile);
    if (!same(actual, next))
      throw new Error("配置写入后的设备回读不一致，请重新读取设备检查实际值");
    return actual;
  }
  async writeSettings(
    next: Pick<DeviceSnapshot, "global" | "profile"> & { power?: PowerStatus },
    previous: DeviceSnapshot,
  ): Promise<DeviceSnapshot> {
    // Validate the complete batch before its first write.
    validateGlobal(next.global);
    validateProfile(next.profile);
    validateGlobal(previous.global);
    validateProfile(previous.profile);
    if (next.profile.profile !== previous.profile.profile)
      throw new Error("请先读取目标配置再写入");
    if (next.power?.sleepSeconds !== undefined)
      integerInRange(next.power.sleepSeconds, 30, 900, "Sleep seconds");
    if (next.power?.lowPowerPercent !== undefined)
      integerInRange(next.power.lowPowerPercent, 5, 100, "Low power threshold");
    if (next.power?.receiverIndicator !== undefined) {
      integerInRange(next.power.receiverIndicator, 1, 2, "Receiver indicator");
      if (this.productId !== 0x5403)
        throw new Error("接收器灯光设置需要 8K 接收器");
    }
    if (next.global.pollingRate > this.maxPollingRate)
      throw new Error("当前连接最高支持 1000 Hz；更高轮询率需要 8K 接收器");
    if ((await this.readActiveProfile()) !== next.profile.profile)
      throw new Error("请先切换到目标设备配置，再应用性能和电源设置");
    await this.writeProfile(next.profile, previous.profile);
    await this.writeGlobalSettings(
      next.global,
      previous.global,
      next.profile.profile,
    );
    const powerChanges: Pick<
      PowerStatus,
      "sleepSeconds" | "lowPowerPercent" | "receiverIndicator"
    > = {};
    if (
      next.power?.sleepSeconds !== undefined &&
      next.power.sleepSeconds !== previous.power?.sleepSeconds
    )
      powerChanges.sleepSeconds = next.power.sleepSeconds;
    if (
      next.power?.lowPowerPercent !== undefined &&
      next.power.lowPowerPercent !== previous.power?.lowPowerPercent
    )
      powerChanges.lowPowerPercent = next.power.lowPowerPercent;
    if (
      next.power?.receiverIndicator !== undefined &&
      next.power.receiverIndicator !== previous.power?.receiverIndicator
    )
      powerChanges.receiverIndicator = next.power.receiverIndicator;
    if (Object.keys(powerChanges).length)
      await this.writePower(powerChanges, next.profile.profile);
    const final = await this.readSnapshot(next.profile.profile);
    if (final.activeProfile !== next.profile.profile)
      throw new Error("活动配置在写入期间发生变化，请重新读取");
    return final;
  }
  async writePower(
    next: Pick<
      PowerStatus,
      "sleepSeconds" | "lowPowerPercent" | "receiverIndicator"
    >,
    profile = 0,
  ): Promise<PowerStatus> {
    integerInRange(profile, 0, PROFILE_COUNT, "Profile");
    if (next.sleepSeconds !== undefined)
      integerInRange(next.sleepSeconds, 30, 900, "Sleep seconds");
    if (next.lowPowerPercent !== undefined)
      integerInRange(next.lowPowerPercent, 5, 100, "Low power threshold");
    if (next.receiverIndicator !== undefined) {
      integerInRange(next.receiverIndicator, 1, 2, "Receiver indicator");
      if (this.productId !== 0x5403)
        throw new Error("接收器灯光设置需要 8K 接收器");
    }
    const device = this.device,
      epoch = this.epoch;
    const assertSession = () => {
      if (!device?.opened || this.device !== device || this.epoch !== epoch)
        throw new Error("电源设置期间设备连接已变化，请重新读取设备");
    };
    const inSession = async <T>(operation: () => Promise<T>): Promise<T> => {
      assertSession();
      const result = await operation();
      assertSession();
      return result;
    };
    if (
      profile &&
      (await inSession(() => this.readActiveProfile())) !== profile
    )
      throw new Error("活动配置已经变化，请重新读取后再应用");
    if (next.sleepSeconds !== undefined)
      await inSession(() =>
        this.write(8, 5, 3, profile, [
          next.sleepSeconds! & 255,
          next.sleepSeconds! >> 8,
        ]),
      );
    if (next.lowPowerPercent !== undefined)
      await inSession(() =>
        this.write(8, 8, 2, profile, [next.lowPowerPercent!]),
      );
    if (next.receiverIndicator !== undefined) {
      // Establish a fresh supported receiver mode before the single setter.
      await inSession(() => this.readReceiverIndicator());
      await inSession(() =>
        this.exchange(
          {
            category: 8,
            register: 9,
            sub: 2,
            profile,
            payload: [next.receiverIndicator!],
          },
          "indicator-write",
        ),
      );
    }
    const actual = await inSession(() => this.readPower());
    if (
      (next.sleepSeconds !== undefined &&
        actual.sleepSeconds !== next.sleepSeconds) ||
      (next.lowPowerPercent !== undefined &&
        actual.lowPowerPercent !== next.lowPowerPercent) ||
      (next.receiverIndicator !== undefined &&
        actual.receiverIndicator !== next.receiverIndicator)
    )
      throw new Error("电源设置回读不一致，请重新读取设备");
    if (
      profile &&
      (await inSession(() => this.readActiveProfile())) !== profile
    )
      throw new Error("活动配置在写入期间发生变化，请重新读取");
    return actual;
  }
  async readReceiverIndicator(): Promise<1 | 2> {
    if (this.productId !== 0x5403)
      throw new Error("接收器灯光设置需要 8K 接收器");
    // Seed the known header when this API is called outside readPower.
    integerInRange(
      (await this.read(8, 8, 2))[7],
      5,
      100,
      "Low power threshold",
    );
    return this.readIndicatorAfterLowPower();
  }
  private async readIndicatorAfterLowPower(): Promise<1 | 2> {
    const reply = await this.exchange(
      readCommand(8, 9, 2),
      "indicator-low-power",
    );
    return integerInRange(reply[7], 1, 2, "Receiver indicator") as 1 | 2;
  }
  async resetProfile(profile: number): Promise<DeviceSnapshot> {
    integerInRange(profile, 1, PROFILE_COUNT, "Profile");
    await this.write(2, 5, 1, profile);
    await delay(500);
    return this.setActiveProfile(profile);
  }
  /** Native Default2 dispatches without an ACK and may re-enumerate the device. */
  async requestFactoryReset(): Promise<void> {
    const epoch = this.epoch;
    const operation = this.queue.then(async () => {
      const device = this.device;
      if (epoch !== this.epoch || !device?.opened)
        throw new Error("请先连接鼠标");
      const packet = buildCommand({
        category: 1,
        register: 12,
        sub: 1,
        profile: 2,
      });
      this.log("out", packet);
      await device.sendFeatureReport(0, packet);
      await delay(2000);
      await this.disconnect();
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
  private macroCommand(
    register: number,
    sub: number,
    body: number[],
    echoBytes: Record<number, number> = {},
  ): Promise<Uint8Array> {
    return this.transact({
      category: 6,
      register,
      sub,
      profile: body[0] ?? 0,
      payload: body.slice(1),
      echoBytes,
      timeoutMs: 5000,
    });
  }
  private macroIdBytes(id: number): number[] {
    integerInRange(id, 1, 65535, "Macro ID");
    return [id & 255, id >> 8];
  }
  private u32(value: number): number[] {
    return [
      value & 255,
      (value >>> 8) & 255,
      (value >>> 16) & 255,
      (value >>> 24) & 255,
    ];
  }
  private getU32(bytes: Uint8Array, offset: number): number {
    return new DataView(
      bytes.buffer,
      bytes.byteOffset,
      bytes.byteLength,
    ).getUint32(offset, true);
  }
  async readMacroCount(): Promise<number> {
    return (await this.read(6, 1, 1))[6];
  }
  async listMacros(): Promise<DeviceMacroSummary[]> {
    const count = await this.readMacroCount();
    if (!count) return [];
    if (count > 128) throw new Error("设备宏数量超过当前实现的安全上限");
    const ids: number[] = [];
    for (let offset = 0; ids.length < count && offset < 26 * 8; offset += 26) {
      // List requests use the body as total count + entry offset, not profile.
      const reply = await this.transact({
        category: 6,
        register: 0x82,
        sub: 0x38,
        profile: offset ? count & 255 : 0,
        payload: offset ? [count >> 8, offset & 255, offset >> 8] : [],
        timeoutMs: 5000,
      });
      const total = reply[6] | (reply[7] << 8);
      if (total !== count)
        throw new Error("设备宏列表在读取期间发生变化，请重试");
      const previouslyCollected = ids.length;
      // Native Fusion scans the whole slot area and skips zero words. The
      // observed v4 reply has an empty word at 10 before its first ID at 12.
      for (let index = 0; index < 26 && ids.length < count; index++) {
        const id = reply[10 + index * 2] | (reply[11 + index * 2] << 8);
        if (!id) continue;
        if (ids.includes(id)) throw new Error("设备宏列表包含重复编号");
        ids.push(id);
      }
      if (ids.length === previouslyCollected)
        throw new Error("设备宏列表分页没有返回新条目，请重新读取");
    }
    if (ids.length !== count)
      throw new Error("设备宏列表未完整返回，请重新读取");
    const result: DeviceMacroSummary[] = [];
    for (const id of ids)
      result.push({
        id,
        name: await this.readMacroName(id),
        size: await this.readMacroSize(id),
      });
    return result;
  }
  async readMacroSize(id: number): Promise<number> {
    const idBytes = this.macroIdBytes(id);
    const reply = await this.macroCommand(0x83, 6, idBytes, { 7: idBytes[1] });
    const size = this.getU32(reply, 8);
    if (size > 4096) throw new Error("设备宏大小超过 4096 字节");
    return size;
  }
  async readMacroName(id: number): Promise<string> {
    const idBytes = this.macroIdBytes(id);
    const first = await this.macroCommand(0x85, 0x3a, idBytes, {
      7: idBytes[1],
    });
    const length = first[10] | (first[11] << 8);
    if (length > 4096 || length % 2) throw new Error("设备宏名称长度无效");
    const bytes = new Uint8Array(length);
    for (let offset = 0; offset < length; offset += 50) {
      const reply = await this.macroCommand(
        0x85,
        0x3a,
        [...idBytes, offset & 255, offset >> 8, length & 255, length >> 8],
        { 7: idBytes[1], 8: offset & 255, 9: offset >> 8 },
      );
      bytes.set(reply.slice(12, 12 + Math.min(50, length - offset)), offset);
    }
    return new TextDecoder("utf-16le").decode(bytes).replace(/\0+$/, "");
  }
  async readMacro(id: number): Promise<DeviceMacro> {
    const idBytes = this.macroIdBytes(id),
      size = await this.readMacroSize(id),
      name = await this.readMacroName(id);
    const data: number[] = [];
    for (let offset = 0; offset < size; offset += 50) {
      const count = Math.min(50, size - offset),
        offsetBytes = this.u32(offset);
      const reply = await this.macroCommand(
        0x86,
        6 + count,
        [...idBytes, ...offsetBytes],
        {
          7: idBytes[1],
          8: offsetBytes[0],
          9: offsetBytes[1],
          10: offsetBytes[2],
          11: offsetBytes[3],
        },
      );
      data.push(...reply.slice(12, 12 + count));
    }
    return { id, name, size, data };
  }
  async saveMacro(macro: {
    id: number;
    name: string;
    data: number[];
  }): Promise<DeviceMacro> {
    const idBytes = this.macroIdBytes(macro.id);
    if (!macro.name.trim() || macro.name.length > 25)
      throw new Error("宏名称须为 1–25 个 UTF-16 字符");
    integerInRange(macro.data.length, 1, 4096, "Macro data length");
    macro.data.forEach((value) => integerInRange(value, 0, 255, "Macro byte"));
    // Allocation reserves the exact data length. Never allocate or delete any
    // other macro while saving this explicit ID.
    await this.macroCommand(
      3,
      6,
      [...idBytes, ...this.u32(macro.data.length)],
      { 7: idBytes[1] },
    );
    for (let offset = 0; offset < macro.data.length; offset += 50) {
      const chunk = macro.data.slice(offset, offset + 50),
        offsetBytes = this.u32(offset);
      await this.macroCommand(
        6,
        6 + chunk.length,
        [...idBytes, ...offsetBytes, ...chunk],
        {
          7: idBytes[1],
          8: offsetBytes[0],
          9: offsetBytes[1],
          10: offsetBytes[2],
          11: offsetBytes[3],
        },
      );
    }
    const nameBytes: number[] = [];
    for (let index = 0; index < macro.name.length; index++) {
      const code = macro.name.charCodeAt(index);
      nameBytes.push(code & 255, code >> 8);
    }
    await this.macroCommand(
      5,
      0x3a,
      [...idBytes, 0, 0, nameBytes.length, 0, ...nameBytes],
      { 7: idBytes[1] },
    );
    const actual = await this.readMacro(macro.id);
    if (actual.name !== macro.name || !same(actual.data, macro.data))
      throw new Error("宏写入回读不一致，请重新读取设备宏");
    return actual;
  }
  async deleteMacro(id: number): Promise<void> {
    const idBytes = this.macroIdBytes(id);
    await this.macroCommand(4, 2, idBytes, { 7: idBytes[1] });
    if ((await this.listMacros()).some((macro) => macro.id === id))
      throw new Error("宏删除回读不一致");
  }
}
