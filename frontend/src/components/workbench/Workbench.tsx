import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { LuChevronLeft, LuChevronRight, LuHistory, LuImages, LuPause, LuPlay, LuScanLine, LuTimer, LuX } from "react-icons/lu";
import { useI18n } from "../../i18n";
import { PIPELINE_STEPS, type Brand, type PipelineStep, type ProductCopy } from "../../lib/api";
import { productText } from "../../lib/product";
import { FidelityLine } from "../Chrome";
import { clock as formatClock, StepList, stepKey } from "../Pipeline";
import { DONE, STEP, type BenchModel, type BenchPhoto } from "./model";

/** One full turn of the turntable, whatever the frame count. */
const TURN_MS = 4200;
/** The stage keeps each new cutout at least this long, so its scan can finish before the next one. */
const HERO_DWELL_MS = 1600;
/** The alignment guides stay on screen at least this long before the frames assemble. */
const ALIGN_DWELL_MS = 1800;
const INSPECT_MS = 4200;
const HEX = /^#[0-9a-f]{6}$/i;

type Phase = "intake" | "cutout" | "align" | "spin";
const PHASES: Phase[] = ["intake", "cutout", "align", "spin"];

interface WorkbenchProps {
  model: BenchModel;
  /** Milliseconds to show on the clock (elapsed for a live run, recorded time for a replay). */
  clock: () => number;
  /** Delay between photos appearing on the contact sheet. */
  dripMs?: number;
  /** Called when the previews do not load, so the screen can fall back to the plain step list. */
  onBroken?: () => void;
  /** Extra text per step for the screen-reader step list (e.g. recorded durations). */
  stepDetail?: Partial<Record<PipelineStep, string>>;
  /** Short note next to the current step (e.g. its recorded duration). */
  note?: string;
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return;
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

/** Counts up to `target` one at a time, so photos that arrive together in one poll still appear one by one. */
function useDrip(target: number, ms: number, instant: boolean): number {
  const [shown, setShown] = useState(instant ? target : 0);
  useEffect(() => {
    if (instant || shown > target) {
      setShown(target);
      return;
    }
    if (shown === target) return;
    // Catch up faster when far behind (e.g. a reload in the middle of a run).
    const id = window.setTimeout(() => setShown((n) => n + 1), target - shown > 4 ? ms / 2 : ms);
    return () => window.clearTimeout(id);
  }, [shown, target, ms, instant]);
  return Math.min(shown, target);
}

/** Resolves when every image is loaded and decoded, so an animation never starts on a half-painted image. */
function useLoaded(urls: (string | undefined)[], onError?: () => void): "loading" | "ok" | "error" {
  const key = urls.filter(Boolean).join("|");
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const load = (url: string) =>
      new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => (img.decode ? img.decode().catch(() => undefined) : Promise.resolve()).then(() => resolve());
        img.onerror = () => reject(new Error(url));
        img.src = url;
      });
    Promise.all(key.split("|").filter(Boolean).map(load))
      .then(() => !cancelled && setState("ok"))
      .catch(() => {
        if (cancelled) return;
        setState("error");
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state;
}

/**
 * The processing workbench: the creator watches their own photos being worked on. Everything on it is
 * real run output (photos, cutouts, aligned frames, scores, palette, listing); nothing is simulated.
 */
export function Workbench({ model, clock, dripMs = 380, onBroken, stepDetail, note }: WorkbenchProps) {
  const reduced = useReducedMotion();
  const [paused, setPaused] = useState(false);
  const still = reduced || paused;
  const shown = useDrip(model.photos.length, dripMs, reduced);
  const revealed = model.photos.slice(0, shown);

  const errors = useRef(0);
  const onBrokenRef = useRef(onBroken);
  onBrokenRef.current = onBroken;
  const total = model.photos.length;
  const onImageError = useCallback(() => {
    errors.current += 1;
    if (errors.current >= Math.max(2, Math.ceil(total / 3))) onBrokenRef.current?.();
  }, [total]);

  const sheetDone = shown >= model.photos.length && model.step > STEP.background;
  const showInspector = sheetDone && model.step >= STEP.fidelity && revealed.length > 0;
  const showBrand = sheetDone && model.step > STEP.brand && !!model.brand?.colors?.some((c) => HEX.test(c));
  const showListing = sheetDone && model.step >= STEP.listing && !model.failed;

  return (
    <div className="grid gap-3">
      <div className="on-dark overflow-hidden rounded-[1.4rem] bg-clay-950 shadow-lift">
        <Hud model={model} clock={clock} note={note} paused={paused} onPause={() => setPaused((p) => !p)} reduced={reduced} />
        <div className="px-2.5 pb-2.5">
          <Stage model={model} revealed={revealed} sheetDone={sheetDone} reduced={reduced} still={still} onImageError={onImageError} />
        </div>
      </div>
      <ContactSheet model={model} revealed={revealed} reduced={reduced} onImageError={onImageError} />
      {showInspector && <Inspector model={model} photos={revealed} still={still} reduced={reduced} />}
      {showBrand && <BrandReveal brand={model.brand!} reduced={reduced} />}
      {showListing && <ListingReveal copy={model.copy} reduced={reduced} />}
      <div className="sr-only">
        <StepList current={model.step} failed={model.failed} detail={stepDetail} />
      </div>
    </div>
  );
}

/* ───────────── HUD ───────────── */

function Hud({
  model,
  clock,
  note,
  paused,
  onPause,
  reduced,
}: {
  model: BenchModel;
  clock: () => number;
  note?: string;
  paused: boolean;
  onPause: () => void;
  reduced: boolean;
}) {
  const { t } = useI18n();
  const finished = model.step >= DONE || model.failed;
  const live = model.mode === "live";
  const current = Math.min(model.step, DONE - 1);
  const name = model.step >= DONE ? t("processing.ready") : t(stepKey(PIPELINE_STEPS[current]));
  const counter = model.counter;

  return (
    <div className="grid gap-2.5 px-4 pb-3 pt-3.5 text-clay-200">
      <div className="flex items-center justify-between gap-3 text-[0.7rem] font-bold uppercase tracking-[0.16em]">
        <span className={`inline-flex items-center gap-1.5 ${live ? "text-ember" : "text-clay-200"}`}>
          {live ? (
            <span className="relative flex size-2" aria-hidden="true">
              {!finished && <span className="absolute inset-0 animate-ping rounded-full bg-ember/70" />}
              <span className="relative size-2 rounded-full bg-ember" />
            </span>
          ) : (
            <LuHistory aria-hidden="true" className="size-3.5" />
          )}
          {live ? t("bench.live") : t("bench.recorded")}
        </span>
        <span className="flex items-center gap-3 whitespace-nowrap tabular-nums tracking-[0.06em] text-clay-300">
          {counter && counter.total > 0 && (
            <span className="inline-flex items-center gap-1">
              <LuImages aria-hidden="true" className="size-3.5" />
              <span aria-hidden="true">{`${Math.min(counter.done, counter.total)}/${counter.total}`}</span>
              <span className="sr-only">{t("processing.photos", { done: Math.min(counter.done, counter.total), total: counter.total })}</span>
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <LuTimer aria-hidden="true" className="size-3.5" />
            <Ticker get={clock} running={!finished} format={(time) => time} label={(time) => (live ? t("processing.elapsed", { time }) : t("bench.recordedTime", { time }))} />
          </span>
          {!reduced && (
            <button
              type="button"
              onClick={onPause}
              aria-pressed={paused}
              aria-label={paused ? t("bench.play") : t("bench.pause")}
              className="-my-1 grid size-7 cursor-pointer place-items-center rounded-full text-clay-200 transition-colors hover:bg-white/10"
            >
              {paused ? <LuPlay aria-hidden="true" className="size-3.5" /> : <LuPause aria-hidden="true" className="size-3.5" />}
            </button>
          )}
        </span>
      </div>
      <p className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 font-display text-xl leading-tight text-paper">{model.failed ? t("processing.failedTitle") : name}</span>
        <span className="shrink-0 text-xs text-clay-300">
          {note ? `${note} · ` : ""}
          {t("processing.stepOf", { n: Math.min(model.step + 1, DONE), total: DONE })}
        </span>
      </p>
      <ol className="grid grid-cols-7 gap-1" aria-hidden="true">
        {PIPELINE_STEPS.map((step, i) => {
          const fill =
            i < model.step
              ? 1
              : i === model.step && step === "background" && counter && counter.total > 0
                ? Math.min(1, counter.done / counter.total)
                : 0;
          const active = i === model.step && !finished;
          return (
            <li key={step} className="relative h-1 overflow-hidden rounded-full bg-white/10">
              <span
                className={`absolute inset-y-0 left-0 w-full origin-left rounded-full transition-transform duration-700 ease-out-soft ${
                  model.failed && i === model.step ? "bg-[#e5655a]" : "bg-[linear-gradient(90deg,var(--color-terracotta),var(--color-ochre))]"
                }`}
                style={{ transform: `scaleX(${model.failed && i === model.step ? 1 : fill})` }}
              />
              {active && fill === 0 && <span className="bench-shimmer absolute inset-0 opacity-60" />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** A clock that re-renders only itself, once a second. */
function Ticker({ get, running, format, label }: { get: () => number; running: boolean; format: (time: string) => string; label: (time: string) => string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [running]);
  const time = formatClock(get());
  return (
    <>
      <span aria-hidden="true">{format(time)}</span>
      <span className="sr-only">{label(time)}</span>
    </>
  );
}

/* ───────────── Stage ───────────── */

function Stage({
  model,
  revealed,
  sheetDone,
  reduced,
  still,
  onImageError,
}: {
  model: BenchModel;
  revealed: BenchPhoto[];
  sheetDone: boolean;
  reduced: boolean;
  still: boolean;
  onImageError: () => void;
}) {
  const { t } = useI18n();
  const [heroAt, setHeroAt] = useState(-1);
  const [heroSettled, setHeroSettled] = useState(true);
  const lastHeroChange = useRef(0);

  // The stage follows the newest finished photo, but keeps each one long enough for its scan to finish.
  useEffect(() => {
    const latest = revealed.length - 1;
    if (latest <= heroAt) return;
    const wait = reduced || heroAt < 0 ? 0 : Math.max(0, lastHeroChange.current + HERO_DWELL_MS - Date.now());
    const id = window.setTimeout(() => {
      lastHeroChange.current = Date.now();
      setHeroAt(latest);
      setHeroSettled(false);
    }, wait);
    return () => window.clearTimeout(id);
  }, [revealed.length, heroAt, reduced]);

  useEffect(() => {
    if (heroSettled) return;
    const id = window.setTimeout(() => setHeroSettled(true), reduced ? 0 : HERO_DWELL_MS);
    return () => window.clearTimeout(id);
  }, [heroSettled, reduced]);

  const hero = heroAt >= 0 ? revealed[Math.min(heroAt, revealed.length - 1)] : undefined;
  const caughtUp = sheetDone && heroAt >= revealed.length - 1 && heroSettled;
  const target: Phase = !hero ? "intake" : !caughtUp || model.step < STEP.align ? "cutout" : model.spin.length > 0 && !model.failed ? "spin" : "align";
  const phase = useSequenced(target, reduced);

  const captions: Record<Phase, string> = {
    intake: model.step >= STEP.background ? t("bench.caption.cutout") : t("bench.caption.intake", { n: model.slots }),
    cutout: t("bench.caption.cutout"),
    align: t("bench.caption.align"),
    spin: reduced ? t("bench.caption.spinStill") : t("bench.caption.spin"),
  };

  return (
    <>
      <div className="bench-studio relative aspect-square w-full overflow-hidden rounded-[1.1rem]">
        {phase === "intake" && <Intake reduced={reduced} />}
        {phase === "cutout" && hero && (
          <div key={hero.index} className="absolute inset-0">
            <Develop photo={hero} fit="object-contain" wipe="1.4s" reduced={reduced} onError={onImageError} />
          </div>
        )}
        {phase === "align" && hero && <Aligned photo={hero} />}
        {phase === "spin" && <Assembly frames={model.spin} reduced={reduced} still={still} label={t("bench.spinLabel")} />}
        {hero && phase === "cutout" && (
          <span className="absolute left-3 top-3 rounded-full bg-clay-950/70 px-2.5 py-1 text-[0.7rem] font-bold tabular-nums tracking-wider text-paper backdrop-blur-sm">
            {t("bench.photoNo", { n: String(hero.index).padStart(2, "0") })}
          </span>
        )}
      </div>
      {/* Below the stage, never over the piece. Two lines reserved so a new caption never shifts the layout. */}
      <p
        key={phase}
        className="bench-fade flex min-h-[2.6rem] items-center justify-center px-3 pt-2 text-center text-[0.82rem] leading-snug text-clay-200"
        aria-hidden="true"
      >
        {captions[phase]}
      </p>
    </>
  );
}

/** Moves through the stage phases one at a time, giving the alignment guides a moment on screen. */
function useSequenced(target: Phase, reduced: boolean): Phase {
  const [phase, setPhase] = useState<Phase>(target === "spin" || target === "align" ? "cutout" : target);
  useEffect(() => {
    const from = PHASES.indexOf(phase);
    const to = PHASES.indexOf(target);
    if (to <= from) return;
    const wait = reduced ? 0 : phase === "align" ? ALIGN_DWELL_MS : 0;
    const id = window.setTimeout(() => setPhase(PHASES[from + 1]), wait);
    return () => window.clearTimeout(id);
  }, [phase, target, reduced]);
  return phase;
}

function Intake({ reduced }: { reduced: boolean }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <span className="grid size-24 place-items-center rounded-full bg-terracotta/10 text-terracotta-deep">
        <LuScanLine aria-hidden="true" className={`size-10 ${reduced ? "" : "animate-pulse-soft"}`} />
      </span>
      {!reduced && <span className="bench-scan pointer-events-none absolute inset-0" style={{ "--bench-wipe": "2.4s", animationIterationCount: "infinite" } as CSSProperties} />}
    </div>
  );
}

/** A photo turning into its cutout behind a scan line. Without the original photo, the cutout just fades in. */
function Develop({
  photo,
  fit,
  wipe,
  reduced,
  onError,
}: {
  photo: BenchPhoto;
  fit: "object-contain" | "object-cover";
  wipe: string;
  reduced: boolean;
  onError?: () => void;
}) {
  const state = useLoaded([photo.cutout, photo.photo], onError);
  if (state === "loading") return <span className="bench-shimmer absolute inset-0" aria-hidden="true" />;
  if (state === "error") return <span className="absolute inset-0 grid place-items-center text-sm text-ink-soft">–</span>;
  const style = { "--bench-wipe": wipe } as CSSProperties;
  return (
    <>
      <img src={photo.cutout} alt="" draggable={false} className={`absolute inset-0 size-full ${fit} ${photo.photo || reduced ? "" : "bench-fade"}`} />
      {photo.photo && !reduced && (
        <>
          <img src={photo.photo} alt="" draggable={false} className={`bench-develop absolute inset-0 size-full ${fit}`} style={style} />
          <span className="bench-scan pointer-events-none absolute inset-0" style={style} aria-hidden="true" />
        </>
      )}
    </>
  );
}

/** The last cutout with the alignment guides: one vertical axis and one floor line. */
function Aligned({ photo }: { photo: BenchPhoto }) {
  return (
    <div className="bench-fade absolute inset-0">
      <img src={photo.cutout} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
      <span className="bench-guide-y absolute inset-y-[6%] left-1/2 w-px bg-terracotta/70" aria-hidden="true" />
      <span className="bench-guide-x absolute inset-x-[6%] bottom-[11%] h-px bg-terracotta/70" aria-hidden="true" />
      <span className="bench-guide-x absolute inset-x-[6%] top-[8%] h-px border-t border-dashed border-terracotta/40" aria-hidden="true" />
    </div>
  );
}

/** The aligned frames settle into a ring, it turns once, then the piece spins by itself (frame by frame, real photos). */
function Assembly({ frames, reduced, still, label }: { frames: string[]; reduced: boolean; still: boolean; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const img = useRef<HTMLImageElement>(null);
  const [size, setSize] = useState(320);
  const [ok, setOk] = useState<string[] | null>(null);
  const key = frames.join("|");

  useLayoutEffect(() => {
    if (box.current) setSize(box.current.getBoundingClientRect().width || 320);
  }, []);

  // Preload every frame; a frame that fails is left out of the turn rather than shown broken.
  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("|") : [];
    Promise.all(
      list.map(
        (url) =>
          new Promise<string | null>((resolve) => {
            const image = new Image();
            image.decoding = "async";
            image.onload = () => resolve(url);
            image.onerror = () => resolve(null);
            image.src = url;
          }),
      ),
    ).then((loaded) => !cancelled && setOk(loaded.filter((u): u is string => !!u)));
    return () => {
      cancelled = true;
    };
  }, [key]);

  // The turntable swaps the image source directly: no React render per frame.
  useEffect(() => {
    if (!ok || ok.length < 2 || still) return;
    let i = 0;
    const id = window.setInterval(() => {
      i = (i + 1) % ok.length;
      if (img.current) img.current.src = ok[i];
    }, TURN_MS / ok.length);
    return () => window.clearInterval(id);
  }, [ok, still]);

  const ring = !reduced && ok && ok.length >= 3;
  const item = Math.round(Math.min(72, Math.max(36, (size * 1.7) / Math.max(ok?.length ?? 12, 6))));
  return (
    <div ref={box} className="absolute inset-0" role="img" aria-label={label}>
      {!ok && <span className="bench-shimmer absolute inset-0" aria-hidden="true" />}
      {ring && (
        <div className="bench-ring-out absolute inset-0 [perspective:900px]" aria-hidden="true">
          <div className="bench-ring absolute left-1/2 top-[46%]">
            {ok.map((url, i) => (
              <span
                key={url}
                className="bench-ring-item overflow-hidden rounded-lg bg-white/85 shadow-print"
                style={{ "--a": `${(i * 360) / ok.length}deg`, "--r": `${Math.round(size * 0.3)}px`, "--s": `${item}px`, animationDelay: `${i * 55}ms` } as CSSProperties}
              >
                <img src={url} alt="" draggable={false} className="size-full object-contain" />
              </span>
            ))}
          </div>
        </div>
      )}
      {ok && ok.length > 0 && (
        <img
          ref={img}
          src={ok[0]}
          alt=""
          draggable={false}
          className={`absolute inset-[6%] size-[88%] object-contain ${ring ? "bench-turntable" : ""}`}
        />
      )}
      <span className="pointer-events-none absolute inset-x-[22%] bottom-[9%] h-5 rounded-[50%] bg-clay-950/15 blur-md" aria-hidden="true" />
    </div>
  );
}

/* ───────────── Contact sheet ───────────── */

function ContactSheet({
  model,
  revealed,
  reduced,
  onImageError,
}: {
  model: BenchModel;
  revealed: BenchPhoto[];
  reduced: boolean;
  onImageError: () => void;
}) {
  const { t } = useI18n();
  const byIndex = new Map(revealed.map((p) => [p.index, p]));
  // A live run has one slot per photo sent; a replay shows the photos that became frames.
  const slots = model.mode === "live" ? Array.from({ length: model.slots }, (_, i) => i + 1) : model.photos.map((p) => p.index);
  const backgroundOver = model.step > STEP.background && revealed.length >= model.photos.length;
  const working = model.step === STEP.background && !model.failed;
  const sprockets = "h-2 bg-[radial-gradient(circle,rgb(255_255_255/0.16)_1.5px,transparent_2px)] bg-[length:14px_8px] bg-repeat-x";

  return (
    <section className="rounded-2xl bg-clay-900 px-2.5 py-1.5" aria-label={t("bench.sheet")}>
      <div className={sprockets} aria-hidden="true" />
      <ul className={`my-1.5 grid gap-1.5 ${slots.length > 16 ? "grid-cols-6" : "grid-cols-4"}`}>
        {slots.map((n) => {
          const photo = byIndex.get(n);
          const dropped = model.dropped.includes(n);
          return (
            <li key={n} className="relative aspect-square overflow-hidden rounded-md bg-clay-800">
              {photo ? (
                <div className={`bench-studio absolute inset-0 transition-[filter,opacity] duration-700 ${dropped ? "opacity-45 grayscale" : ""}`}>
                  <Develop photo={photo} fit="object-cover" wipe="0.9s" reduced={reduced} onError={onImageError} />
                </div>
              ) : (
                <span className={`absolute inset-0 grid place-items-center text-[0.7rem] font-bold tabular-nums text-clay-300/70 ${working ? "bench-shimmer" : ""}`}>
                  {backgroundOver ? "–" : String(n).padStart(2, "0")}
                </span>
              )}
              {photo && <TileChip photo={photo} dropped={dropped} />}
              <span className="sr-only">{tileText(t, n, photo, dropped, backgroundOver)}</span>
            </li>
          );
        })}
      </ul>
      <div className={sprockets} aria-hidden="true" />
    </section>
  );
}

function TileChip({ photo, dropped }: { photo: BenchPhoto; dropped: boolean }) {
  if (dropped)
    return (
      <span className="absolute bottom-1 right-1 grid size-4 place-items-center rounded-full bg-[#b3261e] text-white" aria-hidden="true">
        <LuX className="size-2.5" strokeWidth={3.5} />
      </span>
    );
  if (photo.fidelity === undefined) return null;
  return (
    <span
      className={`absolute bottom-1 right-1 rounded-full px-1.5 text-[0.62rem] font-bold leading-4 tabular-nums ${
        photo.fidelity === null ? "bg-clay-950/70 text-clay-200" : "bg-olive-deep text-white"
      }`}
      aria-hidden="true"
    >
      {photo.fidelity === null ? "–" : photo.fidelity.toFixed(2)}
    </span>
  );
}

function tileText(t: ReturnType<typeof useI18n>["t"], n: number, photo: BenchPhoto | undefined, dropped: boolean, over: boolean): string {
  if (!photo) return over ? t("bench.tileNoPreview", { n }) : t("bench.tileWaiting", { n });
  const parts = [t("bench.tileDone", { n })];
  if (typeof photo.fidelity === "number") parts.push(t("bench.similarity", { score: photo.fidelity.toFixed(3) }));
  else if (photo.fidelity === null) parts.push(t("bench.notScoredShort"));
  if (dropped) parts.push(t("bench.setAsideShort"));
  return parts.join(", ");
}

/* ───────────── Fidelity inspector ───────────── */

function Inspector({ model, photos, still, reduced }: { model: BenchModel; photos: BenchPhoto[]; still: boolean; reduced: boolean }) {
  const { t } = useI18n();
  const list = [...photos].sort((a, b) => a.index - b.index);
  const [at, setAt] = useState(() => Math.max(0, list.findIndex((p) => typeof p.fidelity === "number")));
  const [split, setSplit] = useState<number | null>(null);
  const [held, setHeld] = useState(false);
  const auto = !still && !held;

  useEffect(() => {
    if (!auto || list.length < 2) return;
    const id = window.setInterval(() => setAt((i) => (i + 1) % list.length), INSPECT_MS * 2);
    return () => window.clearInterval(id);
  }, [auto, list.length]);

  const photo = list[Math.min(at, list.length - 1)];
  if (!photo) return null;
  const dropped = model.dropped.includes(photo.index);
  const reviewed = model.threshold !== undefined || model.step > STEP.fidelity;
  const value = split ?? 50;
  const sweeping = auto && split === null && !reduced;
  const go = (delta: number) => {
    setHeld(true);
    setAt((i) => (i + delta + list.length) % list.length);
  };

  let verdict: string;
  if (typeof photo.fidelity === "number") {
    verdict = t("bench.similarity", { score: photo.fidelity.toFixed(3) });
    if (dropped) verdict += ` · ${typeof model.threshold === "number" ? t("bench.setAside", { threshold: model.threshold.toFixed(3) }) : t("bench.setAsideShort")}`;
    else if (reviewed) verdict += ` · ${t("bench.kept")}`;
  } else if (photo.fidelity === null) {
    verdict = t("bench.notScored");
  } else {
    verdict = t("bench.notRecorded");
  }

  return (
    <section className="bench-fade rounded-2xl border border-line bg-card p-3 shadow-card" aria-labelledby="bench-fidelity">
      <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
        <h2 id="bench-fidelity" className="font-sans text-xs font-bold uppercase tracking-wider text-ink-soft">
          {t("bench.fidelityTitle")}
        </h2>
        {typeof model.threshold === "number" && <span className="text-xs tabular-nums text-ink-soft">{t("bench.threshold", { threshold: model.threshold.toFixed(3) })}</span>}
      </div>

      {photo.overlay && photo.photo ? (
        <div key={photo.index} className="bench-studio relative aspect-[4/3] overflow-hidden rounded-xl">
          <img src={photo.cutout} alt="" draggable={false} className="absolute inset-0 size-full object-contain" />
          <img
            src={photo.photo}
            alt=""
            draggable={false}
            className={`absolute inset-0 size-full object-contain ${sweeping ? "bench-sweep-clip" : ""}`}
            style={sweeping ? undefined : { clipPath: `inset(0 0 0 ${value}%)` }}
          />
          <span className={`pointer-events-none absolute inset-0 ${sweeping ? "bench-sweep-bar" : ""}`} style={sweeping ? undefined : { transform: `translateX(${value}%)` }} aria-hidden="true">
            <span className="absolute inset-y-0 left-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_10px_rgb(0_0_0/0.35)]" />
            <span className="absolute left-0 top-1/2 grid size-7 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow-print">
              <LuChevronLeft className="-mr-1 size-3" />
              <LuChevronRight className="-ml-1 size-3" />
            </span>
          </span>
          <span className="absolute left-2 top-2 rounded-full bg-clay-950/70 px-2 py-0.5 text-[0.68rem] font-bold text-paper" aria-hidden="true">
            {t("bench.cutout")}
          </span>
          <span className="absolute right-2 top-2 rounded-full bg-clay-950/70 px-2 py-0.5 text-[0.68rem] font-bold text-paper" aria-hidden="true">
            {t("bench.photo")}
          </span>
        </div>
      ) : (
        <div key={photo.index} className="grid grid-cols-2 gap-1.5">
          {photo.photo && (
            <figure className="relative aspect-square overflow-hidden rounded-xl bg-paper-2">
              <img src={photo.photo} alt="" draggable={false} className="size-full object-cover" />
              <figcaption className="absolute left-2 top-2 rounded-full bg-clay-950/70 px-2 py-0.5 text-[0.68rem] font-bold text-paper">{t("bench.photo")}</figcaption>
            </figure>
          )}
          <figure className={`bench-studio relative aspect-square overflow-hidden rounded-xl ${photo.photo ? "" : "col-span-2"}`}>
            <img src={photo.cutout} alt="" draggable={false} className="size-full object-contain" />
            <figcaption className="absolute left-2 top-2 rounded-full bg-clay-950/70 px-2 py-0.5 text-[0.68rem] font-bold text-paper">{t("bench.cutout")}</figcaption>
          </figure>
        </div>
      )}

      {photo.overlay && photo.photo && (
        <label className="mt-2.5 grid gap-1 px-1 text-xs font-semibold text-ink-soft">
          {t("bench.compare")}
          <input
            type="range"
            min={0}
            max={100}
            value={value}
            onChange={(e) => {
              setHeld(true);
              setSplit(Number(e.target.value));
            }}
            className="h-6 w-full cursor-pointer border-0 bg-transparent p-0 accent-terracotta-deep"
          />
        </label>
      )}

      <div className="mt-2 flex items-center gap-2">
        <button type="button" onClick={() => go(-1)} aria-label={t("bench.prev")} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/[0.06]">
          <LuChevronLeft aria-hidden="true" className="size-4" />
        </button>
        <p className="min-w-0 flex-1 text-center text-sm" aria-live={held ? "polite" : "off"}>
          <span className="font-semibold tabular-nums">{t("bench.photoNo", { n: String(photo.index).padStart(2, "0") })}</span>
          <span className={dropped ? "text-[#8c2a14]" : "text-ink-soft"}> · {verdict}</span>
        </p>
        <button type="button" onClick={() => go(1)} aria-label={t("bench.next")} className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-full text-ink hover:bg-ink/[0.06]">
          <LuChevronRight aria-hidden="true" className="size-4" />
        </button>
      </div>
      {model.overall && (
        <div className="mt-1 border-t border-line px-1 pt-2">
          <FidelityLine score={model.overall.score} checked={model.overall.checked} frames={model.overall.frames} />
        </div>
      )}
    </section>
  );
}

/* ───────────── Brand and listing ───────────── */

function BrandReveal({ brand, reduced }: { brand: Brand; reduced: boolean }) {
  const { t } = useI18n();
  const colors = (brand.colors ?? []).filter((c) => HEX.test(c)).slice(0, 6);
  return (
    <section className="bench-fade rounded-2xl border border-line bg-card px-4 py-3.5 shadow-card" aria-labelledby="bench-brand">
      <h2 id="bench-brand" className="font-sans text-xs font-bold uppercase tracking-wider text-ink-soft">
        {t("bench.palette")}
      </h2>
      <ul className="mt-3 flex flex-wrap gap-3">
        {colors.map((color, i) => (
          <li key={`${color}-${i}`} className="grid justify-items-center gap-1">
            <span
              className="bench-pop block size-11 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1),0_6px_14px_-6px_rgb(43_38_34/0.5)]"
              style={{ background: color, animationDelay: `${i * 110}ms` }}
              aria-hidden="true"
            />
            <span className="font-mono text-[0.65rem] uppercase text-ink-soft">{color}</span>
          </li>
        ))}
      </ul>
      {brand.displayName && (
        <p className="mt-3 font-display text-2xl font-medium">
          <Typewriter text={brand.displayName} reduced={reduced} delay={colors.length * 110 + 300} />
        </p>
      )}
      {brand.tone && (
        <p className="mt-1 text-sm text-ink-soft">
          {t("brand.tone")}: {t(`tone.${brand.tone}` as const)}
        </p>
      )}
    </section>
  );
}

function ListingReveal({ copy, reduced }: { copy?: ProductCopy; reduced: boolean }) {
  const { t, lang } = useI18n();
  const text = copy ? productText({ copy }, lang) : null;
  const ready = !!text?.name;
  return (
    <section className="bench-fade rounded-2xl border border-line bg-card px-4 py-3.5 shadow-card" aria-labelledby="bench-listing" aria-busy={!ready}>
      <h2 id="bench-listing" className="font-sans text-xs font-bold uppercase tracking-wider text-ink-soft">
        {t("result.listing")}
      </h2>
      {ready ? (
        <div lang={text.lang}>
          <p className="mt-2 font-display text-xl font-medium leading-snug">
            <Typewriter text={text.name} reduced={reduced} />
          </p>
          {text.description && (
            <p className="mt-1.5 text-sm text-ink-soft">
              <Typewriter text={text.description} reduced={reduced} delay={Math.min(1200, text.name.length * 28) + 250} />
            </p>
          )}
        </div>
      ) : (
        <div className="mt-2 grid gap-2">
          <p className="bench-caret text-sm text-ink-soft">{t("bench.writing")}</p>
          {[92, 78, 54].map((w) => (
            <span key={w} className="bench-shimmer block h-3 rounded-full bg-paper-2" style={{ width: `${w}%` }} aria-hidden="true" />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * Types real text in. The full text reserves its space from the start (no layout shift) and is what
 * screen readers get.
 */
function Typewriter({ text, reduced, delay = 0 }: { text: string; reduced: boolean; delay?: number }): ReactNode {
  const [count, setCount] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    const step = Math.max(1, Math.ceil(text.length / 60));
    let typed = 0;
    let interval = 0;
    const start = window.setTimeout(() => {
      interval = window.setInterval(() => {
        typed = Math.min(text.length, typed + step);
        setCount(typed);
        if (typed >= text.length) window.clearInterval(interval);
      }, 26);
    }, delay);
    return () => {
      window.clearTimeout(start);
      window.clearInterval(interval);
    };
  }, [text, reduced, delay]);
  const typing = count < text.length;
  return (
    <span className="relative block">
      <span className="invisible" aria-hidden="true">
        {text}
      </span>
      <span className={`absolute inset-0 ${typing && count > 0 ? "bench-caret" : ""}`} aria-hidden="true">
        {text.slice(0, count)}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
