import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { DemoBadge, FidelityLine, RecordedNote } from "../../components/Chrome";
import { ProgressBar, StepList } from "../../components/Pipeline";
import { btn, card } from "../../components/ui";
import { Viewer360 } from "../../components/Viewer360";
import { useI18n } from "../../i18n";
import { PIPELINE_STEPS, type Lang, type PipelineStep, type PublicProduct, type PublicStore, type ReplayTimings } from "../../lib/api";
import { hasPrice, productText } from "../../lib/product";
import { Actions, ScreenTitle } from "./shared";

/** A replay never takes longer than this per step: the real durations are shown next to each step instead. */
const MAX_STEP_MS = 4000;
const MIN_STEP_MS = 350;

interface PlanStep {
  step: PipelineStep;
  recordedMs: number;
  shownMs: number;
}

/** Real per-step timings of the recorded run, folded into the seven UI steps. */
export function replayPlan(replay: ReplayTimings): PlanStep[] {
  const totals = new Map<PipelineStep, number>();
  for (const entry of replay.steps ?? []) {
    if (!PIPELINE_STEPS.includes(entry.step)) continue;
    totals.set(entry.step, (totals.get(entry.step) ?? 0) + Math.max(0, Number(entry.ms) || 0));
  }
  return PIPELINE_STEPS.map((step) => {
    const recordedMs = totals.get(step) ?? 0;
    return { step, recordedMs, shownMs: Math.max(MIN_STEP_MS, Math.min(recordedMs, MAX_STEP_MS)) };
  });
}

function seconds(ms: number, lang: Lang): string {
  return `${(ms / 1000).toLocaleString(lang === "es" ? "es-PE" : "en-US", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`;
}

/** Animates the seven steps with the real timings of a recorded run. Clearly labeled as a replay. */
export function ReplayProcessing({ product, onDone }: { product: PublicProduct; onDone: () => void }) {
  const { t, lang } = useI18n();
  const plan = useMemo(() => replayPlan(product.replay ?? { totalMs: 0, steps: [] }), [product]);
  const [index, setIndex] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    if (index >= plan.length) {
      const id = window.setTimeout(() => onDoneRef.current(), 1200);
      return () => window.clearTimeout(id);
    }
    const id = window.setTimeout(() => setIndex((i) => i + 1), plan[index].shownMs);
    return () => window.clearTimeout(id);
  }, [index, plan]);

  const detail: Partial<Record<PipelineStep, string>> = {};
  plan.forEach((p, i) => {
    if (i < index) detail[p.step] = p.recordedMs > 0 ? seconds(p.recordedMs, lang) : "—";
  });
  const totalMs = product.replay?.totalMs || plan.reduce((sum, p) => sum + p.recordedMs, 0);
  const done = index >= plan.length;

  return (
    <section>
      <ScreenTitle>{t("replay.title")}</ScreenTitle>
      <RecordedNote>{t("replay.banner")}</RecordedNote>
      <ProgressBar percent={(index / plan.length) * 100} label={t("replay.title")} />
      <p className="sr-only" role="status" aria-live="polite">
        {done ? t("processing.readyTitle") : t(`processing.${plan[index].step}` as const)}
      </p>
      <StepList current={index} detail={detail} />
      <p className="mt-4 text-sm text-ink-soft">{t("replay.total", { time: seconds(totalMs, lang) })}</p>
      <Actions>
        <button type="button" className={btn(done ? "primary" : "ghost", "md", done ? "flex-1" : "")} onClick={onDone}>
          {done ? t("replay.seeResult") : t("replay.skip")}
        </button>
      </Actions>
    </section>
  );
}

/** Read-only result of a recorded run: there is no edit token, so nothing here can be changed or published. */
export function RecordedResult({
  store,
  product,
  onSamples,
  onCustom,
}: {
  store: PublicStore;
  product: PublicProduct;
  onSamples: () => void;
  onCustom: () => void;
}) {
  const { t, lang, money } = useI18n();
  const text = productText(product, lang);
  const langs: Lang[] = ["en", "es"];
  return (
    <section>
      <ScreenTitle>{t("replay.resultTitle")}</ScreenTitle>
      <RecordedNote>{t("replay.banner")}</RecordedNote>
      <div className={`${card} mt-4 p-1`}>
        <Viewer360 frames={product.frames} label={text.name} />
      </div>
      <div className="mt-3 grid gap-2">
        <DemoBadge />
        <FidelityLine score={product.fidelityScore} checked={product.fidelityChecked} frames={product.frames.length} />
      </div>

      <h2 className="mb-1 mt-6 text-2xl font-medium">{t("result.listing")}</h2>
      <p className="text-sm text-ink-soft">{t("replay.listingNote")}</p>
      <dl className="mt-3 grid gap-3">
        {langs.map((code) => {
          const block = product.copy?.[code];
          if (!block?.name) return null;
          return (
            <div key={code} className="rounded-2xl bg-paper px-4 py-3" lang={code}>
              <dt className="text-xs font-bold uppercase tracking-wider text-ink-soft">{code === "en" ? t("result.english") : t("result.spanish")}</dt>
              <dd className="font-display text-lg font-medium">{block.name}</dd>
              {block.description && <dd className="text-sm text-ink-soft">{block.description}</dd>}
            </div>
          );
        })}
      </dl>
      {hasPrice(product.price) && <p className="mt-3 text-sm text-ink-soft">{t("replay.price", { price: money(product.price, store.currency) })}</p>}

      <div className="mt-6 grid gap-2.5">
        <Link to={`/s/${store.slug}/${product.id}`} className={btn("primary", "md", "w-full")}>
          {t("replay.openExample")}
        </Link>
        <button type="button" className={btn("outline", "md", "w-full")} onClick={onCustom}>
          {t("choice.customTitle")}
        </button>
        <button type="button" className={btn("ghost", "md", "w-full")} onClick={onSamples}>
          {t("samples.others")}
        </button>
      </div>
    </section>
  );
}
