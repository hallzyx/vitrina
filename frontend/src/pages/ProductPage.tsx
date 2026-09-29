import type { CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { Footer, RealBadge, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { Viewer360 } from "../components/Viewer360";
import { findStore } from "../data/mock";
import { useI18n } from "../i18n";

export function ProductPage() {
  const { slug, productId } = useParams();
  const { t, l, money } = useI18n();
  const store = findStore(slug);
  const product = store?.products.find((p) => p.id === productId);

  if (!store || !product) {
    return (
      <>
        <Topbar />
        <main className="container empty">
          <h1>{t("product.notFound")}</h1>
          <Link to={store ? `/s/${store.slug}` : "/"} className="btn btn-primary">
            {t("product.backStore")}
          </Link>
        </main>
      </>
    );
  }

  const price = money(product.price, store.currency);
  const message = t("product.orderMsg", { name: l(product.name), price });
  const whatsappUrl = `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(message)}`;
  const others = store.products.filter((p) => p.id !== product.id);
  const style = { "--brand": store.colors[0], "--brand-soft": store.colors[1] } as CSSProperties;

  return (
    <div style={style} className="branded">
      <Topbar />
      <main className="container product-page">
        <Link to={`/s/${store.slug}`} className="back-link">
          ← {store.name}
        </Link>
        <div className="product-layout">
          <div className="product-viewer card">
            <Viewer360 piece={product.piece} />
          </div>
          <div className="product-details">
            <h1>{l(product.name)}</h1>
            <p className="price price-lg">{price}</p>
            <p>{l(product.description)}</p>
            <RealBadge />
            <p className="muted small">
              {t("product.fidelity", { score: product.fidelity.toFixed(2) })} · {t("product.frames", { n: product.frames })}
            </p>
            <a className="btn btn-whatsapp btn-lg" href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              💬 {t("product.order")}
            </a>
          </div>
        </div>

        {others.length > 0 && (
          <section className="section">
            <h2 className="section-title">{t("product.more")}</h2>
            <div className="grid grid-small">
              {others.map((p) => (
                <Link key={p.id} to={`/s/${store.slug}/${p.id}`} className="product-card">
                  <div className="product-thumb">
                    <PieceThumb piece={p.piece} size={240} />
                  </div>
                  <div className="product-info">
                    <h3>{l(p.name)}</h3>
                    <span className="price">{money(p.price, store.currency)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}
