import { LuCheck, LuX } from "react-icons/lu";
import { useI18n, type TKey } from "../i18n";
import { PIPELINE_STEPS, type PipelineStep } from "../lib/api";

export function stepKey(step: PipelineStep): TKey {
  return `processing.${step}` as TKey;
}

export function stepIndexOf(step: PipelineStep | null | undefined): number {
  const index = PIPELINE_STEPS.indexOf((step ?? "validate") as PipelineStep);
  return index < 0 ? 0 : index;
}

interface StepListProps {
  /** Index of the step in progress (0-based). `PIPELINE_STEPS.length` means everything is done. */
  current: number;
  failed?: boolean;
  /** Extra text for a step, e.g. photo progress or a recorded duration. */
  detail?: Partial<Record<PipelineStep, string>>;
}

/** The seven real pipeline steps, with the current one highlighted. */
export function StepList({ current, failed = false, detail = {} }: StepListProps) {
  const { t } = useI18n();
  return (
    <ol className="grid gap-2">
      {PIPELINE_STEPS.map((step, i) => {
        const state = i < current ? "done" : i === current ? (failed ? "failed" : "active") : "todo";
        return (
          <li
            key={step}
            aria-current={state === "active" ? "step" : undefined}
            className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-colors duration-300 ${
              state === "active"
                ? "bg-terracotta/10 font-bold text-ink"
                : state === "failed"
                  ? "bg-[#fde0dc] font-bold text-[#7a2a16]"
                  : state === "done"
                    ? "bg-paper text-ink"
                    : "bg-paper text-ink-soft"
            }`}
          >
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                state === "done"
                  ? "border-olive bg-olive text-white"
                  : state === "active"
                    ? "animate-pulse-soft border-terracotta text-terracotta"
                    : state === "failed"
                      ? "border-[#b3261e] bg-[#b3261e] text-white"
                      : "border-[#d8cdbd]"
              }`}
              aria-hidden="true"
            >
              {state === "done" ? (
                <LuCheck className="size-3.5" strokeWidth={3.5} />
              ) : state === "failed" ? (
                <LuX className="size-3.5" strokeWidth={3.5} />
              ) : state === "active" ? (
                <span className="size-1.5 rounded-full bg-terracotta" />
              ) : null}
            </span>
            <span className="min-w-0 flex-1">{t(stepKey(step))}</span>
            <span className="sr-only">
              {state === "done" ? t("processing.stateDone") : state === "active" ? t("processing.stateActive") : state === "failed" ? t("processing.stateFailed") : ""}
            </span>
            {detail[step] && <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-soft">{detail[step]}</span>}
          </li>
        );
      })}
    </ol>
  );
}

export function ProgressBar({ percent, label }: { percent: number; label: string }) {
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="my-5 h-2.5 overflow-hidden rounded-full bg-paper-2" role="progressbar" aria-label={label} aria-valuenow={value} aria-valuemin={0} aria-valuemax={100}>
      <span
        className="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-terracotta),var(--color-ochre))] transition-[width] duration-700 ease-out-soft"
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

/** mm:ss */
export function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
