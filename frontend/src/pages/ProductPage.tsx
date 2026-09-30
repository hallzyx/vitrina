import { useEffect } from "react";
import { LuArrowLeft, LuMessageCircle } from "react-icons/lu";
import { Link, useParams } from "react-router-dom";
import { EmptyState, FidelityLine, Footer, LoadError, ProvenanceBadge, RecordedNote, Skeleton, Topbar } from "../components/Chrome";
import { ProductCard } from "../components/ProductCard";
import { btn, card } from "../components/ui";
import { Viewer360 } from "../components/Viewer360";
import { useI18n } from "../i18n";
import { EXAMPLE_SLUG, getPublicStore, isApiError, sendEvent } from "../lib/api";
import { brandStyle, hasPrice, isDemoProduct, isReady, productText, whatsappLink } from "../lib/product";
import { useRemote } from "../lib/useRemote";

export function ProductPage() {
  const { slug = "", productId = "" } = useParams();
  const { t, lang, money } = useI18n();
  const { data: store, error, loading, reload } = useRemote(() => getPublicStore(slug), [slug]);
  const product = store?.products.find((p) => p.id === productId && isReady(p));

  useEffect(() => {
    if (store && product) sendEvent("view", store.slug, product.id);
  }, [store, product]);

  if (!store && loading) {
    return (
      <>
        <Topbar />
        <main className="container-page grid gap-6 pb-8 pt-5 sm:pt-8 md:grid-cols-[1.2fr_1fr]" aria-busy="true">
          <p className="sr-only" role="status">
            {t("common.loading")}
          </p>
          <Skeleton className="aspect-square rounded-card" />
          <div className="grid content-start gap-4 md:pt-6">
            <Skeleton className="h-12 w-3/4" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-20 w-full" />
          </div>
        </main>
      </>
    );
  }

  if (!store && !isApiError(error, 404)) {
    return (
      <>
        <Topbar />
        <LoadError titleKey="product.loadError" bodyKey="error.network" onRetry={reload} />
      </>
    );
  }

  if (!store || !product) {
    return (
      <>
        <Topbar />
        <EmptyState
          title={t("product.notFound")}
          action={
            <Link to={store ? `/s/${store.slug}` : "/"} className={btn("primary")}>
              {store ? t("product.backStore") : t("store.backHome")}
            </Link>
          }
        />
      </>
    );
  }

  const text = productText(product, lang);
  const name = text.name || t("product.untitled");
  const price = hasPrice(product.price) ? money(product.price, store.currency) : null;
  const message = price ? t("product.orderMsg", { name, price }) : t("product.orderMsgNoPrice", { name });
  const whatsappUrl = whatsappLink(store.whatsapp, message);
  const demo = isDemoProduct(product, store.demo);
  const others = store.products.filter((p) => p.id !== product.id && isReady(p));

  return (
    <div style={brandStyle(store.brand)}>
      <Topbar />
      <main className="container-page pb-8 pt-5 sm:pt-8">
        <Link
          to={`/s/${store.slug}`}
          className="mb-4 inline-flex items-center gap-1.5 rounded-full py-1 pr-2 font-semibold text-ink-soft no-underline transition-colors hover:text-ink"
        >
          <LuArrowLeft aria-hidden="true" className="size-4" /> {store.name}
        </Link>
        <div className="grid gap-6 md:grid-cols-[1.2fr_1fr] md:items-start md:gap-10">
          <div className={`${card} p-1.5 md:sticky md:top-20`}>
            <Viewer360 frames={product.frames} label={name} />
          </div>
          <div className="flex flex-col items-start gap-3 md:pt-6">
            <h1 className="text-[clamp(2.2rem,7vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em]" lang={text.lang}>
              {name}
            </h1>
            {price && <p className="font-display text-3xl font-medium text-brand-strong">{price}</p>}
            {text.description && (
              <p className="max-w-prose text-lg text-ink-soft" lang={text.lang}>
                {text.description}
              </p>
            )}
            <ProvenanceBadge demo={demo} />
            <FidelityLine score={product.fidelityScore} checked={product.fidelityChecked} frames={product.frames.length} />
            {whatsappUrl ? (
              <a
                className={btn("whatsapp", "lg", "mt-3 w-full md:w-auto")}
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => sendEvent("click", store.slug, product.id)}
              >
                <LuMessageCircle aria-hidden="true" className="size-5" /> {t("product.order")}
              </a>
            ) : (
              <p className="text-sm text-ink-soft">{t("product.noWhatsapp")}</p>
            )}
            {store.demo && whatsappUrl && <p className="text-xs text-ink-soft">{t("product.demoWhatsapp")}</p>}
            {store.slug === EXAMPLE_SLUG && <RecordedNote />}
          </div>
        </div>

        {others.length > 0 && (
          <section className="py-12">
            <h2 className="mb-5 text-2xl font-medium sm:text-3xl">{t("product.more")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:max-w-2xl">
              {others.map((p) => (
                <ProductCard key={p.id} slug={store.slug} currency={store.currency} product={p} storeIsDemo={store.demo} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}
