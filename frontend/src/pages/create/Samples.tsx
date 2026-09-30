import { useEffect, useMemo, useState } from "react";
import { LuBox, LuHistory, LuPlay } from "react-icons/lu";
import { Link } from "react-router-dom";
import { ErrorNote, Skeleton, Spinner } from "../../components/Chrome";
import { btn } from "../../components/ui";
import { useI18n } from "../../i18n";
import {
  getExampleStore,
  getSamples,
  isApiError,
  runSample,
  samplePhoto,
  type PublicProduct,
  type PublicStore,
  type SampleSet,
  type SavedRun,
} from "../../lib/api";
import { apiErrorKey } from "../../lib/product";
import { useRemote } from "../../lib/useRemote";
import { CaptureRing } from "./CaptureRing";
import { Actions, ScreenTitle } from "./shared";

/** Gallery of the sample photo sets (renders of CC0 3D scans). No invite phrase needed. */
export function SampleGallery({ onPick, onBack }: { onPick: (sample: SampleSet) => void; onBack: () => void }) {
  const { t, l } = useI18n();
  const { data: samples, error, loading, reload } = useRemote((signal) => getSamples(signal), []);

  return (
    <section>
      <ScreenTitle sub={t("samples.subtitle")}>{t("samples.title")}</ScreenTitle>
      <p className="mb-4 flex items-start gap-2 rounded-2xl border border-ochre/50 bg-ochre/15 px-3.5 py-2.5 text-sm text-[#5b3f06]" role="note">
        <LuBox aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        {t("samples.honesty")}
      </p>
      {loading && !samples && (
        <div className="grid grid-cols-2 gap-2.5" aria-busy="true">
          <p className="sr-only" role="status">
            {t("common.loading")}
          </p>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="aspect-[4/5]" />
          ))}
        </div>
      )}
      {error !== null && !samples && <ErrorNote message={t(apiErrorKey(error))} onRetry={reload} />}
      {samples && samples.length === 0 && <p className="text-ink-soft">{t("samples.empty")}</p>}
      {samples && samples.length > 0 && (
        <ul className="grid grid-cols-2 gap-2.5">
          {samples.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                onClick={() => onPick(s)}
                className="group flex h-full w-full cursor-pointer flex-col overflow-hidden rounded-2xl border border-line bg-white text-left transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-card"
              >
                <span className="block aspect-square overflow-hidden bg-paper-2">
                  <img
                    src={samplePhoto(s.id, 1)}
                    alt=""
                    loading="lazy"
                    decoding="async"
                    className="block size-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </span>
                <span className="flex flex-1 flex-col gap-0.5 p-2.5">
                  <span className="font-display text-base font-medium leading-tight text-ink">{l(s.name)}</span>
                  <span className="text-[0.72rem] font-semibold uppercase tracking-wide text-[#6b4a07]">{t("samples.kind")}</span>
                  <span className="text-[0.7rem] leading-snug text-ink-soft">{s.credit}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <Actions>
        <button type="button" className={btn("ghost")} onClick={onBack}>
          {t("common.back")}
        </button>
      </Actions>
    </section>
  );
}

type ReplayOffer = { state: "loading" } | { state: "ready"; store: PublicStore; product: PublicProduct } | { state: "unavailable" };

/**
 * One sample set: its photos fill the capture ring, then "Process live" starts a real run.
 * When today's live runs are used up (`sample_cap`), it offers a replay of a recorded run instead.
 */
export function SampleDetail({
  sample,
  onBack,
  onStarted,
  onReplay,
}: {
  sample: SampleSet;
  onBack: () => void;
  onStarted: (run: SavedRun) => void;
  onReplay: (store: PublicStore, product: PublicProduct) => void;
}) {
  const { t, l } = useI18n();
  const photos = useMemo(() => Array.from({ length: sample.photos }, (_, i) => samplePhoto(sample.id, i + 1)), [sample]);
  const reduced = useMemo(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches, []);
  const [shown, setShown] = useState(reduced ? photos.length : 0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [offer, setOffer] = useState<ReplayOffer | null>(null);

  // Photos drop into the ring one by one, like a capture session.
  useEffect(() => {
    if (shown >= photos.length) return;
    const id = window.setTimeout(() => setShown((n) => n + 1), 110);
    return () => window.clearTimeout(id);
  }, [shown, photos.length]);

  const loadReplay = () => {
    setOffer({ state: "loading" });
    getExampleStore({ fresh: true })
      .then((store) => {
        const product = store.products.find((p) => p.sampleId === sample.id && p.frames.length > 0);
        setOffer(product?.replay?.steps?.length ? { state: "ready", store, product } : { state: "unavailable" });
      })
      .catch(() => setOffer({ state: "unavailable" }));
  };

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const run = await runSample(sample.id, t("samples.storeName"));
      onStarted({ token: run.editToken, productId: run.productId, slug: run.slug, origin: "sample", sampleId: sample.id, startedAt: Date.now() });
    } catch (err) {
      setBusy(false);
      if (isApiError(err, 429, "sample_cap")) loadReplay();
      else setError(err);
    }
  };

  return (
    <section>
      <ScreenTitle sub={t("samples.detail", { n: sample.photos })}>{l(sample.name)}</ScreenTitle>
      <CaptureRing photos={photos.slice(0, shown)} center={photos[0]} />
      <p className="mb-4 text-center text-xs text-ink-soft">
        {t("samples.kind")} · {sample.credit}
      </p>

      {offer ? (
        <div className="grid gap-3 rounded-2xl border border-line bg-paper px-4 py-4" role="status">
          <p className="flex items-start gap-2 font-semibold">
            <LuHistory aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-terracotta-deep" />
            {t("samples.capTitle")}
          </p>
          <p className="text-sm text-ink-soft">{t("samples.capBody")}</p>
          {offer.state === "loading" && (
            <p className="flex items-center gap-2 text-sm text-ink-soft">
              <Spinner className="size-4" /> {t("common.loading")}
            </p>
          )}
          {offer.state === "ready" && (
            <button type="button" className={btn("primary", "md", "w-full")} onClick={() => onReplay(offer.store, offer.product)}>
              <LuHistory aria-hidden="true" className="size-4" /> {t("samples.watchReplay")}
            </button>
          )}
          {offer.state === "unavailable" && (
            <>
              <p className="text-sm font-semibold text-ink">{t("samples.replayUnavailable")}</p>
              <Link to="/s/example" className={btn("outline", "md", "w-full")}>
                {t("nav.example")}
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <button type="button" className={btn("primary", "lg", "w-full")} onClick={start} disabled={busy || shown < photos.length}>
            {busy ? <Spinner className="size-4 border-white/40 border-t-white" /> : <LuPlay aria-hidden="true" className="size-4" />}
            {busy ? t("samples.starting") : t("samples.processLive")}
          </button>
          <p className="mt-2 text-center text-xs text-ink-soft">{t("samples.liveNote")}</p>
          {error !== null && <ErrorNote className="mt-3" message={t(apiErrorKey(error))} onRetry={start} />}
        </>
      )}

      <Actions>
        <button type="button" className={btn("ghost")} onClick={onBack} disabled={busy}>
          {t("samples.others")}
        </button>
      </Actions>
    </section>
  );
}
