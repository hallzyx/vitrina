import { useEffect, useState, type FormEvent } from "react";
import { LuArrowRight, LuBox, LuEye, LuImageOff, LuKeyRound, LuMessageCircle, LuPackage, LuPlus } from "react-icons/lu";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CopyButton, EmptyState, ErrorNote, Footer, LoadError, RecordedNote, Skeleton, Spinner, Topbar } from "../components/Chrome";
import { stepIndexOf, stepKey } from "../components/Pipeline";
import { BrandEditor, ContactFields, isValidWhatsapp, whatsappDigits, type BrandDraft } from "../components/StoreForms";
import { btn, card } from "../components/ui";
import { useI18n, type TKey } from "../i18n";
import {
  getMe,
  isApiError,
  PIPELINE_STEPS,
  publishStore,
  saveSessionToken,
  TONES,
  updateStore,
  type MeResponse,
  type OwnerProduct,
  type OwnerStore,
  type Tone,
} from "../lib/api";
import { apiErrorKey, brandStyle, hasPrice, isDemoProduct, isReady, paletteOf, pipelineErrorKey, productText, thumbOf } from "../lib/product";
import { useRemote } from "../lib/useRemote";

const POLL_MS = 4000;

const STATUS_STYLE: Record<string, string> = {
  ready: "bg-olive/15 text-olive-deep",
  processing: "bg-ochre/20 text-[#6b4a07]",
  uploading: "bg-paper-2 text-ink-soft",
  failed: "bg-[#fde0dc] text-[#8a1f1f]",
};

export function Dashboard() {
  const { token = "" } = useParams();
  const { t } = useI18n();
  const remote = useRemote((signal) => getMe(token, signal), [token]);
  const { data, error, loading, reload } = remote;
  const [live, setLive] = useState<MeResponse | null>(null);
  const me = live ?? data;

  useEffect(() => {
    if (data) setLive(data);
  }, [data]);

  // Keep the list fresh while any product is still being processed.
  const processing = !!me?.products.some((p) => p.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const controller = new AbortController();
    const id = window.setInterval(() => {
      getMe(token, controller.signal)
        .then(setLive)
        .catch(() => undefined);
    }, POLL_MS);
    return () => {
      window.clearInterval(id);
      controller.abort();
    };
  }, [processing, token]);

  if (!me && loading) return <DashboardSkeleton />;

  if (!me) {
    if (isApiError(error, 403) || isApiError(error, 401)) {
      return (
        <>
          <Topbar />
          <EmptyState
            code={null}
            title={t("dash.invalidTitle")}
            body={t("dash.invalidBody")}
            action={
              <>
                <Link to="/create" className={btn("primary")}>
                  {t("nav.create")}
                </Link>
                <Link to="/" className={btn("outline")}>
                  {t("store.backHome")}
                </Link>
              </>
            }
          />
        </>
      );
    }
    return (
      <>
        <Topbar />
        <LoadError titleKey="dash.loadError" bodyKey={apiErrorKey(error)} onRetry={reload} />
      </>
    );
  }

  return <DashboardView token={token} me={me} onChange={setLive} />;
}

function DashboardView({ token, me, onChange }: { token: string; me: MeResponse; onChange: (me: MeResponse) => void }) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { store, products, stats } = me;
  const storePath = `/s/${store.slug}`;
  const storeUrl = `${window.location.origin}${storePath}`;
  const published = store.status === "published";
  const masked = `${token.slice(0, 4)}••••••••`;

  const tiles: { value: number; label: TKey; icon: typeof LuEye }[] = [
    { value: stats.views, label: "dash.views", icon: LuEye },
    { value: stats.clicks, label: "dash.clicks", icon: LuMessageCircle },
    { value: products.length, label: "dash.products", icon: LuPackage },
  ];

  const addProduct = () => {
    saveSessionToken(token);
    navigate("/create?add=1");
  };

  return (
    <div style={brandStyle(store.brand)}>
      <Topbar />
      <main className="container-page pb-6 pt-6 sm:pt-10">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="mb-1 text-sm font-semibold text-brand-strong">{t("dash.title")}</p>
            <h1 className="break-words text-[clamp(2.2rem,7vw,3.4rem)] font-medium leading-none tracking-[-0.025em]">{store.name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm text-ink-soft">
              <LuKeyRound aria-hidden="true" className="size-4 text-brand-strong" /> {t("dash.session")} ·
              <code className="rounded-md bg-paper-2 px-1.5 py-0.5 text-[0.85em]">{masked}</code>
            </p>
          </div>
          <button type="button" onClick={addProduct} className={btn("brand")}>
            <LuPlus aria-hidden="true" className="size-4" /> {t("dash.add")}
          </button>
        </header>

        {store.demo && (
          <div className="mb-5 grid gap-2">
            <RecordedNote>{t("dash.demoStore")}</RecordedNote>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {tiles.map((tile) => (
            <div key={tile.label} className={`${card} flex flex-col gap-1 px-3 py-4 sm:px-5 sm:py-5`}>
              <tile.icon aria-hidden="true" className="hidden size-5 text-ink-soft sm:block" />
              <span className="font-display text-[clamp(1.6rem,6vw,2.6rem)] font-medium leading-none tabular-nums text-brand-strong">{tile.value.toLocaleString()}</span>
              <span className="text-[0.78rem] leading-tight text-ink-soft sm:text-sm">{t(tile.label)}</span>
            </div>
          ))}
        </div>

        <section className="py-8">
          <h2 className="mb-4 text-2xl font-medium">{t("dash.products")}</h2>
          {products.length === 0 ? (
            <p className="rounded-card border border-dashed border-line px-5 py-8 text-center text-ink-soft">{t("dash.noProducts")}</p>
          ) : (
            <ul className="mb-3 grid gap-2.5">
              {products.map((p) => (
                <ProductRow key={p.id} product={p} store={store} counts={stats.products[p.id]} />
              ))}
            </ul>
          )}
          <p className="text-sm text-ink-soft">{t("dash.addNote")}</p>
        </section>

        <section className="grid gap-4 md:grid-cols-2 md:items-start">
          <StoreSettings token={token} me={me} onChange={onChange} />
          <div className={`${card} p-5 sm:p-6`}>
            <h2 className="mb-3 text-2xl font-medium">{t("dash.share")}</h2>
            {published ? (
              <>
                <div className="mb-4 flex gap-2">
                  <input readOnly value={storeUrl} aria-label={t("publish.storeLink")} className="min-w-0 flex-1 text-sm" />
                  <CopyButton text={storeUrl} />
                </div>
                <Link to={storePath} className={btn("outline", "sm")}>
                  {t("publish.openStore")}
                  <LuArrowRight aria-hidden="true" className="size-4" />
                </Link>
              </>
            ) : (
              <PublishNow token={token} me={me} onChange={onChange} />
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}

function ProductRow({ product, store, counts }: { product: OwnerProduct; store: OwnerStore; counts?: { views: number; clicks: number } }) {
  const { t, lang, money } = useI18n();
  const text = productText(product, lang);
  const thumb = thumbOf(product);
  const ready = isReady(product);
  const statusKey = ready ? "ready" : product.status === "processing" || product.status === "failed" || product.status === "uploading" ? product.status : "processing";
  const demo = isDemoProduct(product, store.demo);
  const linkable = ready && store.status === "published";
  return (
    <li className={`${card} grid grid-cols-[56px_1fr_auto] items-center gap-x-3 gap-y-1 p-3 sm:grid-cols-[64px_1.4fr_1fr_auto_auto] sm:gap-x-5`}>
      <span className="row-span-3 grid size-14 place-items-center overflow-hidden rounded-xl bg-[radial-gradient(circle_at_50%_40%,#fff,#efe4d4)] sm:row-span-1 sm:size-16">
        {thumb ? <img src={thumb} alt="" loading="lazy" className="block size-full object-contain" /> : <LuImageOff aria-hidden="true" className="size-5 text-ink-soft" />}
      </span>
      <div className="flex min-w-0 flex-col">
        <strong className="truncate font-display text-lg font-medium" lang={text.lang}>
          {text.name || t("product.untitled")}
        </strong>
        <span className="flex flex-wrap items-center gap-x-2 text-sm text-ink-soft">
          {hasPrice(product.price) && <span>{money(product.price, store.currency)}</span>}
          {demo && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#6b4a07]">
              <LuBox aria-hidden="true" className="size-3" /> {t("badge.demoShort")}
            </span>
          )}
        </span>
      </div>
      <div className="col-start-2 flex items-center gap-3 text-sm text-ink-soft sm:col-start-auto">
        <span className="inline-flex items-center gap-1">
          <LuEye aria-hidden="true" className="size-4" /> {counts?.views ?? 0}
          <span className="sr-only">{t("dash.views")}</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <LuMessageCircle aria-hidden="true" className="size-4" /> {counts?.clicks ?? 0}
          <span className="sr-only">{t("dash.clicks")}</span>
        </span>
      </div>
      <div className="col-start-2 flex flex-col items-start gap-1 sm:col-start-auto">
        <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[statusKey]}`}>{t(`dash.status.${statusKey}` as TKey)}</span>
        {product.status === "processing" && (
          <span className="text-xs text-ink-soft" role="status">
            {t("processing.stepOf", { n: stepIndexOf(product.step) + 1, total: PIPELINE_STEPS.length })} · {t(stepKey(product.step ?? "validate"))}
          </span>
        )}
        {product.status === "failed" && <span className="max-w-xs text-xs text-[#8a1f1f]">{t(pipelineErrorKey(product.error?.code))}</span>}
      </div>
      {linkable ? (
        <Link
          to={`/s/${store.slug}/${product.id}`}
          className={btn("outline", "sm", "col-start-3 row-span-3 row-start-1 size-10 p-0! sm:col-start-auto sm:row-span-1 sm:row-start-auto")}
        >
          <LuArrowRight aria-hidden="true" className="size-4" />
          <span className="sr-only">{t("dash.openProduct", { name: text.name || t("product.untitled") })}</span>
        </Link>
      ) : (
        <span className="col-start-3 row-span-3 row-start-1 size-10 sm:col-start-auto sm:row-span-1 sm:row-start-auto" aria-hidden="true" />
      )}
    </li>
  );
}

function StoreSettings({ token, me, onChange }: { token: string; me: MeResponse; onChange: (me: MeResponse) => void }) {
  const { t } = useI18n();
  const { store } = me;
  const [brand, setBrand] = useState<BrandDraft>(() => ({
    name: store.name,
    tone: (TONES as readonly string[]).includes(store.brand?.tone ?? "") ? (store.brand.tone as Tone) : "warm",
    colors: paletteOf(store.brand),
  }));
  const [whatsapp, setWhatsapp] = useState(store.whatsapp ? `+${store.whatsapp}` : "");
  const [currency, setCurrency] = useState(store.currency || "USD");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; key: TKey } | null>(null);

  useEffect(() => {
    setMessage(null);
  }, [brand, whatsapp, currency]);

  const whatsappInvalid = whatsapp.trim() !== "" && !isValidWhatsapp(whatsapp);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    if (!brand.name.trim() || whatsappInvalid) {
      setMessage({ kind: "error", key: "result.fixFields" });
      return;
    }
    setBusy(true);
    try {
      const { store: updated } = await updateStore(token, {
        name: brand.name.trim(),
        currency,
        brand: { colors: brand.colors, tone: brand.tone, ...(store.brand?.displayName ? { displayName: store.brand.displayName } : {}) },
        ...(whatsapp.trim() ? { whatsapp: whatsappDigits(whatsapp) } : {}),
      });
      onChange({ ...me, store: updated });
      setMessage({ kind: "ok", key: "result.saved" });
    } catch (err) {
      setMessage({ kind: "error", key: apiErrorKey(err) });
    }
    setBusy(false);
  };

  return (
    <form className={`${card} grid gap-4 p-5 sm:p-6`} onSubmit={save} noValidate>
      <h2 className="text-2xl font-medium">{t("dash.settings")}</h2>
      <BrandEditor idPrefix="dash" value={brand} onChange={setBrand} suggestedName={store.brand?.displayName} />
      <ContactFields
        whatsapp={whatsapp}
        currency={currency}
        onWhatsapp={setWhatsapp}
        onCurrency={setCurrency}
        whatsappError={whatsappInvalid ? t("publish.whatsappInvalid") : undefined}
      />
      <div aria-live="polite" className="min-h-6">
        {message?.kind === "ok" && (
          <p className="text-sm font-semibold text-olive-deep" role="status">
            {t(message.key)}
          </p>
        )}
        {message?.kind === "error" && <ErrorNote message={t(message.key)} />}
      </div>
      <button type="submit" className={btn("brand", "md", "justify-self-start")} disabled={busy}>
        {busy && <Spinner className="size-4 border-white/40 border-t-white" />}
        {t("dash.save")}
      </button>
    </form>
  );
}

function PublishNow({ token, me, onChange }: { token: string; me: MeResponse; onChange: (me: MeResponse) => void }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<TKey | null>(null);
  const publish = async () => {
    setBusy(true);
    setError(null);
    try {
      await publishStore(token);
      onChange({ ...me, store: { ...me.store, status: "published" } });
    } catch (err) {
      if (isApiError(err, 400, "whatsapp_required")) setError("result.whatsappRequired");
      else if (isApiError(err, 400, "no_ready_products")) setError("result.noReady");
      else setError(apiErrorKey(err));
    }
    setBusy(false);
  };
  return (
    <div className="grid gap-3">
      <p className="text-ink-soft">{t("dash.draft")}</p>
      {error && <ErrorNote message={t(error)} />}
      <button type="button" className={btn("brand", "md", "justify-self-start")} onClick={publish} disabled={busy}>
        {busy && <Spinner className="size-4 border-white/40 border-t-white" />}
        {t("publish.cta")}
      </button>
    </div>
  );
}

function DashboardSkeleton() {
  const { t } = useI18n();
  return (
    <>
      <Topbar />
      <main className="container-page grid gap-5 pb-6 pt-6 sm:pt-10" aria-busy="true">
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
        <Skeleton className="h-12 w-2/3 max-w-sm" />
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        {[0, 1].map((i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </main>
    </>
  );
}
