import { useEffect, useSyncExternalStore } from "react";
import { getLocale, subscribeLocale, syncDocumentLocale } from "./i18n";

export function useLocale() {
  const locale = useSyncExternalStore(subscribeLocale, getLocale, getLocale);
  useEffect(syncDocumentLocale, [locale]);
  return locale;
}
