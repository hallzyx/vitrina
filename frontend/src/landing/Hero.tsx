import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Fragment, lazy, Suspense, useCallback, useRef, useState } from "react";
import { useMediaQuery } from "./useMediaQuery";
import { LuArrowDown, LuArrowRight, LuShieldCheck, LuStore } from "react-icons/lu";
import { Link } from "react-router-dom";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PieceThumb } from "../components/PieceThumb";
import { btn, eyebrow } from "../components/ui";
import { Viewer360 } from "../components/Viewer360";
import { BASKET, BOWL, VASE } from "./illustration";
import { useI18n, type TKey } from "../i18n";
import type { Shape } from "../lib/render";
import { EASE } from "./motion";
import { pickHeroMode, type HeroMode } from "./webgl";

const Hero3D = lazy(() => import("./Hero3D"));

const PIECES = { vase: VASE, bowl: BOWL, basket: BASKET } as const;
const SHAPES: { id: Shape; label: TKey }[] = [
  { id: "vase", label: "landing.hero.vase" },
  { id: "bowl", label: "landing.hero.bowl" },
  { id: "basket", label: "landing.hero.basket" },
];

/** Degree ring around the stage, like the markings on a potter's wheel. */
function Dial({ markerRef }: { markerRef: React.RefObject<SVGGElement> }) {
  const ticks = Array.from({ length: 72 }, (_, i) => i * 5);
  return (
    <svg viewBox="-100 -100 200 200" className="pointer-events-none absolute inset-0 size-full" aria-hidden="true">
      <circle r="97" fill="none" stroke="rgb(240 154 110 / 0.18)" strokeWidth="0.4" />
      {ticks.map((deg) => {
        const major = deg % 30 === 0;
        return (
          <line
            key={deg}
            x1="0"
            y1={-97}
            x2="0"
            y2={major ? -91 : -94}
            stroke={major ? "rgb(247 240 230 / 0.5)" : "rgb(247 240 230 / 0.18)"}
            strokeWidth={major ? 0.6 : 0.4}
            transform={`rotate(${deg})`}
          />
        );
      })}
      {[0, 90, 270].map((deg) => (
        <text
          key={deg}
          x="0"
          y={-85}
          transform={`rotate(${deg})`}
          textAnchor="middle"
          fontSize="4.2"
          fill="rgb(247 240 230 / 0.45)"
          className="font-sans tabular-nums"
        >
          {deg}°
        </text>
      ))}
      <g ref={markerRef}>
        <path d="M0 -99 L3 -104 L-3 -104 Z" fill="var(--color-ember)" />
        <line x1="0" y1="-97" x2="0" y2="-89" stroke="var(--color-ember)" strokeWidth="0.9" />
      </g>
    </svg>
  );
}

export function Hero() {
  const { t } = useI18n();
  const reduced = useReducedMotion() ?? false;
  const [mode, setMode] = useState<HeroMode>(() => pickHeroMode());
  const [ready, setReady] = useState(false);
  const [shape, setShape] = useState<Shape>("vase");
  const markerRef = useRef<SVGGElement>(null);
  const degRef = useRef<HTMLSpanElement>(null);

  // Scroll parallax only on wide screens, where the copy sits beside the stage.
  const parallax = useMediaQuery("(min-width: 1024px)") && !reduced;
  const { scrollY } = useScroll();
  const copyY = useTransform(scrollY, [0, 700], [0, parallax ? -90 : 0]);
  const copyOpacity = useTransform(scrollY, [0, 520], [1, parallax ? 0.15 : 1]);
  const ghostY = useTransform(scrollY, [0, 700], [0, reduced ? 0 : 140]);

  const onAngle = useCallback((deg: number) => {
    markerRef.current?.setAttribute("transform", `rotate(${deg})`);
    if (degRef.current) degRef.current.textContent = `${String(deg).padStart(3, "0")}°`;
  }, []);
  const onFail = useCallback(() => setMode("frames"), []);
  const onReady = useCallback(() => setReady(true), []);

  const words = t("landing.titleA").split(" ");
  const tail = t("landing.titleB").split(" ");

  const framesFallback = (
    <div className="absolute inset-[19%]" data-hero="frames">
      <Viewer360
        key={shape}
        piece={PIECES[shape]}
        showTabs={false}
        stageClassName="bg-[radial-gradient(circle_at_50%_45%,rgb(255_236_214/0.16),transparent_68%)]"
      />
    </div>
  );

  const poster = (
    <div className="pointer-events-none absolute inset-[18%] grid place-items-center" aria-hidden="true">
      <PieceThumb piece={VASE} size={360} className="opacity-90" />
    </div>
  );

  return (
    <section className="on-dark grain relative overflow-hidden bg-clay-950 text-paper">
      {/* Kiln light */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_72%_46%,#6b3620_0%,rgb(107_54_32/0)_70%),radial-gradient(45%_35%_at_10%_105%,#3d2216_0%,transparent_70%),radial-gradient(30%_30%_at_95%_0%,#2d1a12_0%,transparent_70%)]"
        aria-hidden="true"
      />
      <motion.p
        style={{ y: ghostY }}
        className="pointer-events-none absolute -right-[4vw] top-[14%] -z-10 select-none font-display text-[38vw] font-semibold leading-none text-transparent [-webkit-text-stroke:1px_rgb(240_154_110/0.13)] lg:top-[4%] lg:text-[26vw]"
        aria-hidden="true"
      >
        360°
      </motion.p>

      <div className="container-page grid min-h-svh items-center gap-x-10 pb-14 pt-24 lg:grid-cols-[1.05fr_1fr] lg:grid-rows-[1fr_auto_auto_1fr] lg:pb-10 lg:pt-20">
        {/* Headline */}
        <motion.div style={{ y: copyY, opacity: copyOpacity }} className="lg:col-start-1 lg:row-start-2">
          <motion.p
            className={`${eyebrow} mb-5 text-ember`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE }}
          >
            {t("landing.eyebrow")}
          </motion.p>
          <h1 className="text-[clamp(2.9rem,12.5vw,4.2rem)] font-medium leading-[0.95] tracking-[-0.035em] text-paper lg:text-[clamp(4.4rem,6.6vw,6.4rem)]">
            {words.map((w, i) => (
              <Fragment key={`a${i}`}>
                <Word delay={0.08 * i}>{w}</Word>{" "}
              </Fragment>
            ))}
            <Word delay={0.08 * words.length} className="relative italic text-ember">
              {t("landing.titleSpin")}
              <Swoosh delay={0.35 + 0.08 * words.length} />
            </Word>
            {tail.map((w, i) => (
              <Fragment key={`b${i}`}>
                {" "}
                <Word delay={0.08 * (words.length + 1 + i)}>{w}</Word>
              </Fragment>
            ))}
          </h1>

        </motion.div>

        {/* Stage */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1.1, ease: EASE, delay: 0.15 }}
          className="relative mt-6 lg:col-start-2 lg:row-span-4 lg:row-start-1 lg:mt-0"
        >
          <div className="relative mx-auto aspect-square w-full max-w-[min(100%,640px)]">
            <div className="absolute inset-[10%] rounded-full bg-[radial-gradient(circle,rgb(240_154_110/0.22)_0%,transparent_65%)] blur-2xl" aria-hidden="true" />
            <Dial markerRef={markerRef} />
            <RingText text={t("landing.hero.ring")} />
            {mode === "3d" ? (
              <ErrorBoundary fallback={framesFallback} onError={onFail}>
                {!ready && poster}
                <Suspense fallback={null}>
                  <div className={`absolute inset-[6%] transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}>
                    <Hero3D shape={shape} reducedMotion={reduced} label={t("landing.hero.aria")} onAngle={onAngle} onReady={onReady} onFail={onFail} />
                  </div>
                </Suspense>
              </ErrorBoundary>
            ) : (
              framesFallback
            )}
            <span
              ref={degRef}
              className="pointer-events-none absolute bottom-[3%] left-1/2 -translate-x-1/2 font-display text-sm tabular-nums tracking-widest text-paper/60"
              aria-hidden="true"
            >
              {mode === "3d" ? "000°" : ""}
            </span>
          </div>

          <div className="mt-2 flex flex-col items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] p-1 backdrop-blur" role="group" aria-label={t("landing.hero.try")}>
              {SHAPES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={shape === s.id}
                  onClick={() => setShape(s.id)}
                  className={`cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold transition-colors duration-200 ${
                    shape === s.id ? "bg-paper text-clay-950" : "text-paper/75 hover:text-paper"
                  }`}
                >
                  {t(s.label)}
                </button>
              ))}
            </div>
            <p className="max-w-xs text-center text-xs leading-relaxed text-paper/60">
              {mode === "3d" ? t("landing.hero.note3d") : t("landing.hero.noteFrames")}
            </p>
          </div>
        </motion.div>

        <motion.div
          style={{ y: copyY, opacity: copyOpacity }}
          className="mt-8 lg:col-start-1 lg:row-start-3 lg:mt-7"
        >
          <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, ease: EASE, delay: 0.55 }}>
            <HeroCopy />
          </motion.div>
        </motion.div>
      </div>

      <a
        href="#how"
        className="absolute bottom-5 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-paper/55 no-underline transition-colors hover:text-paper lg:inline-flex"
      >
        <LuArrowDown aria-hidden="true" className="size-4 animate-bounce" /> {t("landing.hero.scroll")}
      </a>
    </section>
  );
}

function HeroCopy() {
  const { t } = useI18n();
  return (
    <>
      <p className="max-w-[34rem] text-lg leading-relaxed text-clay-200 lg:text-xl">{t("landing.subtitle")}</p>
      <div className="mt-7 flex flex-wrap gap-3">
        <Link to="/create" className={btn("primary", "lg")}>
          {t("nav.create")}
          <LuArrowRight aria-hidden="true" className="size-4 transition-transform duration-200 group-hover/btn:translate-x-1" />
        </Link>
        <Link to="/s/example" className={btn("outlineLight", "lg")}>
          <LuStore aria-hidden="true" className="size-4" />
          {t("nav.example")}
        </Link>
      </div>
      <p className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-olive/50 bg-olive/20 px-3 py-1 text-[0.8rem] font-semibold text-[#dfe8c9]">
        <LuShieldCheck aria-hidden="true" className="size-3.5 shrink-0" /> {t("landing.hero.promise")}
      </p>
    </>
  );
}

function Word({ children, delay, className = "" }: { children: React.ReactNode; delay: number; className?: string }) {
  return (
    <span className="inline-block overflow-hidden pb-[0.12em] align-bottom">
      <motion.span
        className={`inline-block ${className}`}
        initial={{ y: "105%", opacity: 0 }}
        animate={{ y: "0%", opacity: 1 }}
        transition={{ duration: 0.9, ease: EASE, delay: 0.1 + delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

/** Hand-drawn orbit under the word "spin". */
function Swoosh({ delay }: { delay: number }) {
  return (
    <svg viewBox="0 0 220 60" className="pointer-events-none absolute -bottom-[0.18em] left-[-6%] h-[0.42em] w-[112%] overflow-visible" aria-hidden="true" preserveAspectRatio="none">
      <motion.path
        d="M6 38 C 50 58, 170 58, 212 30 C 222 22, 200 10, 160 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: EASE, delay }}
      />
    </svg>
  );
}

/** Slowly rotating label around the stage. */
function RingText({ text }: { text: string }) {
  // Repeat to roughly fill the circle, then let textLength close the gap exactly.
  const unit = `${text} · `;
  const phrase = unit.repeat(Math.max(1, Math.floor(84 / unit.length)));
  return (
    <svg viewBox="-100 -100 200 200" className="pointer-events-none absolute inset-[5%] size-[90%] animate-spin-slow" aria-hidden="true">
      <defs>
        <path id="hero-ring" d="M -80 0 A 80 80 0 1 1 80 0 A 80 80 0 1 1 -80 0" />
      </defs>
      <text fontSize="5.4" letterSpacing="2.2" fill="rgb(247 240 230 / 0.42)" className="font-sans font-semibold uppercase">
        <textPath href="#hero-ring" textLength={500} lengthAdjust="spacing">
          {phrase}
        </textPath>
      </text>
    </svg>
  );
}
