import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { CopyButton, Footer, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { EXAMPLE_STORE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";

export function Dashboard() {
  const { token } = useParams();
  const { t, l, money } = useI18n();
  const store = EXAMPLE_STORE;
  const views = store.products.reduce((sum, p) => sum + p.views, 0);
  const clicks = store.products.reduce((sum, p) => sum + p.clicks, 0);
  const storeUrl = `${window.location.origin}/s/${store.slug}`;
  const style = { "--brand": store.colors[0], "--brand-soft": store.colors[1] } as CSSProperties;
  const masked = token ? `${token.slice(0, 4)}••••••••` : "••••";

  return (
    <div style={style} className="branded">
      <Topbar />
      <main className="container dashboard">
        <header className="dash-head">
          <div>
            <h1>{t("dash.title")}</h1>
            <p className="muted small">
              🔑 {t("dash.session")} · <code>{masked}</code>
            </p>
          </div>
          <Link to="/create?add=1" className="btn btn-primary">
            + {t("dash.add")}
          </Link>
        </header>

        <div className="tiles">
          <div className="tile card">
            <span className="tile-value">{views.toLocaleString()}</span>
            <span className="tile-label">{t("dash.views")}</span>
          </div>
          <div className="tile card">
            <span className="tile-value">{clicks.toLocaleString()}</span>
            <span className="tile-label">{t("dash.clicks")}</span>
          </div>
          <div className="tile card">
            <span className="tile-value">{store.products.length}</span>
            <span className="tile-label">{t("dash.products")}</span>
          </div>
        </div>

        <section className="section">
          <h2 className="section-title">{t("dash.products")}</h2>
          <ul className="rows">
            {store.products.map((p) => (
              <li key={p.id} className="row card">
                <PieceThumb piece={p.piece} size={120} className="row-thumb" />
                <div className="row-main">
                  <strong>{l(p.name)}</strong>
                  <span className="muted small">{money(p.price, store.currency)}</span>
                </div>
                <div className="row-stats muted small">
                  👁 {p.views} · 💬 {p.clicks}
                </div>
                <span className={`chip chip-${p.status}`}>{t(`dash.status.${p.status}` as TKey)}</span>
                <Link to={`/s/${store.slug}/${p.id}`} className="btn btn-outline btn-sm">
                  →
                </Link>
              </li>
            ))}
          </ul>
          <p className="muted small">{t("dash.addNote")}</p>
        </section>

        <section className="section two-col">
          <div className="card pad">
            <h2 className="section-title">{t("dash.brand")}</h2>
            <p>
              <strong>{store.name}</strong> · {t(`tone.${store.tone}` as TKey)}
            </p>
            <div className="swatches" aria-hidden="true">
              {store.colors.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
            <p className="muted small">
              {t("dash.whatsapp")}: +{store.whatsapp}
            </p>
          </div>
          <div className="card pad">
            <h2 className="section-title">{t("dash.share")}</h2>
            <div className="copy-row">
              <input readOnly value={storeUrl} aria-label={t("publish.storeLink")} />
              <CopyButton text={storeUrl} />
            </div>
            <Link to="/s/example" className="btn btn-outline btn-sm">
              {t("publish.openStore")}
            </Link>
          </div>
        </section>
        <p className="muted small">{t("dash.demoNote")}</p>
      </main>
      <Footer />
    </div>
  );
}
