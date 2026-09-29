import { Link, useParams } from "react-router-dom";
import { EmptyState, Footer, Topbar } from "../components/Chrome";
import { brandStyle, ProductCard } from "../components/ProductCard";
import { btn, eyebrow } from "../components/ui";
import { findStore } from "../data/mock";
import { useI18n } from "../i18n";

export function Store() {
  const { slug } = useParams();
  const { t, l } = useI18n();
  const store = findStore(slug);

  if (!store) {
    return (
      <>
        <Topbar />
        <EmptyState
          title={t("store.notFound")}
          action={
            <Link to="/" className={btn("primary")}>
              {t("store.backHome")}
            </Link>
          }
        />
      </>
    );
  }

  return (
    <div style={brandStyle(store)}>
      <Topbar />
      <main>
        <section className="grain relative overflow-hidden border-b border-line bg-[linear-gradient(160deg,color-mix(in_oklab,var(--brand-soft)_70%,white),var(--color-paper))] py-12 sm:py-16">
          <div
            className="pointer-events-none absolute -right-20 -top-24 -z-10 size-80 rounded-full bg-brand opacity-15 blur-3xl"
            aria-hidden="true"
          />
          <div className="container-page">
            <p className={`${eyebrow} mb-3 text-brand-strong`}>{t("store.by", { name: store.name })}</p>
            <h1 className="text-[clamp(2.6rem,10vw,5rem)] font-medium leading-none tracking-[-0.03em] text-brand-strong">{store.name}</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">{l(store.tagline)}</p>
            <div className="mt-6 flex" aria-hidden="true">
              {store.colors.map((c) => (
                <span key={c} className="-ml-1.5 size-8 rounded-full border-[3px] border-paper shadow-card first:ml-0" style={{ background: c }} />
              ))}
            </div>
          </div>
        </section>

        <section className="container-page py-10 sm:py-14">
          <h2 className="mb-5 text-2xl font-medium sm:text-3xl">{t("store.products")}</h2>
          <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
            {store.products.map((p) => (
              <ProductCard key={p.id} store={store} product={p} spinLabel={t("store.spin")} />
            ))}
          </div>
        </section>
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}
