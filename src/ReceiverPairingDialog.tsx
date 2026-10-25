import { t } from "./i18n";
import { useLocale } from "./use-locale";
import { useEffect, useId, useRef } from "react";
import { Check, Info, Link2, LoaderCircle, Radio, X } from "lucide-react";
import "./receiver-pairing.css";

export type ReceiverPairingDialogProps = {
  busy: boolean;
  progress: string | null;
  result: { text: string; error?: boolean } | null;
  onStart: () => void;
  onCancel: () => void;
  onClose: () => void;
  supported: boolean;
  returnFocusTo?: HTMLElement | null;
};

export function ReceiverPairingDialog({
  busy,
  progress,
  result,
  onStart,
  onCancel,
  onClose,
  supported,
  returnFocusTo,
}: ReceiverPairingDialogProps) {
  useLocale();
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const titleId = `${id}-title`;
  const descriptionId = `${id}-description`;
  const close = busy ? onCancel : onClose;

  useEffect(() => {
    const previousFocus = returnFocusTo ?? document.activeElement;
    titleRef.current?.focus();
    return () => {
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== "Tab") return;
      const buttons = dialogRef.current?.querySelectorAll<HTMLButtonElement>(
        "button:not(:disabled)",
      );
      if (!buttons?.length) return;
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      const focused = document.activeElement;
      if (
        event.shiftKey &&
        (focused === first || focused === titleRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && focused === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(focused)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  return (
    <div className="modal-backdrop receiver-pairing-backdrop">
      <section
        ref={dialogRef}
        className="receiver-pairing-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <button
          className="icon-button close-dialog"
          aria-label={busy ? t("取消配对") : t("关闭配对窗口")}
          onClick={close}
        >
          <X size={19} aria-hidden="true" />
        </button>

        <div className="receiver-pairing-heading">
          <span className="receiver-pairing-symbol" aria-hidden="true">
            <Radio size={23} />
          </span>
          <div>
            <span className="eyebrow">1K / 8K WIRELESS RECEIVER</span>
            <h2 ref={titleRef} tabIndex={-1} id={titleId}>
              {t("配对接收器")}
            </h2>
          </div>
        </div>
        <p className="receiver-pairing-intro" id={descriptionId}>
          {t(
            "将 Xlite v4 与原版 Pulsar 1K 或 8K 接收器建立无线连接。无需先在网页连接鼠标。",
          )}
        </p>

        <ol className="receiver-pairing-steps">
          <li>
            <span className="receiver-pairing-step" aria-hidden="true">
              1
            </span>
            <div>
              <h3>{t("只连接目标接收器")}</h3>
              <p>
                {t(
                  "插入要配对的 Pulsar 1K 或 8K 接收器，拔下其他无线接收器。断开鼠标 USB 数据线，开启鼠标无线模式并放在接收器附近。",
                )}
              </p>
            </div>
          </li>
          <li>
            <span className="receiver-pairing-step" aria-hidden="true">
              2
            </span>
            <div>
              <h3>{t("让鼠标进入配对模式")}</h3>
              <p>
                {t("同时按住")} <kbd>{t("左键")}</kbd> + <kbd>{t("右键")}</kbd>{" "}
                + <kbd>{t("滚轮中键")}</kbd>{" "}
                {t("3–5 秒，直到鼠标 LED 开始闪烁。")}
              </p>
            </div>
          </li>
          <li>
            <span className="receiver-pairing-step" aria-hidden="true">
              3
            </span>
            <div>
              <h3>{t("选择接收器并授权")}</h3>
              <p>
                {t(
                  "点击下方按钮，在浏览器设备列表中选择 1K Dongle 或 8K Dongle 并允许访问。 配对期间保持鼠标靠近接收器，等待结果。",
                )}
              </p>
            </div>
          </li>
        </ol>

        <div className="receiver-pairing-note">
          <Info size={17} aria-hidden="true" />
          <p>
            {t(
              "重新配对会改变现有无线配对关系。不支持 Gen.2。原版 1K 与 8K 接收器配对均已实机验证。取消或超时只停止本页等待，请重新连接检查状态。",
            )}
          </p>
        </div>

        {!supported && (
          <div className="receiver-pairing-status error" role="alert">
            <Info size={18} aria-hidden="true" />
            <span>
              {t("当前浏览器不支持 WebHID，请使用桌面版 Chrome 或 Edge。")}
            </span>
          </div>
        )}
        {busy && (
          <div
            className="receiver-pairing-status"
            role="status"
            aria-live="polite"
          >
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
            <span>{progress || t("正在准备配对…")}</span>
          </div>
        )}
        {!busy && result && (
          <div
            className={`receiver-pairing-status ${result.error ? "error" : "success"}`}
            role={result.error ? "alert" : "status"}
          >
            {result.error ? (
              <Info size={18} aria-hidden="true" />
            ) : (
              <Check size={18} aria-hidden="true" />
            )}
            <span>{result.text}</span>
          </div>
        )}

        <div className="receiver-pairing-actions">
          <button className="button" onClick={close}>
            {busy ? t("取消配对") : t("关闭")}
          </button>
          <button
            className="button primary"
            disabled={busy || !supported}
            onClick={onStart}
          >
            <Link2 size={16} aria-hidden="true" />
            {busy ? t("配对进行中…") : t("选择接收器并开始配对")}
          </button>
        </div>
      </section>
    </div>
  );
}
