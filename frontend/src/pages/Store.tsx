import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Footer, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { findStore } from "../data/mock";
import { useI18n } from "../i18n";

export function Store() {
  const { slug } = useParams();
  const { t, l, money } = useI18n();
  const store = findStore(slug);

  if (!store) {
    return (
      <>
        <Topbar />
        <main className="container empty">
          <h1>{t("store.notFound")}</h1>
          <Link to="/" className="btn btn-primary">
            {t("store.backHome")}
          </Link>
        </main>
      </>
    );
  }

  const style = { "--brand": store.colors[0], "--brand-soft": store.colors[1] } as CSSProperties;

  return (
    <div style={style} className="branded">
      <Topbar />
      <main>
        <section className="store-hero">
          <div className="container">
            <p className="eyebrow">{t("store.by", { name: store.name })}</p>
            <h1>{store.name}</h1>
            <p className="lead">{l(store.tagline)}</p>
            <div className="swatches" aria-hidden="true">
              {store.colors.map((c) => (
                <span key={c} style={{ background: c }} />
              ))}
            </div>
          </div>
        </section>

        <section className="container section">
          <h2 className="section-title">{t("store.products")}</h2>
          <div className="grid">
            {store.products.map((p) => (
              <Link key={p.id} to={`/s/${store.slug}/${p.id}`} className="product-card">
                <div className="product-thumb">
                  <PieceThumb piece={p.piece} />
                  <span className="spin-chip">⟳ {t("store.spin")}</span>
                </div>
                <div className="product-info">
                  <h3>{l(p.name)}</h3>
                  <span className="price">{money(p.price, store.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}
