import { t } from "./i18n";
import { useLocale } from "./use-locale";
import { importFusionCsv, exportFusionCsv } from "./native-files";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Download,
  Keyboard,
  Mouse,
  Plus,
  RefreshCw,
  Square,
  Timer,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createMacro,
  describeMacroEvent,
  MACRO_LIMITS,
  macroDurationMs,
  moveMacroEvent,
  parseMacros,
  serializeMacros,
  validateMacroEvent,
} from "./macros";
import type { Macro, MacroEvent, MacroLoopMode } from "./macros";
import "./macro.css";

export interface MacroEditorProps {
  macros: Macro[];
  onChange: (macros: Macro[]) => void;
  connected?: boolean;
  deviceBusy?: boolean;
  deviceMacros?: { id: number; name: string; byteLength?: number }[];
  onRefreshDevice?: () => void;
  onUpload?: (macro: Macro) => void;
  onImportDevice?: (id: number) => void;
  onDeleteDevice?: (id: number) => void;
}

export function MacroEditor({
  macros,
  onChange,
  connected = false,
  deviceBusy = false,
  deviceMacros = [],
  onRefreshDevice,
  onUpload,
  onImportDevice,
  onDeleteDevice,
}: MacroEditorProps) {
  useLocale();
  const [selectedId, setSelectedId] = useState(macros[0]?.id ?? "");
  const [recording, setRecording] = useState(false);
  const [recordDelays, setRecordDelays] = useState(true);
  const [message, setMessage] = useState("");
  const [eventKind, setEventKind] = useState<
    "key" | "mouse" | "wheel" | "delay"
  >("key");
  const [keyCode, setKeyCode] = useState("KeyA");
  const [eventAction, setEventAction] = useState<"down" | "up">("down");
  const [mouseButton, setMouseButton] = useState(0);
  const [wheelDirection, setWheelDirection] = useState<"up" | "down">("up");
  const [delay, setDelay] = useState(100);
  const captureRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const macrosRef = useRef(macros);
  const callbackRef = useRef(onChange);
  const activeRef = useRef<string | null>(null);
  const lastEventTime = useRef<number | null>(null);
  const held = useRef(
    new Map<string, Extract<MacroEvent, { type: "key" | "mouse" }>>(),
  );
  macrosRef.current = macros;
  callbackRef.current = onChange;
  const selected = macros.find((macro) => macro.id === selectedId) ?? macros[0];

  function commit(next: Macro[]) {
    macrosRef.current = next;
    callbackRef.current(next);
  }

  function updateSelected(patch: Partial<Macro>) {
    if (!selected) return;
    commit(
      macrosRef.current.map((macro) =>
        macro.id === selected.id ? { ...macro, ...patch } : macro,
      ),
    );
  }

  function appendRecorded(events: MacroEvent[]) {
    const id = activeRef.current;
    if (!id) return;
    commit(
      macrosRef.current.map((macro) =>
        macro.id === id
          ? { ...macro, events: [...macro.events, ...events] }
          : macro,
      ),
    );
  }

  function finishRecording() {
    if (!activeRef.current) return;
    // Releasing held inputs keeps recordings usable when focus leaves the capture area.
    const releases: MacroEvent[] = [...held.current.values()].map((event) => ({
      ...event,
      action: "up",
    }));
    const macro = macrosRef.current.find(
      (item) => item.id === activeRef.current,
    );
    if (
      releases.length &&
      recordDelays &&
      lastEventTime.current !== null &&
      macro &&
      macro.events.length + releases.length < MACRO_LIMITS.events
    ) {
      releases.unshift({
        type: "delay",
        durationMs: Math.min(
          MACRO_LIMITS.delayMs,
          Math.max(0, Math.round(performance.now() - lastEventTime.current)),
        ),
      });
    }
    appendRecorded(releases);
    held.current.clear();
    lastEventTime.current = null;
    activeRef.current = null;
    setRecording(false);
  }

  useEffect(
    () => () => {
      const id = activeRef.current;
      if (id && held.current.size) {
        const releases: MacroEvent[] = [...held.current.values()].map(
          (event) => ({ ...event, action: "up" }),
        );
        callbackRef.current(
          macrosRef.current.map((macro) =>
            macro.id === id
              ? { ...macro, events: [...macro.events, ...releases] }
              : macro,
          ),
        );
      }
      activeRef.current = null;
    },
    [],
  );

  function recordInput(
    event: Exclude<MacroEvent, { type: "delay" }>,
    token: string,
  ) {
    if (!activeRef.current) return;
    if (
      event.type !== "wheel" &&
      event.action === "up" &&
      !held.current.has(token)
    )
      return;
    if (
      event.type !== "wheel" &&
      event.action === "down" &&
      held.current.has(token)
    )
      return;
    const macro = macrosRef.current.find(
      (item) => item.id === activeRef.current,
    );
    if (!macro) return;
    const now = performance.now();
    const additions: MacroEvent[] = [];
    if (recordDelays && lastEventTime.current !== null) {
      additions.push({
        type: "delay",
        durationMs: Math.min(
          MACRO_LIMITS.delayMs,
          Math.max(0, Math.round(now - lastEventTime.current)),
        ),
      });
    }
    additions.push(event);
    // Reserve an up event for every held input before accepting a new event.
    const reserved =
      held.current.size +
      (event.type === "wheel" ? 0 : event.action === "down" ? 1 : -1);
    if (
      macro.events.length + additions.length + reserved >
      MACRO_LIMITS.events
    ) {
      finishRecording();
      setMessage(
        t`已达到 ${MACRO_LIMITS.events} 个事件的本地上限，录制已停止。`,
      );
      return;
    }
    if (event.type !== "wheel")
      event.action === "down"
        ? held.current.set(token, event)
        : held.current.delete(token);
    appendRecorded(additions);
    lastEventTime.current = now;
  }

  function startRecording() {
    if (!selected) return;
    activeRef.current = selected.id;
    held.current.clear();
    lastEventTime.current = null;
    setMessage("");
    setRecording(true);
    captureRef.current?.focus();
  }

  function addMacro() {
    if (macros.length >= MACRO_LIMITS.macros) return;
    const macro = createMacro(t`宏 ${macros.length + 1}`);
    commit([...macrosRef.current, macro]);
    setSelectedId(macro.id);
    setMessage("");
  }

  function addEvent() {
    if (!selected) return;
    try {
      const event = validateMacroEvent(
        eventKind === "key"
          ? { type: "key", code: keyCode, action: eventAction }
          : eventKind === "mouse"
            ? { type: "mouse", button: mouseButton, action: eventAction }
            : eventKind === "wheel"
              ? { type: "wheel", direction: wheelDirection }
              : { type: "delay", durationMs: delay },
      );
      if (selected.events.length >= MACRO_LIMITS.events)
        throw new Error(t("已达到本地事件数量上限。"));
      updateSelected({ events: [...selected.events, event] });
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("无法添加事件。"));
    }
  }

  async function importFile(file?: File) {
    if (!file) return;
    try {
      if (file.size > MACRO_LIMITS.fileBytes)
        throw new Error(t("宏文件超过 2 MB，无法导入。"));
      const contents = await file.text();
      const imported = (
        file.name.toLowerCase().endsWith(".csv")
          ? [importFusionCsv(contents, file.name)]
          : parseMacros(contents)
      ).map((macro) => ({ ...macro, id: crypto.randomUUID() }));
      if (macrosRef.current.length + imported.length > MACRO_LIMITS.macros)
        throw new Error(t("导入后超过 128 个本地宏，请先删除部分宏。"));
      commit([...macrosRef.current, ...imported]);
      if (imported[0]) setSelectedId(imported[0].id);
      setMessage(t`已导入 ${imported.length} 个本地宏。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("导入失败。"));
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function exportFile() {
    try {
      const url = URL.createObjectURL(
        new Blob([serializeMacros(macros)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "pulsar-local-macros.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage(t("已导出本地宏。"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t("导出失败。"));
    }
  }

  return (
    <section className="macro-editor" aria-label={t("宏编辑器")}>
      <div className="macro-toolbar">
        <div>
          <h2>
            {t("宏编辑器")} <span className="macro-badge">{t("本地编辑")}</span>
          </h2>
          <p>
            {t(
              "录制、编辑与导出按键序列。上传为设备宏后，可在自定义页面绑定鼠标按键。",
            )}
          </p>
        </div>
        <div className="macro-toolbar-actions">
          <button
            type="button"
            disabled={recording}
            onClick={() => fileRef.current?.click()}
          >
            <Upload size={15} />
            {t("导入")}
          </button>
          <button
            type="button"
            disabled={recording || !macros.length}
            onClick={exportFile}
          >
            <Download size={15} />
            {t("导出全部")}
          </button>
          <button
            type="button"
            disabled={recording || !selected?.events.length}
            onClick={() => {
              try {
                if (!selected) return;
                const url = URL.createObjectURL(
                  new Blob([exportFusionCsv(selected)], {
                    type: "text/csv;charset=utf-8",
                  }),
                );
                const a = document.createElement("a");
                a.href = url;
                a.download = `${selected.name}.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                setMessage(t("已导出原版 Fusion CSV 宏。"));
              } catch (error) {
                setMessage(
                  error instanceof Error ? error.message : String(error),
                );
              }
            }}
          >
            <Download size={15} />
            {t("原版 CSV")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,.csv,application/json,text/csv"
            hidden
            onChange={(event) => void importFile(event.target.files?.[0])}
          />
        </div>
      </div>
      {message && (
        <p role="status" className="macro-message">
          {message}
        </p>
      )}
      <div className="macro-workspace">
        <aside className="macro-library">
          <div className="macro-library-title">
            <span>
              {t("本地宏")} <small>{macros.length}</small>
            </span>
            <button
              type="button"
              className="macro-icon"
              aria-label={t("新建宏")}
              disabled={recording || macros.length >= MACRO_LIMITS.macros}
              onClick={addMacro}
            >
              <Plus size={17} />
            </button>
          </div>
          <div className="macro-list">
            {macros.map((macro) => (
              <button
                type="button"
                key={macro.id}
                className={`macro-list-item ${selected?.id === macro.id ? "is-selected" : ""}`}
                disabled={recording}
                onClick={() => setSelectedId(macro.id)}
              >
                <Keyboard size={16} />
                <span>
                  {macro.name}
                  <small>{t`${macro.events.length} 个事件`}</small>
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="macro-new"
            disabled={recording || macros.length >= MACRO_LIMITS.macros}
            onClick={addMacro}
          >
            <Plus size={16} />
            {t("新建宏")}
          </button>
          <div className="macro-device-library">
            <div className="macro-library-title">
              <span>
                {t("设备宏")}{" "}
                <small>{connected ? deviceMacros.length : "—"}</small>
              </span>
              <button
                type="button"
                className="macro-icon"
                aria-label={t("刷新设备宏")}
                title={t("刷新设备宏")}
                disabled={
                  !connected || deviceBusy || recording || !onRefreshDevice
                }
                onClick={onRefreshDevice}
              >
                <RefreshCw
                  size={15}
                  className={deviceBusy ? "macro-spinning" : ""}
                />
              </button>
            </div>
            {!connected ? (
              <p className="macro-device-note">
                {t("连接鼠标后读取设备中的宏。")}
              </p>
            ) : deviceBusy ? (
              <p className="macro-device-note" role="status">
                {t("正在同步设备宏…")}
              </p>
            ) : !deviceMacros.length ? (
              <p className="macro-device-note">
                {t("暂无已读取的设备宏。点击刷新，或上传本地宏。")}
              </p>
            ) : (
              <div className="macro-device-list">
                {deviceMacros.map((macro) => (
                  <div key={macro.id} className="macro-device-item">
                    <div>
                      <span>{macro.name}</span>
                      <small>
                        ID {macro.id}
                        {macro.byteLength !== undefined
                          ? ` · ${macro.byteLength} B`
                          : ""}
                      </small>
                    </div>
                    <button
                      type="button"
                      className="macro-icon"
                      aria-label={t`导入设备宏 ${macro.name}`}
                      title={t("导入到本地编辑")}
                      disabled={recording || deviceBusy || !onImportDevice}
                      onClick={() => onImportDevice?.(macro.id)}
                    >
                      <Download size={14} />
                    </button>
                    <button
                      type="button"
                      className="macro-icon"
                      aria-label={t`删除设备宏 ${macro.name}`}
                      title={t("删除设备宏")}
                      disabled={recording || deviceBusy || !onDeleteDevice}
                      onClick={() => onDeleteDevice?.(macro.id)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
        {selected ? (
          <div className="macro-detail">
            <div className="macro-detail-heading">
              <label>
                {t("宏名称")}
                <input
                  maxLength={64}
                  value={selected.name}
                  disabled={recording}
                  onChange={(event) =>
                    updateSelected({ name: event.target.value })
                  }
                  onBlur={() => {
                    if (!selected.name.trim())
                      updateSelected({ name: t("未命名宏") });
                  }}
                />
              </label>
              <button
                type="button"
                className="macro-icon"
                aria-label={t("删除当前宏")}
                disabled={recording}
                onClick={() => {
                  commit(
                    macrosRef.current.filter(
                      (macro) => macro.id !== selected.id,
                    ),
                  );
                  setSelectedId("");
                }}
              >
                <Trash2 size={17} />
              </button>
            </div>
            <div className="macro-device-upload">
              <span>
                {t("设备宏名称最多 25 字符；转换为设备宏后最多 1000 个事件。")}
              </span>
              <button
                type="button"
                className="macro-primary"
                disabled={
                  !connected ||
                  deviceBusy ||
                  recording ||
                  !onUpload ||
                  !selected.events.length ||
                  !selected.name.trim() ||
                  selected.name.length > 25
                }
                onClick={() => onUpload?.(selected)}
              >
                <Upload size={14} />
                {t("上传为新设备宏")}
              </button>
            </div>
            <div className="macro-options">
              <label>
                {t("循环方式")}
                <select
                  value={selected.loopMode}
                  disabled={recording}
                  onChange={(event) =>
                    updateSelected({
                      loopMode: event.target.value as MacroLoopMode,
                    })
                  }
                >
                  <option value="once">{t("执行一次")}</option>
                  <option value="repeat">{t("指定次数")}</option>
                  <option value="whilePressed">{t("按住时循环")}</option>
                  <option value="toggle">{t("再次按键停止")}</option>
                </select>
              </label>
              {selected.loopMode === "repeat" && (
                <label>
                  {t("重复次数")}
                  <input
                    type="number"
                    min={1}
                    max={MACRO_LIMITS.repeatCount}
                    value={selected.repeatCount}
                    disabled={recording}
                    onChange={(event) =>
                      updateSelected({
                        repeatCount: Math.min(
                          MACRO_LIMITS.repeatCount,
                          Math.max(
                            1,
                            Math.round(Number(event.target.value) || 1),
                          ),
                        ),
                      })
                    }
                  />
                </label>
              )}
              <label className="macro-check">
                <input
                  type="checkbox"
                  checked={recordDelays}
                  disabled={recording}
                  onChange={(event) => setRecordDelays(event.target.checked)}
                />
                {t("记录按键间隔")}
              </label>
            </div>
            <div
              className={`macro-capture ${recording ? "is-recording" : ""}`}
              ref={captureRef}
              tabIndex={0}
              aria-label={t("宏录制区域")}
              onBlur={finishRecording}
              onKeyDown={(event) => {
                if (!recording) return;
                event.preventDefault();
                if (
                  !event.repeat &&
                  event.code &&
                  event.code !== "Unidentified"
                )
                  recordInput(
                    { type: "key", code: event.code, action: "down" },
                    `key:${event.code}`,
                  );
              }}
              onKeyUp={(event) => {
                if (!recording) return;
                event.preventDefault();
                if (event.code)
                  recordInput(
                    { type: "key", code: event.code, action: "up" },
                    `key:${event.code}`,
                  );
              }}
              onMouseDown={(event) => {
                if (!recording || event.button > 4) return;
                event.preventDefault();
                recordInput(
                  { type: "mouse", button: event.button, action: "down" },
                  `mouse:${event.button}`,
                );
              }}
              onMouseUp={(event) => {
                if (!recording || event.button > 4) return;
                event.preventDefault();
                recordInput(
                  { type: "mouse", button: event.button, action: "up" },
                  `mouse:${event.button}`,
                );
              }}
              onWheel={(event) => {
                if (recording && event.deltaY !== 0)
                  recordInput(
                    {
                      type: "wheel",
                      direction: event.deltaY < 0 ? "up" : "down",
                    },
                    "wheel",
                  );
              }}
              onAuxClick={(event) => {
                if (recording) event.preventDefault();
              }}
              onContextMenu={(event) => {
                if (recording) event.preventDefault();
              }}
            >
              {recording ? (
                <>
                  <span className="macro-record-dot" />
                  {t("正在录制 · 在此区域按键或点击鼠标，离开区域即停止")}
                </>
              ) : (
                <>
                  <Keyboard size={18} />
                  {t("点击「开始录制」，在此区域输入按键")}
                </>
              )}
            </div>
            <div className="macro-record-controls">
              <button
                type="button"
                className={recording ? "macro-stop" : "macro-primary"}
                onClick={recording ? finishRecording : startRecording}
              >
                {recording ? <Square size={15} /> : <Circle size={15} />}
                {recording ? t("停止录制") : t("开始录制")}
              </button>
              <span>
                {t`${selected.events.length} 个事件 · ${(macroDurationMs(selected) / 1000).toFixed(2)} 秒`}
              </span>
              <button
                type="button"
                disabled={recording || !selected.events.length}
                onClick={() => updateSelected({ events: [] })}
              >
                {t("清空事件")}
              </button>
              <button
                type="button"
                disabled={
                  recording ||
                  !selected.events.some((event) => event.type === "delay")
                }
                onClick={() =>
                  updateSelected({
                    events: selected.events.filter(
                      (event) => event.type !== "delay",
                    ),
                  })
                }
              >
                {t("清除延迟")}
              </button>
            </div>
            <div className="macro-events" aria-label={t("宏事件列表")}>
              {!selected.events.length ? (
                <div className="macro-events-empty">
                  <Keyboard size={26} />
                  <span>{t("暂无事件")}</span>
                  <small>{t("开始录制，或在下方手动添加")}</small>
                </div>
              ) : (
                selected.events.map((event, index) => (
                  <div
                    className={`macro-event macro-event-${event.type}`}
                    key={`${index}-${event.type}`}
                  >
                    <span className="macro-event-index">{index + 1}</span>
                    {event.type === "delay" ? (
                      <Timer size={15} />
                    ) : event.type === "mouse" || event.type === "wheel" ? (
                      <Mouse size={15} />
                    ) : (
                      <Keyboard size={15} />
                    )}
                    <span className="macro-event-label">
                      {event.type === "delay" ? (
                        <label>
                          {t("等待")}{" "}
                          <input
                            aria-label={t`事件 ${index + 1} 延迟毫秒`}
                            type="number"
                            min={0}
                            max={MACRO_LIMITS.delayMs}
                            disabled={recording}
                            value={event.durationMs}
                            onChange={(change) =>
                              updateSelected({
                                events: selected.events.map((item, current) =>
                                  current === index
                                    ? {
                                        type: "delay",
                                        durationMs: Math.max(
                                          0,
                                          Math.min(
                                            MACRO_LIMITS.delayMs,
                                            Math.round(
                                              Number(change.target.value) || 0,
                                            ),
                                          ),
                                        ),
                                      }
                                    : item,
                                ),
                              })
                            }
                          />{" "}
                          ms
                        </label>
                      ) : (
                        describeMacroEvent(event)
                      )}
                    </span>
                    <button
                      type="button"
                      className="macro-icon"
                      aria-label={t`上移事件 ${index + 1}`}
                      disabled={recording || index === 0}
                      onClick={() =>
                        updateSelected({
                          events: moveMacroEvent(selected.events, index, -1),
                        })
                      }
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="macro-icon"
                      aria-label={t`下移事件 ${index + 1}`}
                      disabled={
                        recording || index === selected.events.length - 1
                      }
                      onClick={() =>
                        updateSelected({
                          events: moveMacroEvent(selected.events, index, 1),
                        })
                      }
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="macro-icon"
                      aria-label={t`删除事件 ${index + 1}`}
                      disabled={recording}
                      onClick={() =>
                        updateSelected({
                          events: selected.events.filter(
                            (_, current) => current !== index,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="macro-add-event">
              <select
                aria-label={t("添加事件类型")}
                disabled={recording}
                value={eventKind}
                onChange={(event) =>
                  setEventKind(event.target.value as typeof eventKind)
                }
              >
                <option value="key">{t("键盘按键")}</option>
                <option value="mouse">{t("鼠标按键")}</option>
                <option value="wheel">{t("滚轮")}</option>
                <option value="delay">{t("延迟")}</option>
              </select>
              {eventKind === "key" && (
                <input
                  aria-label={t("键盘键码")}
                  value={keyCode}
                  disabled={recording}
                  onChange={(event) => setKeyCode(event.target.value)}
                  placeholder="KeyA / Space"
                />
              )}
              {eventKind === "mouse" && (
                <select
                  aria-label={t("鼠标按键")}
                  value={mouseButton}
                  disabled={recording}
                  onChange={(event) =>
                    setMouseButton(Number(event.target.value))
                  }
                >
                  <option value={0}>{t("左键")}</option>
                  <option value={1}>{t("中键")}</option>
                  <option value={2}>{t("右键")}</option>
                  <option value={3}>{t("后退键")}</option>
                  <option value={4}>{t("前进键")}</option>
                </select>
              )}
              {eventKind === "wheel" ? (
                <select
                  aria-label={t("滚轮方向")}
                  value={wheelDirection}
                  disabled={recording}
                  onChange={(event) =>
                    setWheelDirection(event.target.value as "up" | "down")
                  }
                >
                  <option value="up">{t("向上")}</option>
                  <option value="down">{t("向下")}</option>
                </select>
              ) : eventKind === "delay" ? (
                <input
                  aria-label={t("添加延迟毫秒")}
                  type="number"
                  min={0}
                  max={MACRO_LIMITS.delayMs}
                  value={delay}
                  disabled={recording}
                  onChange={(event) => setDelay(Number(event.target.value))}
                />
              ) : (
                <select
                  aria-label={t("按键动作")}
                  value={eventAction}
                  disabled={recording}
                  onChange={(event) =>
                    setEventAction(event.target.value as "down" | "up")
                  }
                >
                  <option value="down">{t("按下")}</option>
                  <option value="up">{t("松开")}</option>
                </select>
              )}
              <button type="button" disabled={recording} onClick={addEvent}>
                <Plus size={15} />
                {t("添加事件")}
              </button>
            </div>
            <p className="macro-footnote">
              {t(
                "录制仅接收此页面的键盘和鼠标事件。设备宏的循环方式在按键绑定时设置，指定次数为 1–255 次。上传会创建新设备宏；本地修改不会自动覆盖设备。",
              )}
            </p>
          </div>
        ) : (
          <div className="macro-empty">
            <Keyboard size={36} />
            <h3>{t("创建你的第一个宏")}</h3>
            <p>{t("把一组按键与延迟整理成可重复使用的序列。")}</p>
            <button type="button" className="macro-primary" onClick={addMacro}>
              <Plus size={16} />
              {t("新建宏")}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export default MacroEditor;
