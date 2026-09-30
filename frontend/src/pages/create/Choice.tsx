import { LuArrowRight, LuBox, LuCamera, LuHistory } from "react-icons/lu";
import { Link } from "react-router-dom";
import { btn } from "../../components/ui";
import { useI18n } from "../../i18n";
import type { SavedRun } from "../../lib/api";
import { ScreenTitle } from "./shared";

/** First screen: sample photos (no phrase needed) or the user's own photos (invite phrase). */
export function Choice({ onSamples, onCustom, saved, onResume }: { onSamples: () => void; onCustom: () => void; saved: SavedRun | null; onResume: () => void }) {
  const { t } = useI18n();
  const option =
    "group flex w-full cursor-pointer items-start gap-3.5 rounded-2xl border-[1.5px] border-line bg-white p-4 text-left transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-ink/40 hover:shadow-card";
  return (
    <section>
      <ScreenTitle sub={t("choice.subtitle")}>{t("choice.title")}</ScreenTitle>
      {saved && (
        <button type="button" className={`${option} mb-3 border-terracotta/50 bg-terracotta/5`} onClick={onResume}>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-terracotta/15 text-terracotta-deep" aria-hidden="true">
            <LuHistory className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-medium leading-tight">{t("choice.resume")}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{t("choice.resumeBody")}</span>
          </span>
        </button>
      )}
      <div className="grid gap-3">
        <button type="button" className={option} onClick={onSamples}>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-ochre/25 text-[#6b4a07]" aria-hidden="true">
            <LuBox className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-medium leading-tight">{t("choice.samplesTitle")}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{t("choice.samplesBody")}</span>
            <span className="mt-2 inline-block rounded-full bg-olive/12 px-2.5 py-0.5 text-xs font-bold text-olive-deep">{t("choice.samplesTag")}</span>
          </span>
          <LuArrowRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
        </button>
        <button type="button" className={option} onClick={onCustom}>
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-terracotta/12 text-terracotta-deep" aria-hidden="true">
            <LuCamera className="size-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg font-medium leading-tight">{t("choice.customTitle")}</span>
            <span className="mt-0.5 block text-sm text-ink-soft">{t("choice.customBody")}</span>
            <span className="mt-2 inline-block rounded-full bg-paper-2 px-2.5 py-0.5 text-xs font-bold text-ink-soft">{t("choice.customTag")}</span>
          </span>
          <LuArrowRight aria-hidden="true" className="mt-1 size-5 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5" />
        </button>
      </div>
      <p className="mt-5 text-center">
        <Link to="/s/example" className={btn("ghost", "sm")}>
          {t("nav.example")}
        </Link>
      </p>
    </section>
  );
}
