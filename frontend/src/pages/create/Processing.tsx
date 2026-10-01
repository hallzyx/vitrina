import { useEffect, useRef, useState } from "react";
import { LuArrowRight, LuRadio } from "react-icons/lu";
import { ErrorNote } from "../../components/Chrome";
import { clock, ProgressBar, StepList, stepKey } from "../../components/Pipeline";
import { btn } from "../../components/ui";
import { accumulate, EMPTY_LIVE, liveModel, STEP, type LiveAccumulator } from "../../components/workbench/model";
import { Workbench } from "../../components/workbench/Workbench";
import { useI18n } from "../../i18n";
import { getStatus, isApiError, PIPELINE_STEPS, type SavedRun, type StatusResponse } from "../../lib/api";
import { apiErrorKey, isReady, pipelineErrorKey } from "../../lib/product";
import { Actions, ScreenTitle } from "./shared";

const POLL_MS = 2000;
const MAX_BACKOFF_MS = 15000;
/** After this many failed polls in a row, stop and let the user retry by hand. */
const MAX_FAILURES = 6;

/**
 * Live progress of a real pipeline run, polled every ~2 s until it is ready or fails. While the run reports
 * its previews, the creator watches them on the workbench; otherwise (or if the previews fail to load)
 * the plain step list is shown.
 */
export function Processing({ run, onReady, onRestart }: { run: SavedRun; onReady: () => void; onRestart: () => void }) {
  const { t } = useI18n();
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [live, setLive] = useState<LiveAccumulator>(EMPTY_LIVE);
  const [broken, setBroken] = useState(false);
  const [pollError, setPollError] = useState<unknown>(null);
  const [stopped, setStopped] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;
  const liveRef = useRef(live);
  const brokenRef = useRef(broken);
  brokenRef.current = broken;
  const finishedAt = useRef<number | null>(null);

  const finished = !!status && (isReady(status) || status.status === "failed");

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let failures = 0;
    const controller = new AbortController();
    const poll = async () => {
      try {
        const next = await getStatus(run.token, run.productId, controller.signal);
        if (cancelled) return;
        failures = 0;
        liveRef.current = accumulate(liveRef.current, next);
        setLive(liveRef.current);
        setStatus(next);
        setPollError(null);
        if (isReady(next)) {
          // The workbench ends on the finished piece and lets the creator continue; the plain list moves on by itself.
          if (!(liveRef.current.photos.length > 0 && !brokenRef.current)) timer = window.setTimeout(() => onReadyRef.current(), 900);
          return;
        }
        if (next.status === "failed") return;
        timer = window.setTimeout(poll, POLL_MS);
      } catch (err) {
        if (cancelled) return;
        setPollError(err);
        if (isApiError(err, 403) || isApiError(err, 404)) {
          setStopped(true);
          return;
        }
        failures += 1;
        if (failures >= MAX_FAILURES) {
          setStopped(true);
          return;
        }
        timer = window.setTimeout(poll, Math.min(POLL_MS * 2 ** failures, MAX_BACKOFF_MS));
      }
    };
    setStopped(false);
    void poll();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [run.token, run.productId, attempt]);

  useEffect(() => {
    if (finished) {
      finishedAt.current ??= Date.now();
      return;
    }
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [finished]);

  const failed = status?.status === "failed";
  const ready = !!status && isReady(status);
  const total = PIPELINE_STEPS.length;
  const index = ready ? total : Math.min(status?.stepIndex ?? 0, total - 1);
  const photos = status?.photos;
  const inBackground = status?.step === "background" && photos && photos.total > 0;
  const partial = inBackground ? photos.done / photos.total : 0;
  const percent = ready ? 100 : ((index + partial) / total) * 100;
  const elapsed = now - run.startedAt;

  // The workbench needs the run's previews: none reported yet past background removal means an older
  // backend or previews that could not be written, so the plain list is the honest view.
  const showBench = !!status && !broken && (live.photos.length > 0 || (live.seenLive && !ready && !failed && index <= STEP.background));

  return (
    <section>
      <ScreenTitle sub={t("processing.subtitle")}>{failed ? t("processing.failedTitle") : ready ? t("processing.readyTitle") : t("processing.title")}</ScreenTitle>
      {run.origin === "sample" && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full bg-terracotta/10 px-3 py-1 text-sm font-semibold text-terracotta-deep">
          <LuRadio aria-hidden="true" className="size-4" /> {t("processing.liveSample")}
        </p>
      )}
      {!showBench && (
        <>
          <ProgressBar percent={percent} label={t("processing.title")} />
          <p className="mb-4 flex justify-between text-sm text-ink-soft" aria-hidden="true">
            <span>{t("processing.stepOf", { n: Math.min(index + 1, total), total })}</span>
            <span className="tabular-nums">{t("processing.elapsed", { time: clock(elapsed) })}</span>
          </p>
        </>
      )}
      <p className="sr-only" role="status" aria-live="polite">
        {failed
          ? t("processing.failedTitle")
          : ready
            ? t("processing.readyTitle")
            : status?.step
              ? t(stepKey(status.step))
              : t("processing.title")}
      </p>
      {failed && (
        <div className="mb-4 grid gap-3 rounded-2xl border border-[#e7b9ad] bg-[#fdf0ec] px-4 py-4 text-[#5e1f0f]" role="alert">
          <p className="font-semibold">{t(pipelineErrorKey(status?.error?.code))}</p>
          <button type="button" className={btn("primary", "md", "w-full")} onClick={onRestart}>
            {run.origin === "sample" ? t("processing.tryOtherSample") : t("processing.tryOther")}
          </button>
        </div>
      )}
      {showBench && status ? (
        <Workbench
          model={liveModel(status, live)}
          clock={() => (finishedAt.current ?? Date.now()) - run.startedAt}
          onBroken={() => setBroken(true)}
        />
      ) : (
        <StepList
          current={index}
          failed={failed}
          detail={inBackground ? { background: t("processing.photos", { done: photos.done, total: photos.total }) } : {}}
        />
      )}
      {!failed && pollError !== null && (
        <ErrorNote
          className="mt-4"
          message={stopped ? t(apiErrorKey(pollError)) : t("processing.reconnecting")}
          onRetry={stopped && !isApiError(pollError, 403) ? () => setAttempt((n) => n + 1) : undefined}
        />
      )}
      {!finished && elapsed > 180_000 && pollError === null && <p className="mt-4 text-sm text-ink-soft">{t("processing.slow")}</p>}
      {ready ? (
        <Actions>
          <button type="button" className={btn("primary", "lg", "w-full")} onClick={() => onReadyRef.current()}>
            {t("bench.seeResult")} <LuArrowRight aria-hidden="true" className="size-4" />
          </button>
        </Actions>
      ) : (
        !failed && (
          <Actions>
            <button type="button" className={btn("ghost")} onClick={onRestart}>
              {t("processing.leave")}
            </button>
          </Actions>
        )
      )}
    </section>
  );
}
