import { useEffect, useRef, useState, type ReactNode } from "react";
import { LuCheck, LuCopy, LuLanguages } from "react-icons/lu";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import { btn, muted } from "./ui";

export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="shrink-0">
      <rect width="64" height="64" rx="18" fill="var(--color-terracotta)" />
      <path d="M24 14h16v6c0 3 9 7 9 17 0 9-6 13-17 13S15 46 15 37c0-10 9-14 9-17z" fill="#f7f0e6" />
      <path d="M17.5 33c8 3 21 3 29 0" stroke="#c2623f" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <ellipse cx="32" cy="14" rx="8" ry="2.4" fill="#2b2622" opacity=".45" />
    </svg>
  );
}

export function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <Link
      to="/"
      className={`inline-flex items-center gap-2.5 font-display text-[1.35rem] font-semibold tracking-tight no-underline ${dark ? "text-paper" : "text-ink"}`}
    >
      <LogoMark />
      <span>Vitrina</span>
    </Link>
  );
}

export function LangToggle({ dark = false }: { dark?: boolean }) {
  const { lang, setLang, t } = useI18n();
  const target = lang === "es" ? "en" : "es";
  return (
    <button
      type="button"
      className={btn(dark ? "outlineLight" : "ghost", "sm", dark ? "border-transparent" : "")}
      lang={target}
      title={t("lang.toggleAria")}
      onClick={() => setLang(target)}
    >
      <LuLanguages aria-hidden="true" className="size-4" />
      {/* Short code on narrow phones; the hidden variant is excluded from the accessible name. */}
      <span className="sm:hidden">{target.toUpperCase()}</span>
      <span className="max-sm:hidden">{t("lang.toggle")}</span>
    </button>
  );
}

/**
 * Sticky top bar. `dark` is the landing variant: transparent over the hero and
 * solid once the page scrolls.
 */
export function Topbar({ cta = false, dark = false }: { cta?: boolean; dark?: boolean }) {
  const { t } = useI18n();
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (!dark) return;
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [dark]);

  const surface = dark
    ? `on-dark fixed inset-x-0 ${scrolled ? "bg-clay-950/95 border-white/10 backdrop-blur-xl" : "bg-transparent border-transparent"}`
    : "sticky bg-paper/85 border-line backdrop-blur-xl";

  return (
    <header className={`${surface} top-0 z-40 border-b transition-[background-color,border-color] duration-300`}>
      <div className="container-page flex min-h-16 items-center justify-between gap-3">
        <Logo dark={dark} />
        <div className="flex items-center gap-1.5">
          {cta && (
            <Link to="/create" className={btn("primary", "sm", "max-[359px]:hidden")}>
              {t("nav.create")}
            </Link>
          )}
          <LangToggle dark={dark} />
        </div>
      </div>
    </header>
  );
}

export function RealBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-olive/35 bg-olive/10 px-3 py-1 text-[0.8rem] font-semibold text-olive-deep">
      <LuCheck aria-hidden="true" className="size-3.5" strokeWidth={3} /> {t("badge.real")}
    </span>
  );
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const timer = useRef<number>();

  useEffect(() => {
    return () => window.clearTimeout(timer.current);
  }, []);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <button type="button" className={btn("outline", "sm", "shrink-0")} onClick={copy}>
      {copied ? <LuCheck aria-hidden="true" className="size-4" /> : <LuCopy aria-hidden="true" className="size-4" />}
      <span aria-live="polite">{copied ? t("common.copied") : t("common.copy")}</span>
    </button>
  );
}

export function Footer({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <footer className="container-page border-t border-line py-10 text-center text-sm">
      <p className="mb-1">{children ?? t("footer.built")}</p>
      <p className={muted}>{t("footer.demoNote")}</p>
    </footer>
  );
}

/** Centered message page (404s and missing stores/products). */
export function EmptyState({ title, action }: { title: string; action: ReactNode }) {
  return (
    <main className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div>
        <p className="font-display text-7xl font-semibold text-terracotta/30 sm:text-8xl" aria-hidden="true">
          404
        </p>
        <h1 className="mb-6 text-3xl sm:text-4xl">{title}</h1>
        {action}
      </div>
    </main>
  );
}
