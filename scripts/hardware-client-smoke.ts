/** Run with `npx tsx scripts/hardware-client-smoke.ts` (read-only by default).
 * --write-test: create/read/delete an unassigned macro, switch profiles/restore,
 * change inactive-stage DPI/polling and sleep + low-power settings/restore.
 * --product-id=0x5402 selects the 1K receiver (default 0x3401, cable).
 * --bind-side additionally tests
 * temporary macro binding on side button 5, restoring its original assignment.
 * This imports the production client; Python only adapts native feature I/O.
 * Disconnecting power or killing this process can prevent restoration. Durable
 * backups and complete command logs are saved before any settings write.
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import {
  mkdirSync,
  writeFileSync,
  renameSync,
  openSync,
  fsyncSync,
  closeSync,
} from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import assert from "node:assert/strict";
import {
  PulsarHidClient,
  type HidDevice,
  type DeviceMacroSummary,
  type ConnectionAttempt,
} from "../src/hid";
import type {
  DeviceSnapshot,
  ProfileSettings,
  GlobalSettings,
} from "../src/protocol";

const args = new Set(process.argv.slice(2));
const productArgument = [...args].find((arg) =>
  arg.startsWith("--product-id="),
);
const productId = productArgument
  ? Number(productArgument.slice("--product-id=".length))
  : 0x3401;
assert.ok(
  [0x3401, 0x5402, 0x5403].includes(productId),
  "Unsupported product ID",
);
if (productArgument) args.delete(productArgument);
const interfaceArgument = [...args].find((arg) =>
  arg.startsWith("--interface="),
);
const interfaceNumber = interfaceArgument
  ? Number(interfaceArgument.slice("--interface=".length))
  : 3;
assert.ok([2, 3].includes(interfaceNumber), "Unsupported interface");
if (interfaceArgument) args.delete(interfaceArgument);
if (
  [...args].some(
    (arg) => !["--write-test", "--bind-side", "--macro-only"].includes(arg),
  )
)
  throw new Error(
    "Unknown option; use --product-id=0x3401|0x5402|0x5403, --interface=2|3, --write-test, --bind-side, --macro-only",
  );
const writeTest = args.has("--write-test"),
  bindSide = args.has("--bind-side");
if (bindSide && !writeTest)
  throw new Error("--bind-side requires --write-test");
const root = fileURLToPath(new URL("../", import.meta.url));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const output = resolve(root, ".local", `hardware-client-${stamp}.json`);
const backupPath = resolve(
  root,
  ".local",
  `hardware-client-${stamp}-backup.json`,
);
mkdirSync(resolve(root, ".local"), { recursive: true });
const audit: {
  startedAt: string;
  writeTest: boolean;
  bindSide: boolean;
  productId: number;
  interfaceNumber: number;
  backupPath: string;
  initial?: DeviceSnapshot;
  targetProfileSnapshot?: DeviceSnapshot;
  macros?: DeviceMacroSummary[];
  temporaryMacroId?: number;
  tests: { name: string; status: string; error?: string }[];
  logs: unknown[];
  connectionAttempts?: ConnectionAttempt[];
  final?: DeviceSnapshot;
  finishedAt?: string;
  error?: string;
  restorationErrors?: string[];
} = {
  startedAt: new Date().toISOString(),
  writeTest,
  bindSide,
  productId,
  interfaceNumber,
  backupPath,
  tests: [],
  logs: [],
};
function durable(path: string, value: unknown) {
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + "\n");
  const fd = openSync(temporary, "r");
  try {
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(temporary, path);
}
const persist = () => durable(output, audit);
class NativeAdapter implements HidDevice {
  vendorId = 0x3710;
  productId = productId;
  productName =
    productId === 0x3401
      ? "Pulsar Xlite v4 · native test adapter"
      : "Pulsar receiver · native test adapter";
  opened = false;
  collections = [
    { usagePage: 0xffff, usage: 1, featureReports: [{ reportId: 0 }] },
  ];
  private child: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private start() {
    if (this.child) return;
    const child = spawn(
      "python3",
      [
        resolve(root, "scripts/hid-stdio.py"),
        "--product-id",
        String(productId),
        "--interface",
        String(interfaceNumber),
        ...(writeTest ? ["--write-test"] : []),
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    this.child = child;
    createInterface({ input: child.stdout }).on("line", (line) => {
      try {
        const message = JSON.parse(line),
          request = this.pending.get(message.id);
        if (!request) return;
        clearTimeout(request.timer);
        this.pending.delete(message.id);
        message.ok
          ? request.resolve(message.result)
          : request.reject(new Error(message.error));
      } catch (error) {
        this.fail(new Error(`Invalid worker reply: ${String(error)}`));
      }
    });
    child.stderr.on("data", (data) => process.stderr.write(data));
    child.on("error", (error) => this.fail(error));
    child.on("exit", () => {
      if (this.child !== child) return;
      this.child = null;
      this.opened = false;
      this.fail(new Error("Native HID worker exited"));
    });
  }
  private fail(error: Error) {
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(error);
    }
    this.pending.clear();
  }
  private rpc(command: string, data?: number[]): Promise<any> {
    this.start();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Native adapter timeout: ${command}`));
        void this.close();
      }, 10000);
      this.pending.set(id, { resolve, reject, timer });
      this.child!.stdin.write(JSON.stringify({ id, command, data }) + "\n");
    });
  }
  async open() {
    await this.rpc("open");
    this.opened = true;
  }
  async close() {
    this.opened = false;
    const child = this.child;
    this.child = null;
    this.fail(new Error("Native HID adapter closed"));
    child?.kill("SIGTERM");
  }
  async sendFeatureReport(reportId: number, data: BufferSource) {
    assert.equal(reportId, 0);
    const bytes = ArrayBuffer.isView(data)
      ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
      : new Uint8Array(data);
    await this.rpc("send", Array.from(bytes));
  }
  async receiveFeatureReport(reportId: number) {
    assert.equal(reportId, 0);
    const result = await this.rpc("receive");
    return new DataView(Uint8Array.from(result.data).buffer);
  }
}
const adapter = new NativeAdapter();
const client = new PulsarHidClient({
  onLog: (entry) => {
    audit.logs.push(entry);
    persist();
  },
});
let initial: DeviceSnapshot | undefined,
  temporaryMacroId: number | undefined,
  macroMayExist = false,
  sideMayBeChanged = false,
  settingsMayBeChanged = false,
  powerMayBeChanged = false,
  profileMayBeChanged = false;
let targetGlobalBackup:
  { profile: number; settings: GlobalSettings } | undefined;
const recoveryErrors: string[] = [];
const ensureConnected = async () => {
  if (!client.connected) await client.connectDevices([adapter]);
};
async function check(name: string, operation: () => Promise<void>) {
  const entry = {
    name,
    status: "running",
    error: undefined as string | undefined,
  };
  audit.tests.push(entry);
  persist();
  try {
    await operation();
    entry.status = "passed";
  } catch (error) {
    entry.status = "failed";
    entry.error = String(error);
    throw error;
  } finally {
    persist();
  }
}
async function restoreSide(profile: ProfileSettings) {
  await ensureConnected();
  await client.writeProfile(profile, await client.readProfile(profile.profile));
  sideMayBeChanged = false;
}
async function restoreSettings() {
  await ensureConnected();
  const current = await client.readSnapshot(initial!.profile.profile);
  await client.writeSettings(
    { profile: initial!.profile, global: initial!.global },
    current,
  );
  settingsMayBeChanged = false;
}
async function deleteTemporaryMacro() {
  if (temporaryMacroId === undefined || !macroMayExist) return;
  if (sideMayBeChanged)
    throw new Error(
      "Temporary macro retained until its side-button binding is restored",
    );
  await ensureConnected();
  try {
    await client.deleteMacro(temporaryMacroId);
  } catch (error) {
    if (
      (await client.listMacros()).some((macro) => macro.id === temporaryMacroId)
    )
      throw error;
  }
  macroMayExist = false;
}
async function recover(name: string, operation: () => Promise<void>) {
  try {
    await operation();
  } catch (error) {
    recoveryErrors.push(`${name}: ${String(error)}`);
  }
}
try {
  await client.connectDevices([adapter]);
  initial = await client.readSnapshot();
  const macros = await client.listMacros();
  audit.initial = initial;
  audit.macros = macros;
  durable(backupPath, {
    productId,
    interfaceNumber,
    initial,
    macros,
    time: new Date().toISOString(),
  });
  persist();
  if (writeTest) {
    temporaryMacroId = Math.max(0, ...macros.map((macro) => macro.id)) + 1;
    assert.ok(temporaryMacroId <= 65535, "No free test macro ID");
    audit.temporaryMacroId = temporaryMacroId;
    persist();
    await check("temporary macro create/read/delete", async () => {
      const data = bindSide
        ? Array.from({ length: 60 }, () => [12, 10]).flat()
        : Array.from({ length: 20 }, () => [3, 4, 12, 10, 4, 4]).flat(); // Bound test macro contains delays only, never emits input.
      macroMayExist = true;
      persist();
      try {
        const saved = await client.saveMacro({
          id: temporaryMacroId!,
          name: "测试宏 Codex temporary",
          data,
        });
        assert.deepEqual(saved.data, data);
        assert.ok(
          (await client.listMacros()).some(
            (macro) => macro.id === temporaryMacroId,
          ),
        );
        if (bindSide)
          await check("side button 5 macro binding/restore", async () => {
            const before = await client.readProfile(initial!.profile.profile),
              after = structuredClone(before);
            after.buttons[5] = {
              type: 4,
              a1: temporaryMacroId! & 255,
              a2: temporaryMacroId! >> 8,
              a3: 1,
            };
            sideMayBeChanged = true;
            persist();
            try {
              await client.writeProfile(after, before);
            } finally {
              await restoreSide(initial!.profile);
            }
          });
      } finally {
        await deleteTemporaryMacro();
      }
      assert.deepEqual(await client.listMacros(), macros);
    });
    if (!args.has("--macro-only"))
      await check(
        "inactive-stage DPI/polling write/readback/restore",
        async () => {
          const next = structuredClone(initial!);
          const stage = next.profile.dpiStages.find(
            (_, index) => index + 1 !== next.profile.activeStage,
          );
          assert.ok(stage, "This smoke test needs an inactive DPI stage");
          stage.x += stage.x < 32000 ? 10 : -10;
          next.global.pollingRate =
            next.global.pollingRate === 500 ? 1000 : 500;
          settingsMayBeChanged = true;
          persist();
          try {
            const actual = await client.writeSettings(
              { profile: next.profile, global: next.global },
              initial!,
            );
            assert.deepEqual(actual.profile, next.profile);
            assert.deepEqual(actual.global, next.global);
          } finally {
            await restoreSettings();
          }
        },
      );
    if (!args.has("--macro-only"))
      await check("active profile switch/restore", async () => {
        const target = initial!.profile.profile === 6 ? 1 : 6;
        profileMayBeChanged = true;
        persist();
        try {
          const targetSnapshot = await client.setActiveProfile(target);
          assert.equal(targetSnapshot.activeProfile, target);
          audit.targetProfileSnapshot = targetSnapshot;
          durable(backupPath, {
            productId,
            interfaceNumber,
            initial,
            macros,
            targetProfileSnapshot: targetSnapshot,
            time: new Date().toISOString(),
          });
          targetGlobalBackup = {
            profile: target,
            settings: targetSnapshot.global,
          };
          persist();
          try {
            await client.writeGlobalSettings(
              {
                ...targetSnapshot.global,
                rippleControl: !targetSnapshot.global.rippleControl,
              },
              targetSnapshot.global,
              target,
            );
          } finally {
            await client.writeGlobalSettings(
              targetSnapshot.global,
              await client.readGlobalSettings(),
              target,
            );
            targetGlobalBackup = undefined;
          }
        } finally {
          await client.setActiveProfile(initial!.profile.profile);
          profileMayBeChanged = false;
        }
      });
    if (
      !args.has("--macro-only") &&
      initial.power?.sleepSeconds !== undefined &&
      initial.power.lowPowerPercent !== undefined
    ) {
      await check("sleep/low-power write/readback/restore", async () => {
        powerMayBeChanged = true;
        persist();
        try {
          await client.writePower({
            sleepSeconds: initial!.power!.sleepSeconds === 30 ? 60 : 30,
            lowPowerPercent: initial!.power!.lowPowerPercent === 10 ? 15 : 10,
          });
        } finally {
          await client.writePower({
            sleepSeconds: initial!.power!.sleepSeconds,
            lowPowerPercent: initial!.power!.lowPowerPercent,
          });
          powerMayBeChanged = false;
        }
      });
    }
  }
} catch (error) {
  audit.error = error instanceof Error ? error.stack : String(error);
  process.exitCode = 1;
} finally {
  if (writeTest && initial) {
    if (targetGlobalBackup)
      await recover("target profile globals", async () => {
        profileMayBeChanged = true;
        await ensureConnected();
        await client.setActiveProfile(targetGlobalBackup!.profile);
        await client.writeGlobalSettings(
          targetGlobalBackup!.settings,
          await client.readGlobalSettings(),
          targetGlobalBackup!.profile,
        );
        targetGlobalBackup = undefined;
        profileMayBeChanged = true;
      });
    if (profileMayBeChanged)
      await recover("active profile", async () => {
        await ensureConnected();
        await client.setActiveProfile(initial!.profile.profile);
      });
    if (settingsMayBeChanged)
      await recover("DPI/polling settings", restoreSettings);
    if (sideMayBeChanged)
      await recover("side button", () => restoreSide(initial!.profile));
    if (powerMayBeChanged)
      await recover("power", async () => {
        await ensureConnected();
        await client.writePower({
          sleepSeconds: initial!.power?.sleepSeconds,
          lowPowerPercent: initial!.power?.lowPowerPercent,
        });
      });
    if (macroMayExist) await recover("temporary macro", deleteTemporaryMacro);
    await recover("final readback", async () => {
      await ensureConnected();
      audit.final = await client.readSnapshot();
      assert.equal(audit.final.activeProfile, initial!.activeProfile);
      assert.deepEqual(audit.final.global, initial!.global);
      assert.deepEqual(audit.final.profile, initial!.profile);
      assert.equal(
        audit.final.power?.sleepSeconds,
        initial!.power?.sleepSeconds,
      );
      assert.equal(
        audit.final.power?.lowPowerPercent,
        initial!.power?.lowPowerPercent,
      );
      assert.deepEqual(await client.listMacros(), audit.macros);
    });
  }
  if (recoveryErrors.length) {
    audit.restorationErrors = recoveryErrors;
    process.exitCode = 1;
  }
  audit.finishedAt = new Date().toISOString();
  audit.connectionAttempts = structuredClone(client.connectionAttempts);
  persist();
  await client.dispose();
  console.log(
    JSON.stringify(
      {
        ok: !audit.error && !recoveryErrors.length,
        writeTest,
        tests: audit.tests,
        restorationErrors: recoveryErrors,
        connectionAttempts: audit.connectionAttempts,
        evidence: output,
        backup: backupPath,
      },
      null,
      2,
    ),
  );
}
