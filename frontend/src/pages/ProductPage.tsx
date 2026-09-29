import { LuArrowLeft, LuMessageCircle } from "react-icons/lu";
import { Link, useParams } from "react-router-dom";
import { EmptyState, Footer, RealBadge, Topbar } from "../components/Chrome";
import { brandStyle, ProductCard } from "../components/ProductCard";
import { btn, card } from "../components/ui";
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
        <EmptyState
          title={t("product.notFound")}
          action={
            <Link to={store ? `/s/${store.slug}` : "/"} className={btn("primary")}>
              {t("product.backStore")}
            </Link>
          }
        />
      </>
    );
  }

  const price = money(product.price, store.currency);
  const message = t("product.orderMsg", { name: l(product.name), price });
  const whatsappUrl = `https://wa.me/${store.whatsapp}?text=${encodeURIComponent(message)}`;
  const others = store.products.filter((p) => p.id !== product.id);

  return (
    <div style={brandStyle(store)}>
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
            <Viewer360 piece={product.piece} />
          </div>
          <div className="flex flex-col items-start gap-3 md:pt-6">
            <h1 className="text-[clamp(2.2rem,7vw,3.6rem)] font-medium leading-[1.02] tracking-[-0.025em]">{l(product.name)}</h1>
            <p className="font-display text-3xl font-medium text-brand-strong">{price}</p>
            <p className="max-w-prose text-lg text-ink-soft">{l(product.description)}</p>
            <RealBadge />
            <p className="text-sm text-ink-soft">
              {t("product.fidelity", { score: product.fidelity.toFixed(2) })} · {t("product.frames", { n: product.frames })}
            </p>
            <a className={btn("whatsapp", "lg", "mt-3 w-full md:w-auto")} href={whatsappUrl} target="_blank" rel="noopener noreferrer">
              <LuMessageCircle aria-hidden="true" className="size-5" /> {t("product.order")}
            </a>
          </div>
        </div>

        {others.length > 0 && (
          <section className="py-12">
            <h2 className="mb-5 text-2xl font-medium sm:text-3xl">{t("product.more")}</h2>
            <div className="grid grid-cols-2 gap-3 sm:gap-5 md:max-w-2xl">
              {others.map((p) => (
                <ProductCard key={p.id} store={store} product={p} size={240} />
              ))}
            </div>
          </section>
        )}
      </main>
      <Footer>{t("store.powered")}</Footer>
    </div>
  );
}
