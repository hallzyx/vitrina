import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";

export function Logo() {
  return (
    <Link to="/" className="logo" aria-label="Vitrina">
      <svg viewBox="0 0 64 64" width="28" height="28" aria-hidden="true">
        <rect width="64" height="64" rx="16" fill="var(--terracotta)" />
        <path d="M24 14h16v6c0 3 9 7 9 17 0 9-6 13-17 13S15 46 15 37c0-10 9-14 9-17z" fill="#faf7f2" />
        <ellipse cx="32" cy="14" rx="8" ry="2.4" fill="#2b2622" opacity=".45" />
      </svg>
      <span>Vitrina</span>
    </Link>
  );
}

export function LangToggle() {
  const { lang, setLang, t } = useI18n();
  const target = lang === "es" ? "en" : "es";
  return (
    <button type="button" className="btn btn-ghost btn-sm" lang={target} title={t("lang.toggleAria")} onClick={() => setLang(target)}>
      <span aria-hidden="true">🌐</span> {t("lang.toggle")}
    </button>
  );
}

export function Topbar({ cta = false }: { cta?: boolean }) {
  const { t } = useI18n();
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <Logo />
        <div className="topbar-right">
          {cta && (
            <Link to="/create" className="btn btn-primary btn-sm">
              {t("nav.create")}
            </Link>
          )}
          <LangToggle />
        </div>
      </div>
    </header>
  );
}

export function RealBadge() {
  const { t } = useI18n();
  return <span className="badge">✓ {t("badge.real")}</span>;
}

export function CopyButton({ text }: { text: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard may be blocked */
    }
  };
  return (
    <button type="button" className="btn btn-outline btn-sm" onClick={copy}>
      {copied ? `✓ ${t("common.copied")}` : t("common.copy")}
    </button>
  );
}

export function Footer({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <footer className="footer">
      <p>{children ?? t("footer.built")}</p>
      <p className="muted">{t("footer.demoNote")}</p>
    </footer>
  );
}
