import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowUpFromLine,
  Check,
  Cpu,
  Info,
  LoaderCircle,
  X,
} from "lucide-react";
import "./firmware-flash.css";
import { FIRMWARE_RELEASE } from "./firmware-package";
import {
  formatFirmwareVersion,
  formatFirmwareVersionMessage,
} from "./firmware-version";

export type FirmwareFlashDialogProps = {
  stage: "prepare" | "bootloader" | "verify" | "complete";
  busy: boolean;
  supported: boolean;
  currentVersion?: string;
  firmware: {
    name: string;
    version: string;
    target: string;
    size: number;
    sha256: string;
  } | null;
  validating: boolean;
  progress: { message: string; percent: number } | null;
  result: { text: string; error?: boolean } | null;
  onFile: (file: File) => void;
  onStart: () => void;
  onBack: () => void;
  onClose: () => void;
  returnFocusTo?: HTMLElement | null;
};

export function FirmwareFlashDialog({
  stage,
  busy,
  supported,
  currentVersion,
  firmware,
  validating,
  progress,
  result,
  onFile,
  onStart,
  onBack,
  onClose,
  returnFocusTo,
}: FirmwareFlashDialogProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [confirmedSha, setConfirmedSha] = useState<string | null>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const fileId = `${id}-file`;
  const fileHintId = `${id}-file-hint`;
  const progressId = `${id}-progress`;
  const confirmed = !!firmware && confirmedSha === firmware.sha256;
  const requiresConfirmation = stage === "prepare" || stage === "bootloader";
  const targetVersion = firmware?.version ?? FIRMWARE_RELEASE.version;
  const displayedVersion = formatFirmwareVersion(currentVersion);
  const stepIndex = { prepare: 0, bootloader: 1, verify: 2, complete: 3 }[
    stage
  ];
  const startLabel = {
    prepare: "选择鼠标并进入升级模式",
    bootloader: "选择引导设备并刷写",
    verify: "重新连接鼠标并验证",
    complete: "已验证完成",
  }[stage];
  const busyLabel = {
    prepare: "正在进入升级模式…",
    bootloader: "正在刷写…",
    verify: "正在验证版本…",
    complete: "已验证完成",
  }[stage];
  const stageDescription = {
    prepare:
      "第 1 步：校验文件后选择有线连接的 Xlite v4 Mini，让鼠标进入升级模式。随后设备会重新出现在浏览器列表中。",
    bootloader:
      "第 2 步：点击下方按钮重新授权引导设备。它可能显示为通用 HID 名称，不含 Pulsar 字样；请确保只连接这一只目标鼠标。",
    verify: `第 3 步：等待鼠标重启，再点击下方按钮选择有线连接的 Xlite v4 Mini。读取到版本 ${targetVersion} 后才会确认刷写成功。`,
    complete: `三步已完成，设备版本已验证为 ${displayedVersion ?? targetVersion}。可以关闭窗口继续使用鼠标。`,
  }[stage];
  const percent = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        progress && Number.isFinite(progress.percent) ? progress.percent : 0,
      ),
    ),
  );

  useEffect(() => {
    const previousFocus = returnFocusTo ?? document.activeElement;
    titleRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected)
        previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    const focusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not(:disabled), input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled), [tabindex]',
        ) ?? [],
      ).filter(
        (element) =>
          element.tabIndex >= 0 &&
          !element.hidden &&
          element.getClientRects().length > 0,
      );
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        if (!busy) onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const elements = focusable();
      if (!elements.length) {
        event.preventDefault();
        titleRef.current?.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      const focused = document.activeElement;
      if (
        !dialogRef.current?.contains(focused) ||
        focused === titleRef.current ||
        (event.shiftKey && focused === first) ||
        (!event.shiftKey && focused === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const handleFocusIn = (event: FocusEvent) => {
      if (
        event.target instanceof Node &&
        !dialogRef.current?.contains(event.target)
      )
        titleRef.current?.focus();
    };
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("focusin", handleFocusIn);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("focusin", handleFocusIn);
    };
  }, [busy, onClose]);

  return (
    <div className="modal-backdrop firmware-flash-backdrop">
      <section
        ref={dialogRef}
        className="firmware-flash-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          className="icon-button close-dialog"
          aria-label="关闭固件刷写窗口"
          disabled={busy}
          onClick={onClose}
        >
          <X size={19} aria-hidden="true" />
        </button>
        <div className="firmware-flash-heading">
          <span className="firmware-flash-symbol" aria-hidden="true">
            <Cpu size={23} />
          </span>
          <div>
            <span className="eyebrow">XLITE V4 MINI · USB</span>
            <h2 ref={titleRef} tabIndex={-1} id={titleId}>
              刷写鼠标固件
            </h2>
          </div>
        </div>
        <p className="firmware-flash-intro" id={descriptionId}>
          仅支持 Xlite v4 Mini 鼠标本体通过 USB 数据线直接连接电脑刷写。
          请只保留这一只目标鼠标，拔下其他 Pulsar 鼠标和接收器。
        </p>
        <div className="firmware-flash-note">
          <Info size={17} aria-hidden="true" />
          <div>
            <strong>实验性刷写，已完成一次 Xlite v4 Mini 实机验证</strong>
            <p>刷写期间保持供电和 USB 连接，勿关闭或刷新页面。</p>
          </div>
        </div>

        <ol className="firmware-flash-steps" aria-label="刷写步骤">
          {["进入升级模式", "刷写固件", "重连并验证"].map((label, index) => (
            <li
              key={label}
              className={
                index < stepIndex
                  ? "done"
                  : index === stepIndex
                    ? "current"
                    : ""
              }
              aria-current={index === stepIndex ? "step" : undefined}
            >
              <span className="firmware-flash-step-number" aria-hidden="true">
                {index < stepIndex ? <Check size={12} /> : index + 1}
              </span>
              <span>{label}</span>
            </li>
          ))}
        </ol>
        <p className="firmware-flash-stage" role="status" aria-live="polite">
          {stageDescription}
        </p>

        <div className="firmware-flash-file">
          <div className="firmware-flash-file-heading">
            <label htmlFor={fileId}>选择固件文件</label>
            <a
              className="text-button"
              href="https://www.pulsar.gg/pages/download"
              target="_blank"
              rel="noreferrer"
            >
              Pulsar 官方下载 ↗
            </a>
          </div>
          <input
            id={fileId}
            type="file"
            accept=".exe,.bin"
            disabled={busy || validating || stage !== "prepare"}
            aria-describedby={fileHintId}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (!file) return;
              setConfirmedSha(null);
              onFile(file);
              event.currentTarget.value = "";
            }}
          />
          <p className="firmware-flash-hint" id={fileHintId}>
            支持已适配的官方 1.0.1.7 版本 .exe 升级程序或 .bin 固件。
            网页提取并校验固件，不运行 .exe。
          </p>
        </div>

        {validating && (
          <div className="firmware-flash-status" role="status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            <span>正在校验文件与目标型号…</span>
          </div>
        )}
        {firmware && !validating && (
          <div className="firmware-flash-package">
            <div className="firmware-flash-versions">
              <div>
                <span>当前版本</span>
                <strong>{displayedVersion ?? "连接后读取"}</strong>
              </div>
              <span aria-hidden="true">→</span>
              <div>
                <span>目标版本</span>
                <strong>{firmware.version}</strong>
              </div>
            </div>
            <dl>
              <div>
                <dt>文件</dt>
                <dd>{firmware.name}</dd>
              </div>
              <div>
                <dt>目标型号</dt>
                <dd>{firmware.target}</dd>
              </div>
              <div>
                <dt>固件大小</dt>
                <dd>{firmware.size.toLocaleString("zh-CN")} 字节</dd>
              </div>
              <div className="firmware-flash-hash">
                <dt>SHA-256</dt>
                <dd>{firmware.sha256}</dd>
              </div>
            </dl>
          </div>
        )}

        {requiresConfirmation && (
          <>
            <p className="firmware-flash-hint">
              刷写前建议导出配置和宏；本地草稿会保留，设备配置是否保留需刷写后检查。
            </p>
            <label className="firmware-flash-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                disabled={busy || validating || !firmware}
                onChange={(event) =>
                  setConfirmedSha(
                    event.target.checked && firmware ? firmware.sha256 : null,
                  )
                }
              />
              <span>
                我确认只连接这一只 Xlite v4 Mini 鼠标，已拔下其他 Pulsar
                鼠标和接收器， 用 USB
                数据线直接连接电脑，并会保持连接和供电直到刷写结束。
              </span>
            </label>
          </>
        )}

        {!supported && (
          <div className="firmware-flash-status error" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>
              当前环境不支持 WebHID，请在桌面版 Chrome 或 Edge 中通过 localhost
              或 HTTPS 打开。
            </span>
          </div>
        )}
        {busy && (
          <div className="firmware-flash-progress">
            <div
              className="firmware-flash-status"
              role="status"
              aria-live="polite"
            >
              <LoaderCircle className="spin" size={18} aria-hidden="true" />
              <span id={progressId}>{progress?.message ?? busyLabel}</span>
            </div>
            {progress && (
              <div className="firmware-flash-progress-row">
                <progress
                  aria-labelledby={progressId}
                  max={100}
                  value={percent}
                />
                <span aria-hidden="true">{percent}%</span>
              </div>
            )}
            <p className="firmware-flash-hint">
              刷写开始后无法从此窗口取消，请等待设备返回结果。
            </p>
          </div>
        )}
        {!busy && result && (
          <div
            className={`firmware-flash-status ${result.error ? "error" : "success"}`}
            role={result.error ? "alert" : "status"}
          >
            {result.error ? (
              <Info size={18} aria-hidden="true" />
            ) : (
              <Check size={18} aria-hidden="true" />
            )}
            <span>{formatFirmwareVersionMessage(result.text)}</span>
          </div>
        )}
        {!busy &&
          result?.error &&
          (stage === "bootloader" || stage === "verify") && (
            <button
              className="text-button firmware-flash-recovery"
              disabled={validating}
              onClick={onBack}
            >
              {stage === "bootloader"
                ? "设备仍是 Xlite v4？返回第一步"
                : "设备仍在升级模式？返回刷写"}
            </button>
          )}
        <div className="firmware-flash-actions">
          <button className="button" disabled={busy} onClick={onClose}>
            关闭
          </button>
          <button
            className="button primary"
            disabled={
              busy ||
              validating ||
              !supported ||
              stage === "complete" ||
              (requiresConfirmation && (!firmware || !confirmed))
            }
            onClick={onStart}
          >
            <ArrowUpFromLine size={16} aria-hidden="true" />
            {busy ? busyLabel : startLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
