import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  BatteryCharging,
  Check,
  ChevronRight,
  CircleHelp,
  Code2,
  Command,
  Cpu,
  Gauge,
  House,
  Info,
  Layers,
  Link2,
  LoaderCircle,
  Mouse,
  Plus,
  Radio,
  RefreshCw,
  RotateCcw,
  Save,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Unplug,
  Usb,
  X,
  Zap,
} from "lucide-react";
import {
  PulsarHidClient,
  isWebHidSupported,
  type ProtocolLog,
  type DeviceMacroSummary,
} from "./hid";
import {
  BUTTON_ACTIONS,
  BUTTON_IDS,
  DPI_MAX,
  DPI_MIN,
  POLLING_RATES,
  bindingLabel,
  dpiLockBinding,
  defaultGlobal,
  defaultProfile,
  type ButtonBinding,
  type DeviceSnapshot,
  type GlobalSettings,
  type ProfileSettings,
  type Rgb,
  type PowerStatus,
} from "./protocol";
import {
  clone,
  download,
  exportProfileFile,
  keyboardBinding,
  loadWorkspace,
  saveWorkspace,
  parseProfileFile,
  type WorkspaceProfile,
} from "./workspace";
import { MacroEditor } from "./MacroEditor";
import {
  MACRO_LIMITS,
  createMacro,
  parseMacros,
  serializeMacros,
  type Macro,
} from "./macros";
import {
  encodeNativeMacro,
  decodeNativeMacro,
  macroBinding,
  decodeMacroBinding,
} from "./macro-codec";
import {
  applyImmediateSetting,
  buildImmediateSettings,
  mergeImmediateSettings,
  type ImmediateChange,
} from "./immediate-settings";

type Tab =
  | "home"
  | "customize"
  | "performance"
  | "macro"
  | "power"
  | "profiles"
  | "diagnostics";
const tabs: { id: Tab; label: string; english: string; icon: typeof House }[] =
  [
    { id: "home", label: "设备概览", english: "HOME", icon: House },
    { id: "customize", label: "按键设置", english: "CUSTOMIZE", icon: Mouse },
    {
      id: "performance",
      label: "性能设置",
      english: "PERFORMANCE",
      icon: SlidersHorizontal,
    },
    { id: "macro", label: "宏编辑器", english: "MACRO", icon: Command },
    { id: "power", label: "电源管理", english: "POWER", icon: BatteryCharging },
    { id: "profiles", label: "配置管理", english: "PROFILES", icon: Layers },
  ];
const buttonNames: Record<number, string> = {
  1: "左键",
  2: "右键",
  3: "滚轮中键",
  4: "侧键 · 后退",
  5: "侧键 · 前进",
  11: "底部 DPI 键",
};
const connectionPhaseLabels = {
  open: "打开设备",
  probe: "检查报告长度",
  polling: "读取回报率",
  identity: "校验配对型号",
  connected: "连接成功",
};
const rgbHex = (color: Rgb) =>
  "#" + color.map((v) => v.toString(16).padStart(2, "0")).join("");
const hexRgb = (color: string): Rgb => [
  parseInt(color.slice(1, 3), 16),
  parseInt(color.slice(3, 5), 16),
  parseInt(color.slice(5, 7), 16),
];
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
function Panel({
  title,
  sub,
  icon: Icon = Settings2,
  children,
  className = "",
}: {
  title: string;
  sub?: string;
  icon?: typeof Mouse;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-heading">
        <span className="panel-symbol">
          <Icon size={18} />
        </span>
        <div>
          <h3>{title}</h3>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}
function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (b: boolean) => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="toggle-row">
      <span>
        <b>{label}</b>
        {description && <small>{description}</small>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="toggle-track" />
    </label>
  );
}
function Range({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (n: number) => void;
  onCommit?: (n: number) => void;
}) {
  const edited = useRef(false);
  const commit = (value: number) => {
    if (!edited.current) return;
    edited.current = false;
    onCommit?.(value);
  };
  return (
    <div className="range-field">
      <div className="field-label">
        <label>{label}</label>
        <span className="value-pill">
          {value}
          <small> {unit}</small>
        </span>
      </div>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          edited.current = true;
          onChange(Number(e.target.value));
        }}
        onPointerUp={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "Home",
              "End",
              "PageUp",
              "PageDown",
            ].includes(e.key)
          )
            commit(Number(e.currentTarget.value));
        }}
        onBlur={(e) => commit(Number(e.currentTarget.value))}
      />
      <div className="range-scale">
        <span>
          {min}
          {unit}
        </span>
        <span>
          {max}
          {unit}
        </span>
      </div>
    </div>
  );
}
function DpiInput({
  label,
  value,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const edited = useRef(false);
  return (
    <input
      type="number"
      aria-label={label}
      min={DPI_MIN}
      max={DPI_MAX}
      step={10}
      value={value}
      onChange={(e) => {
        edited.current = true;
        onChange(Number(e.currentTarget.value));
      }}
      onBlur={(e) => {
        if (!edited.current) return;
        edited.current = false;
        onCommit(Number(e.currentTarget.value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
function MouseFigure({
  selected,
  onSelect,
}: {
  selected?: number;
  onSelect?: (id: number) => void;
}) {
  return (
    <div className="mouse-figure">
      <div className="mouse-orbit orbit-one" />
      <div className="mouse-orbit orbit-two" />
      <img
        className="mouse-product"
        src={`${import.meta.env.BASE_URL}assets/xlite-v4.png`}
        alt="Pulsar Xlite v4 鼠标"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
      />
      <svg
        className="mouse-drawing"
        viewBox="0 0 360 490"
        role="img"
        aria-label="Xlite v4 按键位置示意"
      >
        <defs>
          <linearGradient id="shell" x1="0" y1="0" x2="1" y2=".8">
            <stop stopColor="#42464b" />
            <stop offset=".35" stopColor="#282b2f" />
            <stop offset="1" stopColor="#111315" />
          </linearGradient>
          <linearGradient id="left" x1="0" y1="0" x2=".9" y2="1">
            <stop stopColor="#54585c" />
            <stop offset="1" stopColor="#292d30" />
          </linearGradient>
          <filter id="shadow">
            <feDropShadow dx="0" dy="18" stdDeviation="14" floodOpacity=".22" />
          </filter>
        </defs>
        <g filter="url(#shadow)">
          <path
            d="M103 43 C133 12 231 16 260 56 C293 100 291 174 280 236 C274 282 308 357 276 409 C250 460 136 471 83 433 C39 399 50 341 56 279 C60 243 44 171 55 119 C63 79 74 61 103 43Z"
            fill="url(#shell)"
            stroke="#454a4e"
            strokeWidth="2"
          />
          <path
            d="M105 43 C124 27 148 24 174 25 L174 188 C141 197 101 198 57 177 C49 122 67 73 105 43Z"
            fill="url(#left)"
            stroke="#171a1c"
            strokeWidth="2"
          />
          <path
            d="M185 25 C223 22 249 37 260 56 C284 87 291 132 286 171 C257 184 225 191 185 188Z"
            fill="url(#left)"
            stroke="#171a1c"
            strokeWidth="2"
          />
          <rect
            x="164"
            y="58"
            width="29"
            height="65"
            rx="13"
            fill="#0a0b0c"
            stroke="#5a6065"
          />
          <path
            d="M171 68 H186 M171 76 H186 M171 84 H186 M171 92 H186 M171 100 H186 M171 108 H186"
            stroke="#484d50"
            strokeWidth="3"
          />
          <path
            d="M58 189 C91 202 142 211 177 199 C208 211 254 199 283 185"
            fill="none"
            stroke="#080a0b"
            strokeWidth="3"
          />
          <path
            d="M57 205 L57 256 Q45 256 47 241 L47 213Z M57 267 L60 312 Q45 312 46 297 L46 274Z"
            fill="#474c51"
            stroke="#171a1c"
            strokeWidth="2"
          />
          <text
            x="180"
            y="361"
            textAnchor="middle"
            fill="#747a7e"
            fontSize="25"
            fontFamily="Arial"
            fontStyle="italic"
            fontWeight="bold"
          >
            pulsar
          </text>
          <path d="M211 345 l8 9 -8 9 -2 -9Z" fill="#0786fa" />
        </g>
      </svg>
      {onSelect &&
        [
          [1, 39, 25],
          [2, 63, 25],
          [3, 51, 19],
          [4, 22, 45],
          [5, 23, 58],
          [11, 69, 78],
        ].map(([id, x, y]) => (
          <button
            key={id}
            className={`mouse-hotspot ${selected === id ? "active" : ""}`}
            style={{ left: `${x}%`, top: `${y}%` }}
            onClick={() => onSelect(id)}
            aria-label={`选择${buttonNames[id]}`}
          >
            {id === 11 ? 6 : id}
          </button>
        ))}
    </div>
  );
}
export default function App() {
  const [tab, setTab] = useState<Tab>("performance");
  const [profiles, setProfiles] = useState<WorkspaceProfile[]>(loadWorkspace);
  const [selectedProfile, setSelectedProfile] = useState(1);
  const [snapshot, setSnapshot] = useState<DeviceSnapshot | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState<{
    text: string;
    error?: boolean;
  } | null>(null);
  const [selectedButton, setSelectedButton] = useState(1);
  const [captureKey, setCaptureKey] = useState(false);
  const [lockDpi, setLockDpi] = useState(800);
  const [linked, setLinked] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [logVersion, setLogVersion] = useState(0);
  const [macros, setMacros] = useState<Macro[]>(() => {
    try {
      return parseMacros(localStorage.getItem("pulsar-macros-v1") ?? "");
    } catch {
      return [];
    }
  });
  const [deviceMacros, setDeviceMacros] = useState<DeviceMacroSummary[]>([]);
  const [powerDraft, setPowerDraft] = useState<PowerStatus | undefined>();
  const [macroLoop, setMacroLoop] = useState<Macro["loopMode"]>("once");
  const [macroRepeat, setMacroRepeat] = useState(1);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    description: string;
    run: () => void;
  } | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const clientRef = useRef<PulsarHidClient | null>(null);
  const busyRef = useRef(false);
  const current = profiles[selectedProfile - 1];
  const p = current.profile;
  const g = current.global;
  const client = () => clientRef.current!;
  const dirty =
    !!snapshot &&
    (current.dpiLayoutPending ||
      !equal(snapshot.global, g) ||
      !equal(snapshot.profile, p) ||
      !equal(snapshot.power, powerDraft));
  useEffect(() => {
    const c = new PulsarHidClient({
      onDisconnect: () => {
        if (clientRef.current !== c) return;
        setConnected(false);
        setSnapshot(null);
        setPowerDraft(undefined);
        setDeviceMacros([]);
        setNotice({ text: "鼠标已断开。编辑的配置仍保留在浏览器中。" });
      },
    });
    clientRef.current = c;
    // Defer until after StrictMode's setup/cleanup replay, using this mount's client.
    void Promise.resolve().then(() => {
      if (clientRef.current === c && isWebHidSupported())
        return connectDevice(true, c);
    });
    return () => {
      clientRef.current = null;
      busyRef.current = false;
      void c.dispose();
    };
  }, []);
  useEffect(() => {
    try {
      saveWorkspace(profiles);
    } catch {
      setNotice({
        text: "浏览器本地存储不可用，请导出配置备份。",
        error: true,
      });
    }
  }, [profiles]);
  useEffect(() => {
    try {
      localStorage.setItem("pulsar-macros-v1", serializeMacros(macros));
    } catch {
      setNotice({ text: "宏保存失败，请导出备份。", error: true });
    }
  }, [macros]);
  useEffect(() => {
    const b = p.buttons[selectedButton];
    if ([4, 5, 6].includes(b.type)) {
      try {
        const decoded = decodeMacroBinding({ ...b, type: b.type as 4 | 5 | 6 });
        setMacroLoop(decoded.loopMode);
        setMacroRepeat(decoded.repeatCount);
      } catch {}
    }
    if (b.type === 9 && b.a1 === 7) setLockDpi((b.a2 << 8) | (b.a3 ?? 0));
  }, [selectedButton, p.buttons]);
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(id);
  }, [notice]);
  function update(updater: (value: WorkspaceProfile) => WorkspaceProfile) {
    if (busyRef.current) return;
    setProfiles((old) =>
      old.map((v, i) =>
        i === selectedProfile - 1 ? { ...updater(clone(v)), pending: true } : v,
      ),
    );
  }
  const setProfile = (patch: Partial<ProfileSettings>, layoutChange = false) =>
    update((v) => ({
      ...v,
      dpiLayoutPending: layoutChange || v.dpiLayoutPending,
      profile: { ...v.profile, ...patch },
    }));
  const setGlobal = (patch: Partial<GlobalSettings>) =>
    update((v) => ({ ...v, global: { ...v.global, ...patch } }));
  function stageImmediateChange(change: ImmediateChange) {
    update((v) => {
      if (change.kind === "global")
        v.global = { ...v.global, [change.field]: change.value };
      else if (change.kind === "dpi")
        v.profile.dpiStages = v.profile.dpiStages.map((stage, index) =>
          index + 1 === change.stage
            ? { ...stage, x: change.x ?? stage.x, y: change.y ?? stage.y }
            : stage,
        );
      else v.profile = { ...v.profile, [change.kind]: change.value };
      return v;
    });
  }
  async function commitImmediate(change: ImmediateChange, label: string) {
    if (busyRef.current) return;
    stageImmediateChange(change);
    // Only explicit control events reach this path; loading/importing a draft
    // or reconnecting must never automatically flush saved browser settings.
    if (!connected || !snapshot) {
      if (connected)
        setNotice({
          text: "更改已暂存。请先重新读取设备，恢复即时应用。",
          error: true,
        });
      return;
    }
    if (
      (change.kind === "dpi" || change.kind === "activeStage") &&
      (current.dpiLayoutPending ||
        p.dpiStages.length !== snapshot.profile.dpiStages.length)
    ) {
      setNotice({
        text: "DPI 档位增删或导入草稿尚未应用，本次更改已暂存。请点击“应用到鼠标”。",
      });
      return;
    }
    let next: DeviceSnapshot;
    try {
      next = buildImmediateSettings(snapshot, change);
    } catch (error) {
      setNotice({
        text: `${label}未写入：${error instanceof Error ? error.message : error}`,
        error: true,
      });
      return;
    }
    const mergeSaved = (actual: DeviceSnapshot) =>
      setProfiles((old) =>
        old.map((v, index) =>
          index === selectedProfile - 1
            ? mergeImmediateSettings(v, actual, change)
            : v,
        ),
      );
    if (
      equal(next.global, snapshot.global) &&
      equal(next.profile, snapshot.profile)
    ) {
      mergeSaved(snapshot);
      return;
    }
    await run(`正在应用${label}`, async () => {
      try {
        const actual = await applyImmediateSetting(client(), snapshot, change);
        setSnapshot(actual);
        mergeSaved(actual);
        setNotice({ text: `${label}已生效，设备回读已确认。` });
      } catch (error) {
        setSnapshot(null);
        throw new Error(
          `${label}未确认生效：${error instanceof Error ? error.message : error}。已暂停即时应用，请重新读取设备检查实际值。`,
        );
      }
    });
  }
  function applySnapshot(
    s: DeviceSnapshot,
    index: number,
    preserveDraft = false,
  ) {
    setSnapshot(s);
    setPowerDraft(s.power ? clone(s.power) : undefined);
    setProfiles((old) =>
      old.map((v, i) =>
        i === index - 1
          ? preserveDraft && v.pending
            ? v
            : {
                ...v,
                global: clone(s.global),
                profile: clone(s.profile),
                pending: false,
                dpiLayoutPending: false,
              }
          : v,
      ),
    );
    setLogVersion((v) => v + 1);
  }
  async function run(label: string, fn: () => Promise<void>, c = client()) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      if (clientRef.current === c)
        setNotice({
          text: e instanceof Error ? e.message : String(e),
          error: true,
        });
    } finally {
      if (clientRef.current === c) {
        busyRef.current = false;
        setBusy("");
        setConnected(c.connected);
        setLogVersion((v) => v + 1);
      }
    }
  }
  async function connect() {
    await connectDevice(false);
  }
  async function connectDevice(automatic: boolean, c = client()) {
    await run(
      automatic ? "正在自动连接设备" : "连接并读取设备",
      async () => {
        setDeviceMacros([]);
        const device = automatic ? await c.reconnect() : await c.connect();
        if (!device || clientRef.current !== c) return;
        setConnected(true);
        const s = await c.readSnapshot();
        if (clientRef.current !== c) return;
        setSelectedProfile(s.profile.profile);
        applySnapshot(s, s.profile.profile, true);
        const deviceMacros = await c.listMacros();
        if (clientRef.current !== c) return;
        setDeviceMacros(deviceMacros);
        setNotice({
          text: `${automatic ? "已自动连接" : "已连接"}并读取设备。若此配置有未应用的本地草稿，草稿已保留，请确认后应用。`,
        });
      },
      c,
    );
  }
  async function refresh() {
    await run("读取设备配置", async () => {
      const s = await client().readSnapshot();
      setSelectedProfile(s.profile.profile);
      applySnapshot(s, s.profile.profile);
      setNotice({ text: "已读取鼠标的最新配置。" });
    });
  }
  async function save() {
    if (!snapshot) return;
    await run("写入并回读验证", async () => {
      try {
        const s = await client().writeSettings(
          { global: g, profile: p, power: powerDraft },
          snapshot,
        );
        applySnapshot(s, selectedProfile);
        setNotice({ text: "设置已写入鼠标，并通过设备回读验证。" });
      } catch (e) {
        setSnapshot(null);
        throw new Error(
          `${e instanceof Error ? e.message : e}。部分设置可能已写入，请先重新读取设备。`,
        );
      }
    });
  }
  async function chooseProfile(index: number) {
    if (busy || index === selectedProfile) return;
    if (dirty) {
      setNotice({
        text: "请先应用当前更改，或点击“重新读取”放弃更改。",
        error: true,
      });
      return;
    }
    if (!connected) {
      setSelectedProfile(index);
      setSnapshot(null);
      return;
    }
    await run("切换设备配置", async () => {
      const s = await client().setActiveProfile(index);
      setSelectedProfile(index);
      applySnapshot(s, index, true);
      setNotice({ text: `已切换并读取设备配置 ${index}。` });
    });
  }
  async function refreshDeviceMacros() {
    await run("读取设备宏", async () =>
      setDeviceMacros(await client().listMacros()),
    );
  }
  async function uploadMacro(macro: Macro) {
    await run("上传并回读验证宏", async () => {
      const data = encodeNativeMacro(macro);
      const existing = await client().listMacros();
      const id = Math.max(0, ...existing.map((m) => m.id)) + 1;
      if (id > 65535) throw new Error("设备宏编号已用尽");
      try {
        await client().saveMacro({ id, name: macro.name, data });
        setDeviceMacros(await client().listMacros());
      } catch (error) {
        if (client().connected) {
          try {
            setDeviceMacros(await client().listMacros());
          } catch {
            setDeviceMacros([]);
          }
        } else setDeviceMacros([]);
        throw new Error(
          `${error instanceof Error ? error.message : error}。宏可能已经部分写入（ID ${id}），请刷新设备宏检查。`,
        );
      }
      setNotice({
        text: `宏“${macro.name}”已写入设备并回读验证。可在按键设置中分配。`,
      });
    });
  }
  async function importDeviceMacro(id: number) {
    await run("读取设备宏内容", async () => {
      if (macros.length >= MACRO_LIMITS.macros)
        throw new Error("本地宏库已达128个上限，请先导出整理");
      const raw = await client().readMacro(id);
      const macro = {
        ...createMacro(raw.name),
        events: decodeNativeMacro(raw.data),
      };
      setMacros((old) => [...old, macro]);
      setNotice({ text: "设备宏已导入本地宏库。循环方式由按键绑定决定。" });
    });
  }
  function deleteDeviceMacro(id: number) {
    setConfirmAction({
      title: "删除设备中的宏？",
      description: "将先检查全部设备配置的按键绑定。仍被使用的宏不会删除。",
      run: () => {
        void run("检查绑定并删除设备宏", async () => {
          for (const slot of await client().readProfileIds()) {
            const profile = await client().readProfile(slot);
            if (
              Object.values(profile.buttons).some(
                (b) =>
                  [4, 5, 6].includes(b.type) && (b.a1 | (b.a2 << 8)) === id,
              )
            )
              throw new Error(`配置 ${slot} 的按键仍在使用此宏，请先解除绑定`);
          }
          const backup = await client().readMacro(id);
          download(
            `Pulsar-macro-${id}-backup.json`,
            serializeMacros([
              {
                ...createMacro(backup.name),
                events: decodeNativeMacro(backup.data),
              },
            ]),
          );
          await client().deleteMacro(id);
          setDeviceMacros(await client().listMacros());
          setNotice({ text: "设备宏已删除，删除前的原始内容已导出备份。" });
        });
      },
    });
  }

  function exportCurrent() {
    try {
      download(`Pulsar-${current.name}.json`, exportProfileFile(current));
      setNotice({ text: "已导出当前配置。" });
    } catch (e) {
      setNotice({ text: String(e), error: true });
    }
  }
  async function importCurrent(file?: File) {
    if (!file) return;
    try {
      if (file.size > 200000) throw new Error("配置文件过大");
      const value = parseProfileFile(await file.text(), selectedProfile);
      update(() => value);
      setNotice({ text: "已导入到本地草稿。连接设备后点击“应用到鼠标”写入。" });
    } catch (e) {
      setNotice({
        text: e instanceof Error ? e.message : String(e),
        error: true,
      });
    }
  }
  function setBinding(b: ButtonBinding) {
    setProfile({ buttons: { ...p.buttons, [selectedButton]: b } });
    setCaptureKey(false);
  }
  const status = connected
    ? snapshot
      ? dirty
        ? "有待应用的更改"
        : "设备配置已同步"
      : "等待读取配置"
    : "本地编辑模式";
  const page = tabs.find((t) => t.id === tab);
  const currentStage = p.dpiStages[p.activeStage - 1];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("home");
          }}
        >
          <img
            src={`${import.meta.env.BASE_URL}assets/pulsar-logo.png`}
            alt="pulsar"
          />
          <small>
            FUSION <b>WEB</b>
          </small>
        </a>
        <div className="sidebar-caption">设备工作台</div>
        <nav>
          {tabs.map(({ id, label, english, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${tab === id ? "selected" : ""}`}
              onClick={() => setTab(id)}
            >
              <Icon size={19} />
              <span>
                {label}
                <small>{english}</small>
              </span>
              {tab === id && <ChevronRight size={15} />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${tab === "diagnostics" ? "selected" : ""}`}
            onClick={() => setTab("diagnostics")}
          >
            <Code2 size={18} />
            <span>连接诊断</span>
          </button>
          <button className="nav-item" onClick={() => setShowHelp(true)}>
            <CircleHelp size={18} />
            <span>使用帮助</span>
          </button>
          <div className="build-label">
            <span className="tiny-dot" />
            Xlite v4 · WebHID<small>基于 Fusion 1.0.5.4 功能研究</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            设备 <ChevronRight size={14} />
            <b>Xlite v4 Mini</b>
          </div>
          <div className="topbar-right">
            <span className={`connection-label ${connected ? "online" : ""}`}>
              <span />
              {connected
                ? client().productId === 0x3401
                  ? "USB 已连接"
                  : client().productId === 0x5402
                    ? "1K 接收器已连接"
                    : "8K 接收器已连接"
                : "设备未连接"}
            </span>
            {connected ? (
              <button
                className="button compact"
                disabled={!!busy}
                onClick={() =>
                  run("断开设备", async () => {
                    await client().disconnect();
                    setSnapshot(null);
                    setPowerDraft(undefined);
                    setDeviceMacros([]);
                  })
                }
              >
                <Unplug size={15} />
                断开
              </button>
            ) : (
              <button
                className="button primary compact"
                disabled={!!busy}
                onClick={connect}
              >
                <Usb size={16} />
                连接鼠标
              </button>
            )}
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">{page?.english ?? "DIAGNOSTICS"}</div>
              <h1>{page?.label ?? "连接诊断"}</h1>
              <p>
                {tab === "performance"
                  ? "从每一档 DPI 到每一次点击，让鼠标适应你的手感。"
                  : tab === "customize"
                    ? "为每个按键分配动作，建立自己的操作习惯。"
                    : tab === "macro"
                      ? "记录、编辑并整理你的操作序列。"
                      : tab === "power"
                        ? "掌握电池状态，调整休眠与低电量设置。"
                        : tab === "profiles"
                          ? "保存不同场景下的手感，随时导入与导出。"
                          : tab === "home"
                            ? "你的鼠标，你的设置。"
                            : "查看浏览器支持、设备连接与通信记录。"}
              </p>
            </div>
            <div className="page-heading-actions">
              <span className={`status-pill ${dirty ? "pending" : ""}`}>
                <span />
                {status}
              </span>
              <button
                className="icon-button"
                title="重新读取设备（放弃本地更改）"
                aria-label="重新读取设备"
                disabled={!connected || !!busy}
                onClick={refresh}
              >
                <RefreshCw size={17} />
              </button>
            </div>
          </div>
          {!isWebHidSupported() && (
            <div className="callout warning">
              <Info size={18} />
              <span>
                当前浏览器不支持设备连接。请在桌面版 Chrome 或 Edge 中通过
                localhost 或 HTTPS 打开；你仍可编辑和导出本地配置。
              </span>
            </div>
          )}
          {!connected && (
            <div className="callout">
              <Usb size={18} />
              <span>
                连接鼠标后读取真实设置。当前显示的是本地草稿，尚未写入设备。
              </span>
              <button onClick={connect} disabled={!!busy}>
                连接设备 <ChevronRight size={15} />
              </button>
            </div>
          )}
          {!!snapshot?.warnings.length && (
            <div className="callout warning">
              <Info size={18} />
              <span>{snapshot.warnings.join("；")}</span>
            </div>
          )}
          <div className="workspace" inert={!!busy} aria-busy={!!busy}>
            <div className="content-column">
              {tab === "home" && (
                <>
                  <section className="device-hero panel">
                    <div className="device-copy">
                      <span className="eyebrow">ERGONOMIC. REFINED.</span>
                      <h2>
                        Xlite v4 <span>Mini</span>
                      </h2>
                      <p>精确控制，始于你的手感。</p>
                      <div className="device-tags">
                        <span>
                          <Usb size={14} />
                          USB / 2.4 GHz
                        </span>
                        <span>XS-1 Sensor</span>
                      </div>
                      <button
                        className="button primary"
                        onClick={() => setTab("performance")}
                      >
                        调整性能 <ChevronRight size={16} />
                      </button>
                      <div className="hero-specs">
                        <div>
                          <b>32,000</b>
                          <small>最大 DPI</small>
                        </div>
                        <div>
                          <b>
                            1,000 <i>Hz</i>
                          </b>
                          <small>当前有线最高回报率</small>
                        </div>
                      </div>
                    </div>
                    <MouseFigure />
                  </section>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <Gauge size={20} />
                      <small>当前 DPI</small>
                      <strong>{currentStage.x.toLocaleString()}</strong>
                      <span>
                        第 {p.activeStage} 档 / 共 {p.dpiStages.length} 档
                      </span>
                    </div>
                    <div className="stat-card">
                      <Radio size={20} />
                      <small>回报率</small>
                      <strong>
                        {g.pollingRate}
                        <em> Hz</em>
                      </strong>
                      <span>{1000 / g.pollingRate} ms 报告间隔</span>
                    </div>
                    <div className="stat-card">
                      <BatteryCharging size={20} />
                      <small>设备电量</small>
                      <strong>
                        {snapshot?.power
                          ? `${snapshot.power.batteryPercent}%`
                          : "—"}
                      </strong>
                      <span>
                        {snapshot?.power
                          ? snapshot.power.charging
                            ? "正在充电"
                            : "使用电池"
                          : "连接后读取"}
                      </span>
                    </div>
                  </div>
                  <Panel title="快速开始" icon={Zap}>
                    <div className="quick-links">
                      {tabs.slice(1, 4).map(({ id, label, icon: Icon }) => (
                        <button key={id} onClick={() => setTab(id)}>
                          <Icon size={22} />
                          <b>{label}</b>
                          <ChevronRight size={16} />
                        </button>
                      ))}
                    </div>
                  </Panel>
                </>
              )}
              {tab === "performance" && (
                <>
                  <div className="callout">
                    <Zap size={18} />
                    <span>
                      <b>
                        {connected && snapshot
                          ? "性能设置即时生效"
                          : "连接并读取后，性能设置即时生效"}
                      </b>
                      <br />
                      DPI 档位、回报率、LOD 和传感器开关点击即生效。 DPI 数值按
                      Enter 或离开输入框时保存，消抖滑块松开时保存。
                    </span>
                  </div>
                  <Panel
                    title="DPI 灵敏度"
                    sub="点击编号切换当前档位；数值编辑完成后自动应用。"
                    icon={Gauge}
                  >
                    <div className="panel-toolbar">
                      <span className="caption">
                        DPI 档位 <b>{p.dpiStages.length} / 6</b>
                      </span>
                      <label className="check-label">
                        <input
                          type="checkbox"
                          checked={linked}
                          onChange={(e) => setLinked(e.target.checked)}
                        />
                        <Link2 size={14} />
                        关联 X / Y 轴
                      </label>
                    </div>
                    <div className="dpi-grid">
                      {p.dpiStages.map((stage, index) => (
                        <div
                          key={index}
                          className={`dpi-card ${p.activeStage === index + 1 ? "active" : ""}`}
                          style={
                            {
                              "--stage-color": rgbHex(stage.color),
                            } as CSSProperties
                          }
                        >
                          <div className="dpi-card-head">
                            <button
                              aria-label={`选择 DPI 档位 ${index + 1}`}
                              className="stage-index"
                              onClick={() =>
                                void commitImmediate(
                                  { kind: "activeStage", value: index + 1 },
                                  "DPI 档位",
                                )
                              }
                            >
                              {index + 1}
                            </button>
                            <input
                              aria-label={`档位 ${index + 1} 颜色`}
                              title="DPI 指示灯颜色"
                              type="color"
                              value={rgbHex(stage.color)}
                              onChange={(e) =>
                                setProfile({
                                  dpiStages: p.dpiStages.map((s, i) =>
                                    i === index
                                      ? { ...s, color: hexRgb(e.target.value) }
                                      : s,
                                  ),
                                })
                              }
                            />
                            {p.dpiStages.length > 1 && (
                              <button
                                className="stage-remove"
                                title="移除档位"
                                aria-label={`移除档位 ${index + 1}`}
                                onClick={() =>
                                  setProfile(
                                    {
                                      dpiStages: p.dpiStages.filter(
                                        (_, i) => i !== index,
                                      ),
                                      activeStage: Math.min(
                                        p.activeStage,
                                        p.dpiStages.length - 1,
                                      ),
                                    },
                                    true,
                                  )
                                }
                              >
                                <X size={12} />
                              </button>
                            )}
                          </div>
                          <label className="dpi-value">
                            <span>{linked ? "DPI" : "X"}</span>
                            <DpiInput
                              label={`档位 ${index + 1} X DPI`}
                              value={stage.x}
                              onChange={(x) => {
                                setProfile({
                                  dpiStages: p.dpiStages.map((s, i) =>
                                    i === index
                                      ? { ...s, x, y: linked ? x : s.y }
                                      : s,
                                  ),
                                });
                              }}
                              onCommit={(x) => {
                                void commitImmediate(
                                  {
                                    kind: "dpi",
                                    stage: index + 1,
                                    x,
                                    ...(linked ? { y: x } : {}),
                                  },
                                  `第 ${index + 1} 档 DPI`,
                                );
                              }}
                            />
                          </label>
                          {!linked && (
                            <label className="dpi-value">
                              <span>Y</span>
                              <DpiInput
                                label={`档位 ${index + 1} Y DPI`}
                                value={stage.y}
                                onChange={(y) =>
                                  setProfile({
                                    dpiStages: p.dpiStages.map((s, i) =>
                                      i === index ? { ...s, y } : s,
                                    ),
                                  })
                                }
                                onCommit={(y) =>
                                  void commitImmediate(
                                    {
                                      kind: "dpi",
                                      stage: index + 1,
                                      y,
                                    },
                                    `第 ${index + 1} 档 Y DPI`,
                                  )
                                }
                              />
                            </label>
                          )}
                          <span className="stage-caption">
                            {p.activeStage === index + 1
                              ? "当前档位"
                              : "DPI STAGE"}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="section-foot">
                      <small>
                        50 – 32,000 DPI · 步长 10 · 档位增删和颜色需点击应用
                      </small>
                      <button
                        className="text-button"
                        disabled={p.dpiStages.length >= 6}
                        onClick={() =>
                          setProfile(
                            {
                              dpiStages: [
                                ...p.dpiStages,
                                { x: 1600, y: 1600, color: [0, 132, 255] },
                              ],
                            },
                            true,
                          )
                        }
                      >
                        <Plus size={14} />
                        添加档位
                      </button>
                    </div>
                  </Panel>
                  <div className="two-columns">
                    <Panel
                      title="回报率"
                      sub="每秒向电脑报告位置的次数"
                      icon={Radio}
                    >
                      <div className="rate-options">
                        {POLLING_RATES.filter(
                          (rate) =>
                            rate <=
                            (connected ? client().maxPollingRate : 1000),
                        ).map((rate) => (
                          <button
                            key={rate}
                            className={g.pollingRate === rate ? "active" : ""}
                            onClick={() =>
                              void commitImmediate(
                                {
                                  kind: "global",
                                  field: "pollingRate",
                                  value: rate,
                                },
                                "回报率",
                              )
                            }
                          >
                            <b>{rate}</b>
                            <span>Hz</span>
                          </button>
                        ))}
                      </div>
                      <div className="rate-note">
                        <Zap size={14} />
                        <span>{1000 / g.pollingRate} ms 报告间隔</span>
                      </div>
                      <p className="hint">
                        有线和 1K 接收器支持最高 1000 Hz。8K 接收器尚未验证。
                      </p>
                    </Panel>
                    <Panel
                      title="抬起高度"
                      sub="鼠标离开表面时的停止追踪高度"
                      icon={Layers}
                    >
                      <div className="segmented lod-options">
                        {[0.7, 1, 2].map((lod) => (
                          <button
                            key={lod}
                            className={p.lod === lod ? "active" : ""}
                            onClick={() =>
                              void commitImmediate(
                                { kind: "lod", value: lod },
                                "抬起高度",
                              )
                            }
                          >
                            {lod.toFixed(1)} <small>mm</small>
                          </button>
                        ))}
                      </div>
                      <p className="hint">当前值：{p.lod.toFixed(1)} mm</p>
                      <div className="surface-illustration">
                        <span />
                        <div />
                        <b>LOD</b>
                      </div>
                    </Panel>
                  </div>
                  <div className="two-columns">
                    <Panel title="传感器设置" icon={Cpu}>
                      <Toggle
                        label="Motion Sync"
                        description="同步传感器数据与 USB 报告时序"
                        checked={g.motionSync}
                        onChange={(motionSync) =>
                          void commitImmediate(
                            {
                              kind: "global",
                              field: "motionSync",
                              value: motionSync,
                            },
                            "Motion Sync",
                          )
                        }
                      />
                      <Toggle
                        label="角度捕捉"
                        description="Angle Snapping · 修正移动轨迹"
                        checked={g.angleSnap}
                        onChange={(angleSnap) =>
                          void commitImmediate(
                            {
                              kind: "global",
                              field: "angleSnap",
                              value: angleSnap,
                            },
                            "角度捕捉",
                          )
                        }
                      />
                      <Toggle
                        label="波纹控制"
                        description="Ripple Control · 平滑传感器数据"
                        checked={g.rippleControl}
                        onChange={(rippleControl) =>
                          void commitImmediate(
                            {
                              kind: "global",
                              field: "rippleControl",
                              value: rippleControl,
                            },
                            "波纹控制",
                          )
                        }
                      />
                    </Panel>
                    <Panel
                      title="点击响应"
                      sub="调整点击去抖动的时间"
                      icon={Mouse}
                    >
                      <Range
                        label="消抖时间"
                        value={g.debounce}
                        min={0}
                        max={15}
                        unit="ms"
                        onChange={(debounce) => setGlobal({ debounce })}
                        onCommit={(debounce) =>
                          void commitImmediate(
                            {
                              kind: "global",
                              field: "debounce",
                              value: debounce,
                            },
                            "消抖时间",
                          )
                        }
                      />
                      <p className="hint">较低的时间可能增加重复点击的概率。</p>
                    </Panel>
                  </div>
                  <Panel
                    title="DPI 指示灯"
                    sub="灯光和颜色更改暂存，点击“应用到鼠标”后保存。"
                    icon={Zap}
                  >
                    <div className="led-layout">
                      <div>
                        <label className="field-label">灯光效果</label>
                        <div className="segmented">
                          {(["off", "steady", "breathe"] as const).map(
                            (effect, i) => (
                              <button
                                key={effect}
                                className={
                                  p.ledEffect === effect ? "active" : ""
                                }
                                onClick={() =>
                                  setProfile({ ledEffect: effect })
                                }
                              >
                                {["关闭", "常亮", "呼吸"][i]}
                              </button>
                            ),
                          )}
                        </div>
                      </div>
                      <Range
                        label="亮度"
                        value={Math.round((p.brightness / 255) * 100)}
                        min={0}
                        max={100}
                        unit="%"
                        onChange={(brightness) =>
                          setProfile({
                            brightness: Math.round((brightness / 100) * 255),
                          })
                        }
                      />
                      <Range
                        label="呼吸速度"
                        value={100 - Math.min(p.breatheSpeed, 100)}
                        min={0}
                        max={100}
                        onChange={(speed) =>
                          setProfile({ breatheSpeed: 100 - speed })
                        }
                      />
                    </div>
                  </Panel>
                </>
              )}
              {tab === "customize" && (
                <Panel
                  title="按键分配"
                  sub="点击鼠标上的编号，或从列表中选择按键。"
                  icon={Mouse}
                >
                  <div className="customize-layout">
                    <MouseFigure
                      selected={selectedButton}
                      onSelect={(id) => {
                        setSelectedButton(id);
                        setCaptureKey(false);
                      }}
                    />
                    <div className="button-list">
                      {BUTTON_IDS.map((id, index) => (
                        <button
                          key={id}
                          className={`binding-row ${selectedButton === id ? "active" : ""}`}
                          onClick={() => {
                            setSelectedButton(id);
                            setCaptureKey(false);
                          }}
                        >
                          <span className="binding-number">{index + 1}</span>
                          <span>
                            <b>{buttonNames[id]}</b>
                            <small>{bindingLabel(p.buttons[id])}</small>
                          </span>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="binding-editor">
                    <div>
                      <span className="eyebrow">
                        BUTTON {selectedButton === 11 ? 6 : selectedButton}
                      </span>
                      <h3>{buttonNames[selectedButton]}</h3>
                    </div>
                    <label>
                      <span className="caption">分配动作</span>
                      <select
                        aria-label="分配按键动作"
                        value={
                          BUTTON_ACTIONS.find((a) =>
                            equal(a.binding, p.buttons[selectedButton]),
                          )?.id ?? "custom"
                        }
                        onChange={(e) => {
                          if (e.target.value === "keyboard") {
                            setCaptureKey(true);
                            return;
                          }
                          if (e.target.value === "dpiLock") {
                            setBinding(dpiLockBinding(800));
                            return;
                          }
                          const action = BUTTON_ACTIONS.find(
                            (a) => a.id === e.target.value,
                          );
                          if (action) setBinding(action.binding);
                        }}
                      >
                        <option value="custom" disabled>
                          {bindingLabel(p.buttons[selectedButton])}
                        </option>
                        {BUTTON_ACTIONS.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.label}
                          </option>
                        ))}
                        <option value="keyboard">键盘按键 / 组合键…</option>
                        <option value="dpiLock">按住锁定 DPI…</option>
                      </select>
                    </label>
                    <button
                      className="button"
                      onClick={() => setCaptureKey(!captureKey)}
                    >
                      <Command size={15} />
                      录入快捷键
                    </button>
                  </div>
                  {captureKey && (
                    <div
                      className="key-capture"
                      tabIndex={0}
                      autoFocus
                      ref={(node) => node?.focus()}
                      onKeyDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const binding = keyboardBinding(e);
                        if (binding) setBinding(binding);
                      }}
                    >
                      点击此区域，然后按下一个按键或组合键。
                      <button
                        className="text-button"
                        onClick={() => setCaptureKey(false)}
                      >
                        取消
                      </button>
                    </div>
                  )}
                  {p.buttons[selectedButton].type === 9 &&
                    p.buttons[selectedButton].a1 === 7 && (
                      <div className="lock-editor">
                        <label>
                          锁定 DPI{" "}
                          <input
                            type="number"
                            aria-label="锁定 DPI"
                            min={50}
                            max={32000}
                            step={10}
                            value={lockDpi}
                            onChange={(e) => setLockDpi(Number(e.target.value))}
                          />
                        </label>
                        <button
                          className="button"
                          onClick={() => {
                            try {
                              setBinding(dpiLockBinding(lockDpi));
                            } catch (e) {
                              setNotice({ text: String(e), error: true });
                            }
                          }}
                        >
                          设置锁定值
                        </button>
                      </div>
                    )}
                  <div className="macro-assignment">
                    <label>
                      <span className="caption">设备宏</span>
                      <select
                        aria-label="分配设备宏"
                        disabled={!connected || !deviceMacros.length}
                        value={
                          p.buttons[selectedButton].type >= 4 &&
                          p.buttons[selectedButton].type <= 6
                            ? p.buttons[selectedButton].a1 |
                              (p.buttons[selectedButton].a2 << 8)
                            : ""
                        }
                        onChange={(e) => {
                          if (e.target.value)
                            setBinding(
                              macroBinding(Number(e.target.value), {
                                loopMode: macroLoop,
                                repeatCount: macroRepeat,
                              }),
                            );
                        }}
                      >
                        <option value="">选择已上传的宏…</option>
                        {deviceMacros.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span className="caption">运行方式</span>
                      <select
                        aria-label="宏运行方式"
                        value={macroLoop}
                        onChange={(e) => {
                          const loopMode = e.target.value as Macro["loopMode"];
                          setMacroLoop(loopMode);
                          const b = p.buttons[selectedButton];
                          if ([4, 5, 6].includes(b.type))
                            setBinding(
                              macroBinding(b.a1 | (b.a2 << 8), {
                                loopMode,
                                repeatCount: macroRepeat,
                              }),
                            );
                        }}
                      >
                        <option value="once">执行一次</option>
                        <option value="repeat">重复指定次数</option>
                        <option value="whilePressed">按住时循环</option>
                        <option value="toggle">再次按下停止</option>
                      </select>
                    </label>
                    {macroLoop === "repeat" && (
                      <label>
                        <span className="caption">次数</span>
                        <input
                          aria-label="宏重复次数"
                          type="number"
                          min={1}
                          max={255}
                          value={macroRepeat}
                          onChange={(e) => {
                            const n = Number(e.target.value);
                            setMacroRepeat(n);
                            const b = p.buttons[selectedButton];
                            if (
                              [4, 5, 6].includes(b.type) &&
                              n >= 1 &&
                              n <= 255
                            )
                              setBinding(
                                macroBinding(b.a1 | (b.a2 << 8), {
                                  loopMode: macroLoop,
                                  repeatCount: n,
                                }),
                              );
                          }}
                        />
                      </label>
                    )}
                  </div>
                  <p className="hint">
                    至少保留一个左键。设备宏的循环方式由按键绑定决定。修改后请应用到鼠标。
                  </p>
                </Panel>
              )}
              {tab === "macro" && (
                <MacroEditor
                  macros={macros}
                  onChange={setMacros}
                  connected={connected}
                  deviceBusy={!!busy}
                  deviceMacros={deviceMacros.map((m) => ({
                    ...m,
                    byteLength: m.size,
                  }))}
                  onRefreshDevice={refreshDeviceMacros}
                  onUpload={uploadMacro}
                  onImportDevice={importDeviceMacro}
                  onDeleteDevice={deleteDeviceMacro}
                />
              )}
              {tab === "power" && (
                <>
                  <div className="stats-grid">
                    <div className="stat-card">
                      <BatteryCharging size={20} />
                      <small>剩余电量</small>
                      <strong>
                        {snapshot?.power
                          ? `${snapshot.power.batteryPercent}%`
                          : "—"}
                      </strong>
                      <span>
                        {snapshot?.power?.charging
                          ? "USB 正在充电"
                          : "连接设备后读取"}
                      </span>
                    </div>
                    <div className="stat-card">
                      <Usb size={20} />
                      <small>连接方式</small>
                      <strong>
                        {connected
                          ? client().productId === 0x3401
                            ? "USB"
                            : "2.4G"
                          : "—"}
                      </strong>
                      <span>{connected ? "设备已连接" : "等待连接"}</span>
                    </div>
                    <div className="stat-card">
                      <Cpu size={20} />
                      <small>固件版本</small>
                      <strong className="firmware-value">
                        {snapshot?.firmwareVersion ?? "—"}
                      </strong>
                      <span>从设备读取</span>
                    </div>
                  </div>
                  <Panel
                    title="电源设置"
                    sub="应用后将保存到设备，并重新读取确认。"
                    icon={BatteryCharging}
                  >
                    {powerDraft ? (
                      <>
                        <label className="power-select">
                          <span>
                            <b>自动休眠</b>
                            <small>闲置多久后进入节能状态</small>
                          </span>
                          <select
                            aria-label="自动休眠时间"
                            value={powerDraft.sleepSeconds ?? 30}
                            onChange={(e) =>
                              setPowerDraft({
                                ...powerDraft,
                                sleepSeconds: Number(e.target.value),
                              })
                            }
                          >
                            {[
                              30,
                              ...Array.from(
                                { length: 15 },
                                (_, i) => (i + 1) * 60,
                              ),
                            ].map((seconds) => (
                              <option value={seconds} key={seconds}>
                                {seconds === 30
                                  ? "30 秒"
                                  : `${seconds / 60} 分钟`}
                              </option>
                            ))}
                          </select>
                        </label>
                        <Range
                          label="低电量模式阈值"
                          value={powerDraft.lowPowerPercent ?? 10}
                          min={5}
                          max={100}
                          step={5}
                          unit="%"
                          onChange={(lowPowerPercent) =>
                            setPowerDraft({ ...powerDraft, lowPowerPercent })
                          }
                        />
                        {client().productId === 0x5403 &&
                          powerDraft.receiverIndicator !== undefined && (
                            <label className="power-select">
                              <span>
                                <b>8K 接收器指示灯</b>
                                <small>按原版协议提供，未连接实机验证</small>
                              </span>
                              <select
                                aria-label="接收器指示灯模式"
                                value={powerDraft.receiverIndicator}
                                onChange={(e) =>
                                  setPowerDraft({
                                    ...powerDraft,
                                    receiverIndicator: Number(
                                      e.target.value,
                                    ) as 1 | 2,
                                  })
                                }
                              >
                                <option value={1}>显示连接状态</option>
                                <option value={2}>仅低电量提醒</option>
                              </select>
                            </label>
                          )}
                      </>
                    ) : (
                      <div className="empty-state">
                        <BatteryCharging size={32} />
                        <p>连接并读取设备后，可调整休眠与低电量设置。</p>
                      </div>
                    )}
                  </Panel>
                  <Panel title="固件" icon={Cpu}>
                    <p className="hint">
                      当前版本：{snapshot?.firmwareVersion ?? "连接后读取"}
                      。升级涉及引导加载器和独立固件包，本版本暂不提供刷写。
                    </p>
                    <a
                      className="text-button"
                      href="https://www.pulsar.gg/pages/download"
                      target="_blank"
                      rel="noreferrer"
                    >
                      打开 Pulsar 官方下载页面 <ChevronRight size={14} />
                    </a>
                  </Panel>
                </>
              )}

              {tab === "profiles" && (
                <>
                  <Panel
                    title="配置库"
                    sub="连接后选择配置会切换鼠标的活动槽位，并读取对应设置。"
                    icon={Layers}
                  >
                    <div className="profile-grid">
                      {profiles.map((item, index) => (
                        <button
                          key={index}
                          className={`profile-tile ${selectedProfile === index + 1 ? "active" : ""}`}
                          disabled={!!busy}
                          onClick={() => chooseProfile(index + 1)}
                        >
                          <div>
                            <Layers size={22} />
                            {selectedProfile === index + 1 && (
                              <Check size={17} />
                            )}
                          </div>
                          <b>{item.name}</b>
                          <span>
                            {item.profile.dpiStages.map((s) => s.x).join(" / ")}{" "}
                            DPI
                          </span>
                          <small>
                            {item.global.pollingRate} Hz ·{" "}
                            {item.profile.dpiStages.length} 档
                          </small>
                        </button>
                      ))}
                    </div>
                  </Panel>
                  <Panel
                    title="导入与导出"
                    sub="使用 Web 版 JSON 配置格式，保留完整按键、DPI、灯光与传感器设置。"
                    icon={Save}
                  >
                    <label className="profile-name">
                      配置名称
                      <input
                        value={current.name}
                        maxLength={80}
                        onChange={(e) =>
                          update((v) => ({ ...v, name: e.target.value }))
                        }
                      />
                    </label>
                    <div className="button-group">
                      <button
                        className="button"
                        onClick={() => importRef.current?.click()}
                      >
                        <ArrowUpFromLine size={16} />
                        导入配置
                      </button>
                      <button
                        className="button primary"
                        onClick={exportCurrent}
                      >
                        <ArrowDownToLine size={16} />
                        导出配置
                      </button>
                    </div>
                    <p className="hint">
                      配置 JSON 为 Web 版格式；原版宏 CSV
                      请在宏编辑器导入。导入配置后需应用才会写入设备。
                    </p>
                  </Panel>
                  <Panel
                    title="设备恢复"
                    sub="直接恢复设备设置。执行前请导出需要保留的配置。"
                    icon={RotateCcw}
                  >
                    <div className="button-group">
                      <button
                        className="button"
                        disabled={!connected || !snapshot}
                        onClick={() =>
                          setConfirmAction({
                            title: "恢复当前设备配置？",
                            description:
                              "将恢复当前槽位及关联性能参数。当前配置会先导出备份；其他槽位不作为本次恢复目标。",
                            run: () => {
                              void run("恢复设备配置", async () => {
                                if (!snapshot) return;
                                download(
                                  `Pulsar-profile-${selectedProfile}-backup.json`,
                                  exportProfileFile({
                                    ...current,
                                    global: snapshot.global,
                                    profile: snapshot.profile,
                                  }),
                                );
                                const restored =
                                  await client().resetProfile(selectedProfile);
                                applySnapshot(restored, selectedProfile);
                                setNotice({
                                  text: "设备配置已恢复并重新读取。",
                                });
                              });
                            },
                          })
                        }
                      >
                        <RotateCcw size={16} />
                        恢复当前配置
                      </button>
                      <button
                        className="button danger"
                        disabled={!connected}
                        onClick={() =>
                          setConfirmAction({
                            title: "将鼠标恢复出厂设置？",
                            description:
                              "此操作会清除设备内的自定义设置，并断开连接。请先导出所有需要的配置及宏。恢复命令来自原程序，尚未在这只鼠标上执行测试。",
                            run: () => {
                              void run("发送出厂恢复命令", async () => {
                                await client().requestFactoryReset();
                                setSnapshot(null);
                                setDeviceMacros([]);
                                setNotice({
                                  text: "出厂恢复命令已发送。设备已断开，请重新连接并检查实际状态。",
                                });
                              });
                            },
                          })
                        }
                      >
                        恢复出厂设置
                      </button>
                    </div>
                  </Panel>
                </>
              )}
              {tab === "diagnostics" && (
                <>
                  <Panel title="连接状态" icon={Usb}>
                    <dl className="diagnostic-grid">
                      <div>
                        <dt>WebHID</dt>
                        <dd>{isWebHidSupported() ? "支持" : "不可用"}</dd>
                      </div>
                      <div>
                        <dt>安全上下文</dt>
                        <dd>{globalThis.isSecureContext ? "是" : "否"}</dd>
                      </div>
                      <div>
                        <dt>设备</dt>
                        <dd>{connected ? client().name : "未连接"}</dd>
                      </div>
                      <div>
                        <dt>VID : PID</dt>
                        <dd>
                          {connected
                            ? `3710 : ${client().productId?.toString(16)}`
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>配置通道</dt>
                        <dd>Feature Report 0 · 64 bytes</dd>
                      </div>
                      <div>
                        <dt>验证方式</dt>
                        <dd>报文校验 + 写入后回读</dd>
                      </div>
                    </dl>
                    <p className="hint">
                      1K
                      接收器先被动检查报告长度，再通过新的只读查询确认配置通道和配对型号。
                      若连接失败，请关闭其他配置网页或软件，重新插拔接收器后重试。
                    </p>
                  </Panel>
                  <Panel
                    title="最近一次连接尝试"
                    sub="按浏览器返回的候选通道编号，便于定位失败阶段。"
                    icon={Activity}
                  >
                    <ol className="connection-attempts">
                      {(clientRef.current?.connectionAttempts ?? []).map(
                        (attempt) => (
                          <li key={attempt.candidate}>
                            <div>
                              <b>
                                通道 {attempt.candidate} · {attempt.productName}
                              </b>
                              <span>
                                {connectionPhaseLabels[attempt.phase]}
                                {attempt.probeLength === undefined
                                  ? ""
                                  : ` · ${attempt.probeLength} 字节`}
                              </span>
                            </div>
                            {attempt.error && (
                              <p>
                                {attempt.errorName
                                  ? `${attempt.errorName}: `
                                  : ""}
                                {attempt.error}
                              </p>
                            )}
                          </li>
                        ),
                      )}
                    </ol>
                    {!clientRef.current?.connectionAttempts.length && (
                      <p className="hint">
                        连接设备后，这里会保留每个候选通道的结果；连接失败也可导出诊断。
                      </p>
                    )}
                  </Panel>
                  <Panel title="功能验证状态" icon={ShieldCheck}>
                    <div className="capability-row">
                      <span>
                        DPI、回报率、消抖、LOD、传感器开关、按键、灯光
                      </span>
                      <b className="positive">已实机读取</b>
                    </div>
                    <div className="capability-row">
                      <span>写入设置</span>
                      <b>每次写入后回读验证</b>
                    </div>
                    <div className="capability-row">
                      <span>宏录制、编辑、设备上传与按键绑定</span>
                      <b>源程序协议已恢复</b>
                    </div>
                    <div className="capability-row">
                      <span>固件升级、宏移动轨迹和实时无线信号</span>
                      <b className="pending-text">尚未实现</b>
                    </div>
                    <div className="capability-row">
                      <span>Windows 指针速度、开机启动、系统托盘</span>
                      <b>浏览器不提供系统控制</b>
                    </div>
                  </Panel>
                  <Panel
                    title="通信记录"
                    sub="仅记录本页与鼠标的配置报文，不记录日常键鼠输入。"
                    icon={Activity}
                  >
                    <div className="section-foot">
                      <small>
                        {clientRef.current?.logs.length ?? 0} 条 · 最近 300 条
                      </small>
                      <button
                        className="text-button"
                        onClick={() =>
                          download(
                            "pulsar-diagnostics.json",
                            JSON.stringify(
                              {
                                device: clientRef.current?.name,
                                browser: navigator.userAgent,
                                page: `${location.origin}${location.pathname}`,
                                connectionAttempts:
                                  clientRef.current?.connectionAttempts ?? [],
                                logs: clientRef.current?.logs ?? [],
                              },
                              null,
                              2,
                            ),
                          )
                        }
                      >
                        <ArrowDownToLine size={14} />
                        导出诊断
                      </button>
                    </div>
                    <div className="protocol-log" data-version={logVersion}>
                      {(clientRef.current?.logs ?? [])
                        .slice(-15)
                        .reverse()
                        .map((entry: ProtocolLog, index) => (
                          <div key={`${entry.time}-${index}`}>
                            <time>{entry.time.slice(11, 23)}</time>
                            <b
                              className={
                                entry.direction === "in" ? "positive" : ""
                              }
                            >
                              {entry.direction === "in" ? "RX" : "TX"}
                            </b>
                            <code>
                              {entry.bytes
                                .slice(0, 16)
                                .map((b) => b.toString(16).padStart(2, "0"))
                                .join(" ")}{" "}
                              …
                            </code>
                          </div>
                        ))}
                      {!clientRef.current?.logs.length && (
                        <p>连接鼠标后，通信记录会显示在这里。</p>
                      )}
                    </div>
                  </Panel>
                </>
              )}
            </div>
            <aside className="device-sidebar">
              <div className="device-card">
                <div className="device-card-heading">
                  <span className="device-icon">
                    <Mouse size={23} />
                  </span>
                  <span>
                    <b>Xlite v4 Mini</b>
                    <small>
                      {connected
                        ? client().productId === 0x3401
                          ? "Pulsar · USB"
                          : "Pulsar · 2.4 GHz"
                        : "Pulsar · 未连接"}
                    </small>
                  </span>
                  <span className={`device-dot ${connected ? "online" : ""}`} />
                </div>
                <div className="device-battery">
                  <span>
                    <BatteryCharging size={15} />
                    {snapshot?.power
                      ? snapshot.power.charging
                        ? "正在充电"
                        : "剩余电量"
                      : "设备电量"}
                  </span>
                  <b>
                    {snapshot?.power
                      ? `${snapshot.power.batteryPercent}%`
                      : "—"}
                  </b>
                </div>
                <div className="battery-track">
                  <span
                    style={{
                      width: `${snapshot?.power?.batteryPercent ?? 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="profile-selector">
                <label className="eyebrow">当前配置</label>
                <select
                  aria-label="当前配置"
                  value={selectedProfile}
                  disabled={!!busy}
                  onChange={(e) => chooseProfile(Number(e.target.value))}
                >
                  {profiles.map((v, i) => (
                    <option key={i} value={i + 1}>
                      {v.name}
                    </option>
                  ))}
                </select>
                <p>连接后选择配置会切换设备槽位。未连接时仅编辑本地草稿。</p>
                <div className="profile-actions">
                  <button
                    title="导入配置"
                    onClick={() => importRef.current?.click()}
                  >
                    <ArrowUpFromLine size={15} />
                    导入
                  </button>
                  <button title="导出配置" onClick={exportCurrent}>
                    <ArrowDownToLine size={15} />
                    导出
                  </button>
                </div>
              </div>
              <div className="sidebar-note">
                <ShieldCheck size={20} />
                <b>设置直接写入设备</b>
                <p>
                  Chrome / Edge 通过 WebHID
                  连接。配置保留在本机浏览器，无需账号。
                </p>
              </div>
              <button
                className="reset-button"
                onClick={() => {
                  update((v) => ({
                    ...v,
                    dpiLayoutPending: true,
                    global: defaultGlobal(),
                    profile: defaultProfile(selectedProfile),
                  }));
                  setNotice({
                    text: "已将本地草稿恢复为默认值。尚未修改鼠标。",
                  });
                }}
              >
                <RotateCcw size={14} />
                恢复草稿默认值
              </button>
              <div className="reference-version">
                FUSION WEB <span>0.1</span>
                <p>
                  非官方 Web 实现
                  <br />
                  专为 Xlite v4 Mini 适配
                </p>
              </div>
            </aside>
          </div>
        </main>
        <footer className="savebar">
          <div>
            <span className={`save-status ${dirty ? "dirty" : ""}`}>
              <span />
              {busy ||
                (connected
                  ? dirty
                    ? "更改尚未应用"
                    : snapshot
                      ? "设备配置已同步"
                      : "请重新读取设备"
                  : "设置已保存在此浏览器")}
            </span>
            <small>
              {connected
                ? "性能调整即时生效；按键、灯光、电源和导入等更改需点击应用。"
                : "离线编辑仅存为草稿，连接后不会自动写入。"}
            </small>
          </div>
          <div className="button-group">
            <button
              className="button"
              disabled={!connected || !!busy}
              onClick={refresh}
            >
              <RotateCcw size={15} />
              重新读取
            </button>
            <button
              className="button primary"
              disabled={!connected || !snapshot || !dirty || !!busy}
              onClick={save}
            >
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : (
                <Check size={16} />
              )}
              应用到鼠标
            </button>
          </div>
        </footer>
      </div>
      <input
        ref={importRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={(e) => {
          void importCurrent(e.target.files?.[0]);
          e.currentTarget.value = "";
        }}
      />
      {notice && (
        <div className={`toast ${notice.error ? "error" : ""}`} role="status">
          {notice.error ? <Info size={19} /> : <Check size={19} />}
          <span>{notice.text}</span>
          <button aria-label="关闭提示" onClick={() => setNotice(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {confirmAction && (
        <div className="modal-backdrop">
          <section className="help-dialog" role="dialog" aria-modal="true">
            <h2>{confirmAction.title}</h2>
            <p>{confirmAction.description}</p>
            <div className="button-group">
              <button className="button" onClick={() => setConfirmAction(null)}>
                取消
              </button>
              <button
                className="button primary"
                onClick={() => {
                  const action = confirmAction;
                  setConfirmAction(null);
                  action.run();
                }}
              >
                确认
              </button>
            </div>
          </section>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="help-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="使用帮助"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="icon-button close-dialog"
              aria-label="关闭帮助"
              onClick={() => setShowHelp(false)}
            >
              <X size={20} />
            </button>
            <span className="eyebrow">GET CONNECTED</span>
            <h2>开始配置你的 Xlite v4</h2>
            <ol>
              <li>
                用 USB
                线连接鼠标，或插入无线接收器并开启鼠标，确认能无线移动光标。
              </li>
              <li>在桌面 Chrome / Edge 打开本页，点击“连接鼠标”。</li>
              <li>
                在浏览器选择器中选择 Xlite v4；使用 1K 接收器时选择“1K
                Dongle”，允许访问。
              </li>
              <li>性能调整即时生效；DPI 数值完成输入、消抖滑块松开后保存。</li>
              <li>
                按键、灯光、电源、档位增删和导入草稿需点击“应用到鼠标”；宏需点击上传。
              </li>
            </ol>
            <div className="callout">
              <Info size={18} />
              <span>
                支持配置切换与宏上传。固件升级、宏移动轨迹和实时无线信号尚未实现；浏览器无法修改
                Windows 系统设置。
              </span>
            </div>
            <p>
              不依赖 Windows 驱动。所有设备设置均通过 USB HID
              配置接口发送，失败会明确显示，不会当作保存成功。
            </p>
            <button
              className="button primary"
              onClick={() => setShowHelp(false)}
            >
              知道了
            </button>
          </section>
        </div>
      )}
    </div>
  );
}
