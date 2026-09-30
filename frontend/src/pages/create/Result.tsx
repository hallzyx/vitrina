import { useEffect, useState } from "react";
import { LuRadio } from "react-icons/lu";
import { ErrorNote, FidelityLine, LoadError, ProvenanceBadge, Skeleton, Spinner } from "../../components/Chrome";
import { BrandEditor, ContactFields, isValidWhatsapp, whatsappDigits, type BrandDraft } from "../../components/StoreForms";
import { btn, card, label } from "../../components/ui";
import { Viewer360 } from "../../components/Viewer360";
import { useI18n, type TKey } from "../../i18n";
import {
  getMe,
  isApiError,
  publishStore,
  TONES,
  updateProduct,
  updateStore,
  type MeResponse,
  type OwnerProduct,
  type SavedRun,
  type Tone,
} from "../../lib/api";
import { apiErrorKey, brandStyle, isDemoProduct, isReady, paletteOf } from "../../lib/product";
import { useRemote } from "../../lib/useRemote";
import { ScreenTitle } from "./shared";

interface Listing {
  nameEn: string;
  descEn: string;
  nameEs: string;
  descEs: string;
  price: string;
}

function listingOf(product: OwnerProduct): Listing {
  const fallback = product.name ?? "";
  return {
    nameEn: product.copy?.en?.name || product.copy?.es?.name || fallback,
    descEn: product.copy?.en?.description ?? "",
    nameEs: product.copy?.es?.name || product.copy?.en?.name || fallback,
    descEs: product.copy?.es?.description ?? "",
    price: typeof product.price === "number" ? String(product.price) : "",
  };
}

type Busy = null | "save" | "publish";

/** Review the finished piece, edit the listing and brand, add WhatsApp and publish. */
export function Result({ run, onPublished }: { run: SavedRun; onPublished: (slug: string, wasPublished: boolean) => void }) {
  const { t } = useI18n();
  const { data, error, loading, reload } = useRemote((signal) => getMe(run.token, signal), [run.token]);

  if (!data && loading) {
    return (
      <div className="grid gap-4" aria-busy="true">
        <p className="sr-only" role="status">
          {t("common.loading")}
        </p>
        <Skeleton className="h-9 w-3/4" />
        <Skeleton className="aspect-square" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (!data) return <LoadError titleKey="result.loadError" bodyKey={apiErrorKey(error)} onRetry={reload} />;
  const product = data.products.find((p) => p.id === run.productId);
  if (!product || !isReady(product)) return <LoadError titleKey="result.loadError" bodyKey="error.notFound" onRetry={reload} />;
  return <ResultForm run={run} me={data} product={product} onPublished={onPublished} />;
}

function ResultForm({ run, me, product, onPublished }: { run: SavedRun; me: MeResponse; product: OwnerProduct; onPublished: (slug: string, wasPublished: boolean) => void }) {
  const { t } = useI18n();
  const { store } = me;
  const [listing, setListing] = useState<Listing>(() => listingOf(product));
  const [brand, setBrand] = useState<BrandDraft>(() => ({
    name: store.name,
    tone: (TONES as readonly string[]).includes(store.brand?.tone ?? "") ? (store.brand.tone as Tone) : "warm",
    colors: paletteOf(store.brand),
  }));
  const [whatsapp, setWhatsapp] = useState(store.whatsapp ? `+${store.whatsapp}` : "");
  const [currency, setCurrency] = useState(store.currency || "USD");
  const [busy, setBusy] = useState<Busy>(null);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; key: TKey } | null>(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    setMessage(null);
  }, [listing, brand, whatsapp, currency]);

  const demo = run.origin === "sample" || isDemoProduct(product, store.demo);
  const set = (field: keyof Listing) => (value: string) => setListing((l) => ({ ...l, [field]: value }));
  const priceValue = listing.price.trim() === "" ? undefined : Number(listing.price);
  const priceInvalid = priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0);
  const namesMissing = !listing.nameEn.trim() || !listing.nameEs.trim();
  const storeNameMissing = !brand.name.trim();
  const whatsappInvalid = whatsapp.trim() !== "" && !isValidWhatsapp(whatsapp);
  const invalid = priceInvalid || namesMissing || storeNameMissing || whatsappInvalid;

  const saveAll = async () => {
    await updateProduct(run.token, product.id, {
      copy: {
        en: { name: listing.nameEn.trim(), description: listing.descEn.trim() },
        es: { name: listing.nameEs.trim(), description: listing.descEs.trim() },
      },
      ...(priceValue !== undefined ? { price: priceValue } : {}),
    });
    await updateStore(run.token, {
      name: brand.name.trim(),
      currency,
      brand: { colors: brand.colors, tone: brand.tone, ...(store.brand?.displayName ? { displayName: store.brand.displayName } : {}) },
      ...(whatsapp.trim() ? { whatsapp: whatsappDigits(whatsapp) } : {}),
    });
  };

  const act = async (kind: "save" | "publish") => {
    setTouched(true);
    if (invalid || busy) return;
    if (kind === "publish" && !whatsapp.trim()) {
      setMessage({ kind: "error", key: "result.whatsappRequired" });
      return;
    }
    setBusy(kind);
    setMessage(null);
    try {
      await saveAll();
      if (kind === "save") {
        setMessage({ kind: "ok", key: "result.saved" });
      } else {
        const published = await publishStore(run.token);
        onPublished(published.slug, store.status === "published");
        return;
      }
    } catch (err) {
      if (isApiError(err, 400, "whatsapp_required")) setMessage({ kind: "error", key: "result.whatsappRequired" });
      else if (isApiError(err, 400, "no_ready_products")) setMessage({ kind: "error", key: "result.noReady" });
      else setMessage({ kind: "error", key: apiErrorKey(err) });
    }
    setBusy(null);
  };

  return (
    <section style={brandStyle({ colors: brand.colors })}>
      <ScreenTitle>{t("result.title")}</ScreenTitle>
      {run.origin === "sample" && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-terracotta/10 px-3 py-1 text-sm font-semibold text-terracotta-deep">
          <LuRadio aria-hidden="true" className="size-4" /> {t("result.liveSample")}
        </p>
      )}
      <div className={`${card} p-1`}>
        <Viewer360 frames={product.frames} label={listing.nameEn || listing.nameEs} />
      </div>
      <div className="mb-1 mt-3 grid gap-2">
        <ProvenanceBadge demo={demo} />
        <FidelityLine score={product.fidelityScore} checked={product.fidelityChecked} frames={product.frames.length} />
      </div>

      <form
        className="contents"
        onSubmit={(e) => {
          e.preventDefault();
          void act("publish");
        }}
        noValidate
      >
        <h2 className="mb-1 mt-6 text-2xl font-medium">{t("result.listing")}</h2>
        <p className="text-sm text-ink-soft">{t("result.listingNote")}</p>
        <div className="my-4 grid gap-4">
          <fieldset className="grid gap-3 rounded-2xl border border-line p-3.5" lang="en">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">{t("result.english")}</legend>
            <label className={label}>
              {t("result.name")}
              <input value={listing.nameEn} onChange={(e) => set("nameEn")(e.target.value)} maxLength={80} aria-invalid={touched && !listing.nameEn.trim()} />
            </label>
            <label className={label}>
              {t("result.description")}
              <textarea value={listing.descEn} onChange={(e) => set("descEn")(e.target.value)} rows={3} maxLength={400} />
            </label>
          </fieldset>
          <fieldset className="grid gap-3 rounded-2xl border border-line p-3.5" lang="es">
            <legend className="px-1 text-xs font-bold uppercase tracking-wider text-ink-soft">{t("result.spanish")}</legend>
            <label className={label}>
              {t("result.name")}
              <input value={listing.nameEs} onChange={(e) => set("nameEs")(e.target.value)} maxLength={80} aria-invalid={touched && !listing.nameEs.trim()} />
            </label>
            <label className={label}>
              {t("result.description")}
              <textarea value={listing.descEs} onChange={(e) => set("descEs")(e.target.value)} rows={3} maxLength={400} />
            </label>
          </fieldset>
          {touched && namesMissing && <p className="text-sm font-semibold text-terracotta-deep">{t("result.namesRequired")}</p>}
          <label className={label}>
            {t("result.price", { currency })}
            <input value={listing.price} onChange={(e) => set("price")(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="48" aria-invalid={priceInvalid} />
            {priceInvalid && <small className="font-semibold text-terracotta-deep">{t("result.priceInvalid")}</small>}
          </label>
        </div>

        <h2 className="mb-1 mt-6 text-2xl font-medium">{t("brand.title")}</h2>
        <p className="mb-4 text-sm text-ink-soft">{t("brand.subtitle")}</p>
        <BrandEditor idPrefix="result" value={brand} onChange={setBrand} suggestedName={store.brand?.displayName} />

        <h2 className="mb-4 mt-8 text-2xl font-medium">{t("publish.title")}</h2>
        <ContactFields
          whatsapp={whatsapp}
          currency={currency}
          onWhatsapp={setWhatsapp}
          onCurrency={setCurrency}
          whatsappError={touched && whatsappInvalid ? t("publish.whatsappInvalid") : undefined}
        />

        <div className="mt-4 min-h-6" aria-live="polite">
          {message?.kind === "ok" && (
            <p className="text-sm font-semibold text-olive-deep" role="status">
              {t(message.key)}
            </p>
          )}
          {message?.kind === "error" && <ErrorNote message={t(message.key)} />}
          {touched && invalid && !message && <ErrorNote message={t("result.fixFields")} />}
        </div>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button type="button" className={btn("outline")} onClick={() => void act("save")} disabled={!!busy}>
            {busy === "save" && <Spinner className="size-4" />}
            {t("result.saveDraft")}
          </button>
          <button type="submit" className={btn("primary", "md", "flex-1")} disabled={!!busy}>
            {busy === "publish" && <Spinner className="size-4 border-white/40 border-t-white" />}
            {store.status === "published" ? t("result.update") : t("publish.cta")}
          </button>
        </div>
      </form>
    </section>
  );
}
