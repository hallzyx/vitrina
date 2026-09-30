import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import en from "./en.json";
import es from "./es.json";

export type Lang = "en" | "es";
export type TKey = keyof typeof en;

const dictionaries: Record<Lang, Record<TKey, string>> = { en, es };
const STORAGE_KEY = "lang";

/** Saved choice wins; otherwise Spanish for `es*` browsers and English for everything else. */
export function detectLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "en" || saved === "es") return saved;
  } catch {
    /* storage may be unavailable */
  }
  const langs = navigator.languages?.length ? navigator.languages : [navigator.language || "en"];
  return String(langs[0]).toLowerCase().startsWith("es") ? "es" : "en";
}

type Vars = Record<string, string | number>;

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: TKey, vars?: Vars) => string;
  /** Pick the right language from a bilingual value, falling back to English. */
  l: (value: { en: string; es: string }) => string;
  money: (amount: number, currency?: string) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(detectLang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, vars) => {
        let text = dictionaries[lang][key] ?? dictionaries.en[key] ?? key;
        if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(String(v));
        return text;
      },
      l: (value) => value[lang] || value.en,
      money: (amount, currency = "USD") => {
        try {
          return new Intl.NumberFormat(lang === "es" ? "es-PE" : "en-US", { style: "currency", currency }).format(amount);
        } catch {
          return `${currency} ${amount.toFixed(2)}`; // unknown currency code: never break the page
        }
      },
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
