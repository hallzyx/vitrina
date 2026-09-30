import { useEffect, useRef, useState, type ReactNode } from "react";
import { LuBox, LuCheck, LuCopy, LuHistory, LuLanguages, LuRefreshCw, LuTriangleAlert } from "react-icons/lu";
import { Link } from "react-router-dom";
import { useI18n, type TKey } from "../i18n";
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

/** Only for products made from an artisan's own photos. Never shown on demonstration products. */
export function RealBadge() {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-olive/35 bg-olive/10 px-3 py-1 text-[0.8rem] font-semibold text-olive-deep">
      <LuCheck aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={3} /> {t("badge.real")}
    </span>
  );
}

/** Honest label for products made from the sample photo sets (renders of 3D-scanned models). */
export function DemoBadge({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex items-start gap-1.5 rounded-2xl border border-ochre/50 bg-ochre/15 px-3 py-1 text-[0.8rem] font-semibold text-[#6b4a07]">
      <LuBox aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /> {compact ? t("badge.demoShort") : t("badge.demo")}
    </span>
  );
}

export function ProvenanceBadge({ demo }: { demo: boolean }) {
  return demo ? <DemoBadge /> : <RealBadge />;
}

/** Shown wherever the user sees output of an earlier run instead of a live one. */
export function RecordedNote({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <p className="flex items-start gap-2 rounded-2xl border border-line bg-paper-2/70 px-3.5 py-2.5 text-sm text-ink" role="note">
      <LuHistory aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-terracotta-deep" />
      <span>{children ?? t("store.recordedNote")}</span>
    </p>
  );
}

/**
 * Fidelity line that never overstates the check: a missing score says the check was unavailable,
 * and a check that covered fewer frames than are shown says so.
 */
export function FidelityLine({ score, checked, frames }: { score?: number | null; checked?: number | null; frames: number }) {
  const { t } = useI18n();
  let text: string;
  if (typeof score !== "number") text = t("fidelity.unavailable", { total: frames });
  else if (typeof checked === "number" && checked < frames) text = t("fidelity.partial", { score: score.toFixed(2), checked, total: frames });
  else if (typeof checked === "number") text = t("fidelity.full", { score: score.toFixed(2), total: frames });
  else text = t("fidelity.score", { score: score.toFixed(2), total: frames });
  return <p className="text-sm text-ink-soft">{text}</p>;
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
      <p className={muted}>{t("footer.note")}</p>
    </footer>
  );
}

/** Centered message page (404s and missing stores/products). */
export function EmptyState({ title, body, action, code = "404" }: { title: string; body?: string; action: ReactNode; code?: string | null }) {
  return (
    <main className="container-page grid min-h-[60vh] place-items-center py-20 text-center">
      <div className="max-w-lg">
        {code && (
          <p className="font-display text-7xl font-semibold text-terracotta/30 sm:text-8xl" aria-hidden="true">
            {code}
          </p>
        )}
        <h1 className="mb-3 text-3xl sm:text-4xl">{title}</h1>
        {body && <p className="mb-6 text-ink-soft">{body}</p>}
        <div className={`flex flex-wrap justify-center gap-3 ${body ? "" : "mt-6"}`}>{action}</div>
      </div>
    </main>
  );
}

/** Inline error with an optional retry. Announced to screen readers. */
export function ErrorNote({ message, onRetry, className = "" }: { message: string; onRetry?: () => void; className?: string }) {
  const { t } = useI18n();
  return (
    <div className={`flex flex-wrap items-center gap-3 rounded-2xl border border-[#e7b9ad] bg-[#fdf0ec] px-4 py-3 text-sm text-[#7a2a16] ${className}`} role="alert">
      <LuTriangleAlert aria-hidden="true" className="size-5 shrink-0" />
      <span className="min-w-0 flex-1">{message}</span>
      {onRetry && (
        <button type="button" className={btn("outline", "sm")} onClick={onRetry}>
          <LuRefreshCw aria-hidden="true" className="size-3.5" /> {t("common.retry")}
        </button>
      )}
    </div>
  );
}

/** Full-page error for a failed load (API down, bad link), never a blank page. */
export function LoadError({ titleKey, bodyKey, onRetry }: { titleKey: TKey; bodyKey?: TKey; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <EmptyState
      code={null}
      title={t(titleKey)}
      body={bodyKey ? t(bodyKey) : undefined}
      action={
        <>
          {onRetry && (
            <button type="button" className={btn("primary")} onClick={onRetry}>
              <LuRefreshCw aria-hidden="true" className="size-4" /> {t("common.retry")}
            </button>
          )}
          <Link to="/" className={btn(onRetry ? "outline" : "primary")}>
            {t("store.backHome")}
          </Link>
        </>
      }
    />
  );
}

/** Neutral placeholder block for loading skeletons. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <span className={`block animate-pulse-soft rounded-xl bg-paper-2 ${className}`} aria-hidden="true" />;
}

export function Spinner({ className = "size-5" }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-sand border-t-terracotta ${className}`} aria-hidden="true" />;
}
