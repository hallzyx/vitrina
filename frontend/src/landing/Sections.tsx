import { animate, AnimatePresence, motion, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import {
  LuArrowRight,
  LuArrowUpRight,
  LuBan,
  LuCheck,
  LuCheckCheck,
  LuKeyRound,
  LuLanguages,
  LuMessageCircle,
  LuPalette,
  LuSend,
  LuStore,
  LuX,
} from "react-icons/lu";
import { Link } from "react-router-dom";
import { LangToggle, LogoMark } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { btn, eyebrow } from "../components/ui";
import { EXAMPLE_STORE, VASE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";
import type { PieceSpec } from "../lib/render";
import { EASE, Reveal } from "./motion";

/* ───────────── Craft ticker ───────────── */

export function CraftMarquee() {
  const { t } = useI18n();
  const crafts = t("landing.crafts").split("|");
  const row = (hidden: boolean) =>
    crafts.map((c, i) => (
      <li key={`${hidden}-${i}`} aria-hidden={hidden || undefined} className="flex items-center gap-10">
        <span>{c}</span>
        <svg viewBox="0 0 20 20" className="size-4 text-clay-950/50" aria-hidden="true">
          <path d="M10 0 12 8 20 10 12 12 10 20 8 12 0 10 8 8z" fill="currentColor" />
        </svg>
      </li>
    ));
  return (
    <div className="relative z-10 -my-7 overflow-hidden py-7">
      <div className="-rotate-2 scale-105 bg-terracotta py-4 text-paper shadow-lift">
        <p className="sr-only">{crafts.join(", ")}</p>
        <ul className="flex w-max animate-marquee gap-10 pr-10 font-display text-2xl italic sm:text-3xl" aria-hidden="true">
          {row(false)}
          {row(true)}
        </ul>
      </div>
    </div>
  );
}

/* ───────────── Fidelity promise ───────────── */

/** Example check on the demo vase: 11 frames kept (mean 0.93), one "improved" frame thrown out. */
const SCORES = [0.94, 0.92, 0.95, 0.93, 0.91, 0.94, 0.93, 0.58, 0.92, 0.94, 0.93, 0.92];
const THRESHOLD = 0.85;
/** What an AI "enhancement" might produce: shinier, golden. Exactly what we refuse to publish. */
const FAKE: PieceSpec = { ...VASE, id: "vase-fake", base: [214, 160, 60], accent: [255, 240, 190] };

function Gauge({ value, active }: { value: number; active: boolean }) {
  const reduced = useReducedMotion();
  const [v, setV] = useState(0);

  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setV(value);
      return;
    }
    const controls = animate(0, value, { duration: 1.8, ease: EASE, onUpdate: setV });
    return () => controls.stop();
  }, [active, reduced, value]);

  const arc = 251.3; // length of the half circle below
  return (
    <div className="relative mx-auto w-full max-w-[20rem]">
      <svg viewBox="0 0 200 118" className="w-full overflow-visible" aria-hidden="true">
        <defs>
          <linearGradient id="fid" x1="0" x2="1">
            <stop offset="0" stopColor="#a4472a" />
            <stop offset="1" stopColor="#b9c98f" />
          </linearGradient>
        </defs>
        <path d="M20 100 A80 80 0 0 1 180 100" fill="none" stroke="rgb(247 240 230 / 0.12)" strokeWidth="14" strokeLinecap="round" />
        <path
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          stroke="url(#fid)"
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={`${v * arc} ${arc}`}
        />
        <g transform={`translate(100 100) rotate(${-90 + THRESHOLD * 180})`}>
          <line x1="0" y1="-66" x2="0" y2="-96" stroke="var(--color-ochre)" strokeWidth="1.5" strokeDasharray="3 2" />
        </g>
        <g transform={`translate(100 100) rotate(${-90 + v * 180})`}>
          <line x1="0" y1="0" x2="0" y2="-64" stroke="var(--color-paper)" strokeWidth="2.5" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="6" fill="var(--color-paper)" />
      </svg>
      <p className="-mt-2 text-center font-display text-6xl font-medium tabular-nums text-paper">{v.toFixed(2)}</p>
    </div>
  );
}

export function Fidelity() {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.35 });
  const nevers: TKey[] = ["landing.fidelity.never1", "landing.fidelity.never2", "landing.fidelity.never3"];

  return (
    <section className="on-dark grain relative overflow-hidden bg-clay-900 py-24 text-paper lg:py-32">
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_85%_30%,rgb(107_122_79/0.28),transparent_70%)]"
        aria-hidden="true"
      />
      <div className="container-page grid items-center gap-14 lg:grid-cols-[1fr_1.05fr]">
        <div>
          <Reveal>
            <p className={`${eyebrow} mb-4 text-[#c9d6a6]`}>{t("landing.fidelity.eyebrow")}</p>
            <h2 className="text-[clamp(2.4rem,8vw,5rem)] font-medium leading-[0.98] tracking-[-0.03em]">
              {t("landing.fidelity.titleA")} <em className="text-[#c9d6a6]">{t("landing.fidelity.titleB")}</em>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-clay-200">{t("landing.fidelity.body")}</p>
          </Reveal>
          <ul className="mt-8 grid gap-3">
            {nevers.map((k, i) => (
              <Reveal key={k} delay={0.15 + i * 0.08}>
                <li className="flex items-center gap-3 text-paper/90">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-white/[0.06] ring-1 ring-white/10">
                    <LuBan aria-hidden="true" className="size-4 text-ember" />
                  </span>
                  {t(k)}
                </li>
              </Reveal>
            ))}
          </ul>
        </div>

        <div ref={ref} className="rounded-sheet border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-8">
          <p className="mb-4 text-center text-sm font-semibold text-paper/70">{t("landing.fidelity.meter")}</p>
          <Gauge value={0.93} active={inView} />
          <p className="mb-6 mt-1 flex items-center justify-center gap-2 text-xs text-paper/60">
            <span className="inline-block h-3 w-0 border-l-[1.5px] border-dashed border-ochre" aria-hidden="true" />
            {t("landing.fidelity.threshold")}
          </p>

          <ul className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {SCORES.map((score, i) => {
              const dropped = score < THRESHOLD;
              return (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={inView ? { opacity: 1, y: 0 } : undefined}
                  transition={{ duration: 0.5, ease: EASE, delay: 0.4 + i * 0.06 }}
                  className="relative"
                >
                  <div className={`overflow-hidden rounded-lg bg-card p-1 ${dropped ? "opacity-60 ring-2 ring-ember" : ""}`}>
                    <PieceThumb piece={dropped ? FAKE : VASE} size={96} angle={(i / 12) * Math.PI * 2} />
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                    <motion.span
                      className={`block h-full rounded-full ${dropped ? "bg-ember" : "bg-[#b9c98f]"}`}
                      initial={{ width: 0 }}
                      animate={inView ? { width: `${score * 100}%` } : undefined}
                      transition={{ duration: 0.9, ease: EASE, delay: 0.6 + i * 0.06 }}
                    />
                  </div>
                  <span className={`mt-0.5 block text-center text-[0.65rem] tabular-nums ${dropped ? "font-bold text-ember" : "text-paper/60"}`}>
                    {score.toFixed(2)}
                  </span>
                  {dropped && (
                    <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-ember text-clay-950">
                      <LuX aria-hidden="true" className="size-3" strokeWidth={3} />
                    </span>
                  )}
                </motion.li>
              );
            })}
          </ul>
          <p className="mt-5 flex items-start gap-2 text-sm text-paper/75">
            <LuX aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-ember" />
            {t("landing.fidelity.dropped")}
          </p>
          <p className="mt-2 text-xs text-paper/50">{t("landing.fidelity.demo")}</p>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Features bento ───────────── */

function WhatsAppCard() {
  const { t, l, money } = useI18n();
  const product = EXAMPLE_STORE.products[0];
  const message = t("product.orderMsg", { name: l(product.name), price: money(product.price, EXAMPLE_STORE.currency) });
  return (
    <div className="group relative flex h-full flex-col overflow-hidden rounded-sheet bg-[#0f3d25] p-6 text-paper sm:p-8">
      <div className="pointer-events-none absolute -right-24 -top-24 size-72 rounded-full bg-[radial-gradient(circle,rgb(74_222_128/0.25),transparent_70%)]" aria-hidden="true" />
      <LuMessageCircle aria-hidden="true" className="mb-4 size-7 text-[#86efac]" />
      <h3 className="text-3xl font-medium">{t("landing.features.wa.title")}</h3>
      <p className="mt-2 max-w-sm text-[#d7eadc]">{t("landing.features.wa.body")}</p>

      {/* Phone chat mock with the real, localized order message. */}
      <div className="mt-8 flex min-h-72 flex-1 flex-col rounded-t-[1.6rem] border-x border-t border-white/15 bg-[#0b2e1c] p-4 shadow-lift transition-transform duration-500 ease-out-soft group-hover:-translate-y-1.5">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 pb-3">
          <span className="grid size-9 place-items-center rounded-full bg-terracotta font-display text-sm font-semibold text-white">CA</span>
          <div className="text-sm">
            <p className="font-semibold">{EXAMPLE_STORE.name}</p>
            <p className="text-xs text-[#9fd8b0]">{t("landing.features.wa.online")}</p>
          </div>
        </div>
        <Reveal y={16} delay={0.2} className="mt-auto">
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#dcf8c6] px-3.5 py-2.5 text-[0.95rem] leading-snug text-[#0b2e1c] shadow">
            <div className="mb-2 flex items-center gap-2 rounded-lg bg-white/70 p-1.5">
              <span className="size-10 shrink-0 rounded-md bg-[radial-gradient(circle,#fff,#efe4d4)]">
                <PieceThumb piece={product.piece} size={80} />
              </span>
              <span className="text-xs font-semibold">{l(product.name)}</span>
            </div>
            {message}
            <span className="mt-1 flex items-center justify-end gap-1 text-[0.65rem] text-[#3b7a55]">
              12:04 <LuCheckCheck aria-hidden="true" className="size-3.5 text-sky-600" />
            </span>
          </div>
        </Reveal>
        {/* Composer bar */}
        <div className="mt-4 flex items-center gap-2" aria-hidden="true">
          <span className="h-10 flex-1 rounded-full bg-white/10" />
          <span className="grid size-10 place-items-center rounded-full bg-[#25d366] text-[#0b2e1c]">
            <LuSend className="size-4" />
          </span>
        </div>
      </div>
    </div>
  );
}

function BilingualCard() {
  const { t, lang } = useI18n();
  const reduced = useReducedMotion();
  const [shown, setShown] = useState<"en" | "es">(lang === "es" ? "en" : "es");
  const product = EXAMPLE_STORE.products[1];

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => setShown((s) => (s === "en" ? "es" : "en")), 2800);
    return () => window.clearInterval(id);
  }, [reduced]);

  return (
    <div className="flex h-full flex-col justify-between gap-6 rounded-sheet border border-line bg-card p-6 shadow-card sm:p-8">
      <div>
        <LuLanguages aria-hidden="true" className="mb-4 size-7 text-terracotta-deep" />
        <h3 className="text-3xl font-medium">{t("landing.features.i18n.title")}</h3>
        <p className="mt-2 max-w-md text-ink-soft">{t("landing.features.i18n.body")}</p>
      </div>
      <div className="flex items-stretch gap-4 rounded-2xl bg-paper p-3">
        <span className="w-24 shrink-0 rounded-xl bg-[radial-gradient(circle_at_50%_40%,#fff,#efe4d4)] p-1">
          <PieceThumb piece={product.piece} size={160} />
        </span>
        <div className="min-w-0 flex-1 py-1">
          <div className="mb-2 inline-flex rounded-full bg-paper-2 p-0.5 text-xs font-bold" role="group" aria-label={t("landing.features.i18n.title")}>
            {(["en", "es"] as const).map((code) => (
              <button
                key={code}
                type="button"
                aria-pressed={shown === code}
                onClick={() => setShown(code)}
                className={`cursor-pointer rounded-full px-2.5 py-0.5 uppercase transition-colors ${shown === code ? "bg-ink text-paper" : "text-ink-soft"}`}
              >
                {code}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={shown}
              lang={shown}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              <p className="font-display text-lg font-medium leading-tight">{product.name[shown]}</p>
              <p className="mt-1 text-sm text-ink-soft">{product.description[shown]}</p>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function EditLinkCard() {
  const { t } = useI18n();
  return (
    <div className="group flex h-full flex-col justify-between gap-6 rounded-sheet bg-ochre/25 p-6 ring-1 ring-ochre/40 sm:p-8">
      <div>
        <LuKeyRound aria-hidden="true" className="mb-4 size-7 text-[#7a5310] transition-transform duration-500 group-hover:-rotate-45" />
        <h3 className="text-3xl font-medium">{t("landing.features.key.title")}</h3>
        <p className="mt-2 text-ink-soft">{t("landing.features.key.body")}</p>
      </div>
      <p className="truncate rounded-xl bg-card px-3 py-2.5 font-mono text-sm text-ink shadow-card">
        …/edit/<span className="text-terracotta-deep">7c1e</span>
        <span className="tracking-widest text-ink-soft">••••••••</span>
      </p>
    </div>
  );
}

function PaletteCard() {
  const { t } = useI18n();
  return (
    <div className="group flex h-full flex-col justify-between gap-6 rounded-sheet border border-line bg-card p-6 shadow-card sm:p-8">
      <div>
        <LuPalette aria-hidden="true" className="mb-4 size-7 text-terracotta-deep" />
        <h3 className="text-3xl font-medium">{t("landing.features.brand.title")}</h3>
        <p className="mt-2 text-ink-soft">{t("landing.features.brand.body")}</p>
      </div>
      <div className="flex" aria-hidden="true">
        {EXAMPLE_STORE.colors.map((c, i) => (
          <span
            key={c}
            className="-ml-2 size-12 rounded-full border-4 border-card shadow-card transition-transform duration-300 ease-out-soft first:ml-0 group-hover:translate-x-[calc(var(--i)*10px)]"
            style={{ background: c, ["--i" as string]: i }}
          />
        ))}
      </div>
    </div>
  );
}

export function Features() {
  const { t } = useI18n();
  return (
    <section className="bg-paper py-24 lg:py-32">
      <div className="container-page">
        <Reveal className="mb-12 max-w-3xl">
          <p className={`${eyebrow} mb-3 text-terracotta-deep`}>{t("landing.features.eyebrow")}</p>
          <h2 className="text-[clamp(2rem,6.4vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.025em]">{t("landing.features.title")}</h2>
        </Reveal>
        <div className="grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto]">
          <Reveal className="lg:col-span-5 lg:row-span-2">
            <WhatsAppCard />
          </Reveal>
          <Reveal className="lg:col-span-7" delay={0.08}>
            <BilingualCard />
          </Reveal>
          <Reveal className="lg:col-span-4" delay={0.12}>
            <EditLinkCard />
          </Reveal>
          <Reveal className="lg:col-span-3" delay={0.16}>
            <PaletteCard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Honest proof: the demo store ───────────── */

function Counter({ to, active }: { to: number; active: boolean }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (reduced) {
      setN(to);
      return;
    }
    const controls = animate(0, to, { duration: 1.4, ease: EASE, onUpdate: (v) => setN(Math.round(v)) });
    return () => controls.stop();
  }, [active, reduced, to]);
  return <>{n}</>;
}

export function DemoProof() {
  const { t, l, money } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });
  const store = EXAMPLE_STORE;
  const facts: { value: number; label: TKey }[] = [
    { value: store.products.length, label: "landing.proof.pieces" },
    { value: store.products[0].frames, label: "landing.proof.frames" },
    { value: 0, label: "landing.proof.accounts" },
    { value: 2, label: "landing.proof.langs" },
  ];

  return (
    <section className="bg-paper-2 py-24 lg:py-32">
      <div className="container-page">
        <div className="grid items-end gap-8 lg:grid-cols-[1.2fr_1fr]">
          <Reveal>
            <p className={`${eyebrow} mb-3 inline-flex items-center gap-2 text-terracotta-deep`}>
              <LuStore aria-hidden="true" className="size-4" /> {t("landing.proof.eyebrow")}
            </p>
            <h2 className="text-[clamp(2rem,6.4vw,3.8rem)] font-medium leading-[1.02] tracking-[-0.025em]">{t("landing.proof.title")}</h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="text-lg text-ink-soft">{t("landing.proof.body")}</p>
          </Reveal>
        </div>

        {/* Swipeable row on phones, three columns from `sm`. */}
        <div className="-mx-4 mt-12 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0">
          {store.products.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08} className="w-[72%] shrink-0 snap-start sm:w-auto">
              <Link
                to={`/s/${store.slug}/${p.id}`}
                className="group block overflow-hidden rounded-sheet border border-line bg-card no-underline shadow-card transition-[transform,box-shadow] duration-300 ease-out-soft hover:-translate-y-1.5 hover:shadow-lift"
              >
                <div className="relative bg-[radial-gradient(circle_at_50%_38%,#fff,#efe4d4)] p-4">
                  <div className="transition-transform duration-700 ease-out-soft group-hover:rotate-[4deg] group-hover:scale-105">
                    <PieceThumb piece={p.piece} size={320} />
                  </div>
                  <span className="absolute left-3 top-3 rounded-full bg-card/90 px-2.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wider text-ink-soft">
                    {t("landing.proof.sample")}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-display text-lg font-medium text-ink">{l(p.name)}</p>
                    <p className="text-sm font-semibold text-terracotta-deep">{money(p.price, store.currency)}</p>
                  </div>
                  <span className="grid size-10 place-items-center rounded-full bg-paper-2 text-ink transition-colors group-hover:bg-ink group-hover:text-paper">
                    <LuArrowUpRight aria-hidden="true" className="size-5" />
                  </span>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>

        <div ref={ref} className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sheet border border-line bg-line sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label} className="bg-card px-5 py-6">
              <p className="font-display text-5xl font-medium tabular-nums text-terracotta-deep">
                <Counter to={f.value} active={inView} />
              </p>
              <p className="mt-1 text-sm text-ink-soft">{t(f.label)}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-4">
          <Link to="/s/example" className={btn("outline", "lg")}>
            {t("nav.example")}
            <LuArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
          </Link>
          <p className="flex items-center gap-2 text-sm text-ink-soft">
            <LuCheck aria-hidden="true" className="size-4 text-olive" /> {t("landing.proof.noCode")}
          </p>
        </div>
      </div>
    </section>
  );
}

/* ───────────── Final call to action + footer ───────────── */

export function FinalCta() {
  const { t } = useI18n();
  return (
    <section className="on-dark grain relative overflow-hidden bg-clay-950 py-28 text-center text-paper lg:py-40">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(50%_60%_at_50%_100%,#6b3620,transparent_70%)]" aria-hidden="true" />
      <svg viewBox="-100 -100 200 200" className="pointer-events-none absolute left-1/2 top-1/2 -z-10 size-[140vw] max-w-[1100px] -translate-x-1/2 -translate-y-1/2 animate-spin-slow opacity-60" aria-hidden="true">
        {Array.from({ length: 120 }, (_, i) => (
          <line key={i} x1="0" y1="-98" x2="0" y2={i % 10 === 0 ? -90 : -95} stroke="rgb(240 154 110 / 0.25)" strokeWidth="0.3" transform={`rotate(${i * 3})`} />
        ))}
      </svg>
      <div className="container-page">
        <Reveal>
          <h2 className="mx-auto max-w-[17ch] text-[clamp(2.4rem,8.5vw,6rem)] font-medium leading-[0.98] tracking-[-0.03em]">{t("landing.cta.title")}</h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mx-auto mt-6 max-w-xl text-lg text-clay-200">{t("landing.cta.body")}</p>
        </Reveal>
        <Reveal delay={0.18} className="mt-10 flex flex-wrap justify-center gap-3">
          <Link to="/create" className={btn("light", "lg")}>
            {t("nav.create")}
            <LuArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
          </Link>
          <Link to="/s/example" className={btn("outlineLight", "lg")}>
            {t("nav.example")}
          </Link>
        </Reveal>
      </div>
    </section>
  );
}

export function LandingFooter() {
  const { t } = useI18n();
  return (
    <footer className="on-dark border-t border-white/10 bg-clay-950 py-10 text-paper/70">
      <div className="container-page flex flex-col gap-6 text-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <LogoMark size={32} />
          <div>
            <p className="font-semibold text-paper">{t("footer.built")}</p>
            <p>{t("footer.note")}</p>
          </div>
        </div>
        <LangToggle dark />
      </div>
    </footer>
  );
}
