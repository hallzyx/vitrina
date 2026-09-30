import { useEffect } from "react";
import { Link, useParams } from "react-router-dom";
import { DemoBadge, EmptyState, Footer, LoadError, RecordedNote, Skeleton, Topbar } from "../components/Chrome";
import { ProductCard } from "../components/ProductCard";
import { btn, eyebrow } from "../components/ui";
import { useI18n } from "../i18n";
import { EXAMPLE_SLUG, getPublicStore, isApiError, sendEvent } from "../lib/api";
import { brandStyle, isReady, paletteOf } from "../lib/product";
import { useRemote } from "../lib/useRemote";

export function Store() {
  const { slug = "" } = useParams();
  const { t } = useI18n();
  const { data: store, error, loading, reload } = useRemote(() => getPublicStore(slug), [slug]);

  useEffect(() => {
    if (store) sendEvent("view", store.slug);
  }, [store]);

  if (!store && loading) return <StoreSkeleton />;

  if (!store) {
    if (isApiError(error, 404)) {
      return (
        <>
          <Topbar />
          <EmptyState
            title={slug === EXAMPLE_SLUG ? t("store.exampleMissing") : t("store.notFound")}
            body={slug === EXAMPLE_SLUG ? t("store.exampleMissingBody") : t("store.notFoundBody")}
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
      <>
        <Topbar />
        <LoadError titleKey="store.loadError" bodyKey="error.network" onRetry={reload} />
      </>
    );
  }

  const products = store.products.filter(isReady);
  const colors = paletteOf(store.brand);

  return (
    <div style={brandStyle(store.brand)}>
      <Topbar />
      <main>
        <section className="grain relative overflow-hidden border-b border-line bg-[linear-gradient(160deg,color-mix(in_oklab,var(--brand-soft)_70%,white),var(--color-paper))] py-12 sm:py-16">
          <div className="pointer-events-none absolute -right-20 -top-24 -z-10 size-80 rounded-full bg-brand opacity-15 blur-3xl" aria-hidden="true" />
          <div className="container-page">
            <p className={`${eyebrow} mb-3 text-brand-strong`}>{store.demo ? t("store.demoEyebrow") : t("store.by", { name: store.name })}</p>
            <h1 className="break-words text-[clamp(2.6rem,10vw,5rem)] font-medium leading-none tracking-[-0.03em] text-brand-strong">{store.name}</h1>
            <p className="mt-4 max-w-xl text-lg text-ink-soft">{t("store.tagline")}</p>
            <div className="mt-6 flex" aria-hidden="true">
              {colors.map((c, i) => (
                <span key={`${c}-${i}`} className="-ml-1.5 size-8 rounded-full border-[3px] border-paper shadow-card first:ml-0" style={{ background: c }} />
              ))}
            </div>
            {store.demo && (
              <div className="mt-6 grid max-w-2xl gap-2.5">
                <DemoBadge />
                {store.slug === EXAMPLE_SLUG ? <RecordedNote /> : <RecordedNote>{t("store.demoNote")}</RecordedNote>}
              </div>
            )}
          </div>
        </section>

        <section className="container-page py-10 sm:py-14">
          <h2 className="mb-5 text-2xl font-medium sm:text-3xl">{t("store.products")}</h2>
          {products.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-5 py-10 text-center text-ink-soft">{t("store.empty")}</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3">
              {products.map((p) => (
                <ProductCard key={p.id} slug={store.slug} currency={store.currency} product={p} storeIsDemo={store.demo} spinLabel={t("store.spin")} />
              ))}
            </div>
          )}
        </section>
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}

function StoreSkeleton() {
  const { t } = useI18n();
  return (
    <>
      <Topbar />
      <main aria-busy="true">
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
        <section className="border-b border-line py-12 sm:py-16">
          <div className="container-page grid gap-4">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-14 w-3/4 max-w-md" />
            <Skeleton className="h-5 w-2/3 max-w-lg" />
          </div>
        </section>
        <section className="container-page grid grid-cols-2 gap-3 py-10 sm:gap-5 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="aspect-[4/5] rounded-card" />
          ))}
        </section>
      </main>
    </>
  );
}
