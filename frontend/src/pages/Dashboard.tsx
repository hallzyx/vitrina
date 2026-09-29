import { LuArrowRight, LuEye, LuKeyRound, LuMessageCircle, LuPlus } from "react-icons/lu";
import { Link, useParams } from "react-router-dom";
import { CopyButton, Footer, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { brandStyle } from "../components/ProductCard";
import { btn, card } from "../components/ui";
import { EXAMPLE_STORE, type Product } from "../data/mock";
import { useI18n, type TKey } from "../i18n";

const STATUS_STYLE: Record<Product["status"], string> = {
  ready_360: "bg-olive/15 text-olive-deep",
  processing: "bg-ochre/20 text-[#6b4a07]",
  failed: "bg-[#fde0dc] text-[#8a1f1f]",
};

export function Dashboard() {
  const { token } = useParams();
  const { t, l, money } = useI18n();
  const store = EXAMPLE_STORE;
  const views = store.products.reduce((sum, p) => sum + p.views, 0);
  const clicks = store.products.reduce((sum, p) => sum + p.clicks, 0);
  const storeUrl = `${window.location.origin}/s/${store.slug}`;
  const masked = token ? `${token.slice(0, 4)}••••••••` : "••••";

  const tiles: { value: number; label: TKey; icon: typeof LuEye }[] = [
    { value: views, label: "dash.views", icon: LuEye },
    { value: clicks, label: "dash.clicks", icon: LuMessageCircle },
    { value: store.products.length, label: "dash.products", icon: LuPlus },
  ];

  return (
    <div style={brandStyle(store)}>
      <Topbar />
      <main className="container-page pb-6 pt-6 sm:pt-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[clamp(2.2rem,7vw,3.4rem)] font-medium leading-none tracking-[-0.025em]">{t("dash.title")}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
              <LuKeyRound aria-hidden="true" className="size-4 text-brand-strong" /> {t("dash.session")} ·
              <code className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[0.85em]">{masked}</code>
            </p>
          </div>
          <Link to="/create?add=1" className={btn("brand")}>
            <LuPlus aria-hidden="true" className="size-4" /> {t("dash.add")}
          </Link>
        </header>

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={`${card} flex flex-col gap-1 px-3 py-4 sm:px-5 sm:py-5`}>
              <tile.icon aria-hidden="true" className="hidden size-5 text-ink-soft sm:block" />
              <span className="font-display text-[clamp(1.6rem,6vw,2.6rem)] font-medium leading-none tabular-nums text-brand-strong">
                {tile.value.toLocaleString()}
              </span>
              <span className="text-[0.78rem] leading-tight text-ink-soft sm:text-sm">{t(tile.label)}</span>
            </div>
          ))}
        </div>

        <section className="py-8">
          <h2 className="mb-4 text-2xl font-medium">{t("dash.products")}</h2>
          <ul className="mb-3 grid gap-2.5">
            {store.products.map((p) => (
              <li
                key={p.id}
                className={`${card} grid grid-cols-[56px_1fr_auto] items-center gap-x-3 gap-y-1 p-3 sm:grid-cols-[64px_1.4fr_1fr_auto_auto] sm:gap-x-5`}
              >
                <span className="row-span-3 size-14 overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_40%,#fff,#efe4d4)] sm:row-span-1 sm:size-16">
                  <PieceThumb piece={p.piece} size={120} />
                </span>
                <div className="flex min-w-0 flex-col">
                  <strong className="truncate font-display text-lg font-medium">{l(p.name)}</strong>
                  <span className="text-sm text-ink-soft">{money(p.price, store.currency)}</span>
                </div>
                <div className="col-start-2 flex items-center gap-3 text-sm text-ink-soft sm:col-start-auto">
                  <span className="inline-flex items-center gap-1">
                    <LuEye aria-hidden="true" className="size-4" /> {p.views}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <LuMessageCircle aria-hidden="true" className="size-4" /> {p.clicks}
                  </span>
                </div>
                <span
                  className={`col-start-2 justify-self-start whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold sm:col-start-auto ${STATUS_STYLE[p.status]}`}
                >
                  {t(`dash.status.${p.status}` as TKey)}
                </span>
                <Link
                  to={`/s/${store.slug}/${p.id}`}
                  className={btn("outline", "sm", "col-start-3 row-span-3 row-start-1 size-10 p-0! sm:col-start-auto sm:row-span-1 sm:row-start-auto")}
                >
                  <LuArrowRight aria-hidden="true" className="size-4" />
                  <span className="sr-only">{l(p.name)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-soft">{t("dash.addNote")}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-3 text-2xl font-medium">{t("dash.brand")}</h2>
            <p>
              <strong>{store.name}</strong> · {t(`tone.${store.tone}` as TKey)}
            </p>
            <div className="my-4 flex" aria-hidden="true">
              {store.colors.map((c) => (
                <span key={c} className="-ml-1.5 size-9 rounded-full border-[3px] border-card shadow-card first:ml-0" style={{ background: c }} />
              ))}
            </div>
            <p className="text-sm text-ink-soft">
              {t("dash.whatsapp")}: +{store.whatsapp}
            </p>
          </div>
          <div className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-3 text-2xl font-medium">{t("dash.share")}</h2>
            <div className="mb-4 flex gap-2">
              <input readOnly value={storeUrl} aria-label={t("publish.storeLink")} className="min-w-0 flex-1 text-sm" />
              <CopyButton text={storeUrl} />
            </div>
            <Link to="/s/example" className={btn("outline", "sm")}>
              {t("publish.openStore")}
            </Link>
          </div>
        </section>
        <p className="mt-6 text-sm text-ink-soft">{t("dash.demoNote")}</p>
      </main>
      <Footer />
    </div>
  );
}
