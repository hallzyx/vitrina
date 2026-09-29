import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect, useRef, useState } from "react";
import { LuCamera, LuMessageCircle, LuScanLine } from "react-icons/lu";
import { PieceThumb } from "../components/PieceThumb";
import { eyebrow } from "../components/ui";
import { Viewer360 } from "../components/Viewer360";
import { VASE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";
import { EASE, Reveal } from "./motion";

const FRAMES = 12;

const STEPS: { icon: typeof LuCamera; title: TKey; body: TKey; phase: TKey }[] = [
  { icon: LuCamera, title: "landing.story.s1.title", body: "landing.story.s1.body", phase: "landing.story.s1.phase" },
  { icon: LuScanLine, title: "landing.story.s2.title", body: "landing.story.s2.body", phase: "landing.story.s2.phase" },
  { icon: LuMessageCircle, title: "landing.story.s3.title", body: "landing.story.s3.body", phase: "landing.story.s3.phase" },
];

/** Deterministic "photos thrown on a table" layout, in stage units (-0.5 … 0.5). */
const SCATTER = Array.from({ length: FRAMES }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 12.9898 + n * 78.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const col = i % 4;
  const row = Math.floor(i / 4);
  return {
    x: (col - 1.5) * 0.26 + (r(1) - 0.5) * 0.1,
    y: (row - 1) * 0.3 + (r(2) - 0.5) * 0.1,
    rot: (r(3) - 0.5) * 36,
  };
});

const angleOf = (i: number) => (i / FRAMES) * Math.PI * 2;

/** React 18 has no typed `inert` prop; an empty string attribute enables it. */
const inert = (on: boolean) => (on ? ({ inert: "" } as Record<string, string>) : {});

export function SpinStory() {
  const reduced = useReducedMotion();
  return (
    <section id="how" className="relative scroll-mt-16 bg-paper">
      {reduced ? <StaticStory /> : <ScrollStory />}
    </section>
  );
}

function StoryHeader() {
  const { t } = useI18n();
  return (
    <>
      <p className={`${eyebrow} mb-3 text-terracotta-deep`}>{t("landing.story.eyebrow")}</p>
      <h2 className="max-w-[16ch] text-[clamp(1.9rem,6.4vw,3.6rem)] font-medium leading-[1.02]">{t("landing.story.title")}</h2>
    </>
  );
}

/** Photo print: the raw shot has a tabletop and a wall; `clean` fades in the removed background. */
function Print({ index, clean }: { index: number; clean: MotionValue<number> | number }) {
  return (
    <div className="relative size-full overflow-hidden rounded-[10%] bg-[linear-gradient(180deg,#d9c7ae_0%,#cdb89c_58%,#8a5a3c_58%,#6e4630_100%)] p-[6%] shadow-print ring-1 ring-black/5">
      <motion.div className="absolute inset-0 bg-card" style={{ opacity: clean }} />
      <PieceThumb piece={VASE} size={140} angle={angleOf(index)} className="relative" />
      <span className="absolute left-[8%] top-[6%] font-sans text-[clamp(7px,1.3vw,10px)] font-bold tabular-nums text-ink/55">
        {String(index + 1).padStart(2, "0")}
      </span>
    </div>
  );
}

function ScrollStory() {
  const { t } = useI18n();
  const sectionRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState(340);
  const [step, setStep] = useState(0);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const p = useSpring(scrollYProgress, { stiffness: 140, damping: 28, mass: 0.35 });

  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize(Math.round(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useMotionValueEvent(p, "change", (v) => setStep(v < 0.34 ? 0 : v < 0.62 ? 1 : 2));

  const clean = useTransform(p, [0.32, 0.5], [0, 1]);
  const scanY = useTransform(p, [0.3, 0.52], ["-5%", "105%"]);
  const scanOpacity = useTransform(p, [0.28, 0.32, 0.5, 0.54], [0, 1, 1, 0]);
  const ringTurn = useTransform(p, [0.22, 0.62], [0, 40]);
  const viewerOpacity = useTransform(p, [0.62, 0.74], [0, 1]);
  const viewerScale = useTransform(p, [0.6, 0.78], [0.55, 1]);
  const bar = useTransform(p, [0, 1], ["0%", "100%"]);

  return (
    <div ref={sectionRef} className="relative h-[330vh]">
      <div className="sticky top-0 flex h-svh flex-col overflow-hidden pt-16">
        <div className="container-page grid flex-1 content-center items-center gap-5 lg:grid-cols-[0.95fr_1.05fr] lg:gap-12">
          <div>
            <StoryHeader />
            {/* Desktop: all steps, the active one highlighted. */}
            <ol className="mt-10 hidden gap-2 lg:grid">
              {STEPS.map((s, i) => (
                <li
                  key={s.title}
                  className={`relative grid grid-cols-[2.75rem_1fr] gap-4 rounded-2xl p-4 transition-all duration-500 ${
                    i === step ? "bg-card shadow-card" : "opacity-45"
                  }`}
                >
                  <span className={`grid size-11 place-items-center rounded-full ${i === step ? "bg-terracotta-deep text-white" : "bg-paper-2 text-ink"}`}>
                    <s.icon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-xl font-medium">
                      <span className="mr-2 font-sans text-sm font-bold tabular-nums text-terracotta-deep">0{i + 1}</span>
                      {t(s.title)}
                    </h3>
                    <p className="mt-1 text-ink-soft">{t(s.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <div className="mt-6 hidden h-1 max-w-sm overflow-hidden rounded-full bg-paper-2 lg:block" aria-hidden="true">
              <motion.span className="block h-full rounded-full bg-terracotta" style={{ width: bar }} />
            </div>
          </div>

          <div className="flex flex-col items-center">
            <div ref={stageRef} className="relative aspect-square w-[min(100%,46svh)] lg:w-[min(100%,74svh)]">
              <div className="absolute inset-[4%] rounded-full border border-dashed border-sand" aria-hidden="true" />
              <motion.div className="absolute inset-0" style={{ rotate: ringTurn }} key={size}>
                {SCATTER.map((s, i) => (
                  <Card key={i} index={i} p={p} size={size} scatter={s} clean={clean} />
                ))}
              </motion.div>
              {/* Scanner sweeping over the prints while backgrounds are removed. */}
              <motion.div
                className="pointer-events-none absolute inset-x-[6%] h-0.5 rounded-full bg-terracotta shadow-[0_0_24px_6px_rgb(194_98_63/0.45)]"
                style={{ top: scanY, opacity: scanOpacity }}
                aria-hidden="true"
              />
              <motion.div className="absolute inset-[16%] rounded-full bg-card shadow-lift" style={{ opacity: viewerOpacity, scale: viewerScale, pointerEvents: step === 2 ? "auto" : "none" }}
                {...inert(step !== 2)}
              >
                <div className="absolute inset-[13%]">
                  <Viewer360 piece={VASE} showTabs={false} stageClassName="bg-transparent" />
                </div>
              </motion.div>
            </div>

            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-paper-2 px-3 py-1 text-xs font-semibold text-ink-soft" aria-live="polite">
              <span className="size-1.5 rounded-full bg-terracotta" aria-hidden="true" />
              {t(STEPS[step].phase)}
            </p>

            {/* Mobile: only the active step. */}
            <div className="mt-4 min-h-[7.5rem] w-full lg:hidden">
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.35, ease: EASE }}
                >
                  <h3 className="text-xl font-medium">
                    <span className="mr-2 font-sans text-sm font-bold tabular-nums text-terracotta-deep">0{step + 1}/03</span>
                    {t(STEPS[step].title)}
                  </h3>
                  <p className="mt-1 text-[0.95rem] text-ink-soft">{t(STEPS[step].body)}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface CardProps {
  index: number;
  p: MotionValue<number>;
  size: number;
  scatter: { x: number; y: number; rot: number };
  clean: MotionValue<number>;
}

/** One of the 12 photos: scattered → arranged in the capture ring → absorbed into the 360° view. */
function Card({ index, p, size, scatter, clean }: CardProps) {
  const card = size * 0.17;
  const ringR = size * 0.4;
  const a = angleOf(index) - Math.PI / 2;
  const rx = Math.cos(a) * ringR;
  const ry = Math.sin(a) * ringR;
  const stops = [0, 0.26, 0.58, 0.72];

  const x = useTransform(p, stops, [scatter.x * size * 1.02, rx, rx, 0]);
  const y = useTransform(p, stops, [scatter.y * size * 1.02, ry, ry, 0]);
  const rotate = useTransform(p, [0, 0.26], [scatter.rot, 0]);
  const scale = useTransform(p, stops, [1.35, 1, 1, 0.35]);
  const opacity = useTransform(p, [0.62, 0.72], [1, 0]);

  return (
    <motion.div
      className="absolute left-1/2 top-1/2"
      style={{ width: card, height: card * 1.18, marginLeft: -card / 2, marginTop: (-card * 1.18) / 2, x, y, rotate, scale, opacity }}
    >
      <Print index={index} clean={clean} />
    </motion.div>
  );
}

/** Reduced-motion version: the same story as a static, readable layout. */
function StaticStory() {
  const { t } = useI18n();
  return (
    <div className="container-page py-20 lg:py-28">
      <StoryHeader />
      <div className="mt-10 grid items-center gap-8 lg:grid-cols-[1fr_auto_1fr]">
        <ul className="grid grid-cols-4 gap-2 sm:gap-3" aria-label={t("landing.story.s1.phase")}>
          {Array.from({ length: FRAMES }, (_, i) => (
            <li key={i} className="aspect-[1/1.18]">
              <Print index={i} clean={i % 2} />
            </li>
          ))}
        </ul>
        <span className="rotate-90 text-center font-display text-4xl text-terracotta lg:rotate-0" aria-hidden="true">
          →
        </span>
        <div className="mx-auto w-full max-w-sm rounded-sheet bg-card p-3 shadow-lift">
          <Viewer360 piece={VASE} showTabs={false} stageClassName="bg-transparent" />
        </div>
      </div>
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <li key={s.title}>
            <Reveal className="h-full rounded-card bg-card p-6 shadow-card">
              <s.icon aria-hidden="true" className="mb-3 size-6 text-terracotta-deep" />
              <h3 className="text-xl font-medium">
                <span className="mr-2 font-sans text-sm font-bold tabular-nums text-terracotta-deep">0{i + 1}</span>
                {t(s.title)}
              </h3>
              <p className="mt-1 text-ink-soft">{t(s.body)}</p>
            </Reveal>
          </li>
        ))}
      </ol>
    </div>
  );
}
