import { englishMessages } from "./locales/en";
export { englishMessages } from "./locales/en";

export type Locale = "zh-CN" | "en";
export const LOCALE_STORAGE_KEY = "pulsar-locale-v1";

export function resolveLocale(
  stored: string | null,
  languages: readonly string[],
): Locale {
  if (stored === "zh-CN" || stored === "en") return stored;
  for (const language of languages) {
    if (/^zh(?:-|$)/i.test(language)) return "zh-CN";
    if (/^en(?:-|$)/i.test(language)) return "en";
  }
  return "en";
}

function initialLocale(): Locale {
  // Protocol tools and Node tests keep the original Chinese diagnostics by default.
  if (typeof window === "undefined") return "zh-CN";
  let stored: string | null = null;
  try {
    stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {}
  return resolveLocale(stored, navigator.languages ?? [navigator.language]);
}

let locale = initialLocale();
const listeners = new Set<() => void>();
export const getLocale = (): Locale => locale;

export function syncDocumentLocale() {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  const description = document.querySelector('meta[name="description"]');
  description?.setAttribute(
    "content",
    t("Pulsar Xlite v4 Mini 浏览器设备配置工具"),
  );
}

function updateLocale(next: Locale) {
  if (locale === next) return;
  locale = next;
  syncDocumentLocale();
  for (const listener of listeners) listener();
}

export function setLocale(next: Locale) {
  // Keep switching usable when storage is unavailable (e.g. browser privacy settings).
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {}
  updateLocale(next);
}

function onStorage(event: StorageEvent) {
  if (event.key !== LOCALE_STORAGE_KEY && event.key !== null) return;
  try {
    if (event.storageArea !== window.localStorage) return;
  } catch {
    return;
  }
  updateLocale(
    resolveLocale(event.newValue, navigator.languages ?? [navigator.language]),
  );
}

export function subscribeLocale(listener: () => void) {
  if (listeners.size === 0 && typeof window !== "undefined")
    window.addEventListener("storage", onStorage);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined")
      window.removeEventListener("storage", onStorage);
  };
}

export function translate(
  source: string,
  values: readonly unknown[] = [],
  language: Locale = locale,
): string {
  const message =
    language === "en" ? (englishMessages[source] ?? source) : source;
  // Replace once: user content containing braces must never become a second template.
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) =>
    Number(index) < values.length ? String(values[Number(index)]) : placeholder,
  );
}

/** Chinese source text is the message key; tagged templates keep substitutions intact. */
export function t(
  source: string | TemplateStringsArray,
  ...values: unknown[]
): string {
  const key =
    typeof source === "string"
      ? source
      : source.reduce(
          (text, part, index) => text + (index ? `{${index - 1}}` : "") + part,
          "",
        );
  return translate(key, values);
}
