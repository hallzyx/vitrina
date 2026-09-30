import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { LuImageOff, LuMoveHorizontal } from "react-icons/lu";
import { useI18n } from "../i18n";
import { useFrames, type PieceSpec } from "../lib/render";

/** Procedural pieces (landing illustration only) are drawn with this many frames. */
const PIECE_FRAMES = 24;
/** One full turn of the idle auto-rotation takes this long, whatever the frame count. */
const TURN_MS = 7000;
/** Frames are loaded a few at a time so the first one paints as soon as possible. */
const CONCURRENCY = 3;

const STUDIO = "bg-[radial-gradient(circle_at_50%_38%,#fff_0%,#f1e6d7_100%)]";

type Source = CanvasImageSource | null;

interface CommonProps {
  className?: string;
  /** Background of the stage; defaults to a soft studio sweep. Real frames are transparent and sit on it. */
  stageClassName?: string;
  /** Name of the piece, used in the accessible label. */
  label?: string;
}

type Props = CommonProps & ({ frames: string[]; piece?: undefined } | { piece: PieceSpec; frames?: undefined });

/**
 * 360° viewer: drag or swipe to spin, with inertia, keyboard support and progressive loading.
 * It takes either real frames (image URLs from the pipeline) or a procedural piece (landing illustration).
 * No third-party libraries.
 */
export function Viewer360(props: Props) {
  return props.frames ? <PhotoViewer {...props} frames={props.frames} /> : <PieceViewer {...props} piece={props.piece} />;
}

function PieceViewer({ piece, ...rest }: CommonProps & { piece: PieceSpec }) {
  const { frames, ready, total } = useFrames(piece, PIECE_FRAMES, 480);
  return <SpinStage {...rest} sources={frames} ready={ready} failed={0} total={total} resolution={480} />;
}

function PhotoViewer({ frames, ...rest }: CommonProps & { frames: string[] }) {
  const { images, loaded, failed } = useImageFrames(frames);
  return <SpinStage {...rest} sources={images} ready={loaded} failed={failed} total={frames.length} resolution={768} />;
}

/** Loads image frames progressively: the first one alone, then the rest a few at a time. One retry per frame. */
function useImageFrames(urls: string[]) {
  const key = urls.join("|");
  const imagesRef = useRef<Source[]>([]);
  const [counts, setCounts] = useState({ loaded: 0, failed: 0 });

  useEffect(() => {
    const list = key ? key.split("|") : [];
    const images: Source[] = list.map(() => null);
    imagesRef.current = images;
    setCounts({ loaded: 0, failed: 0 });
    let cancelled = false;
    let next = 0;
    let active = 0;
    let loaded = 0;
    let failed = 0;
    const timers: number[] = [];

    const settle = () => {
      active -= 1;
      if (!cancelled) {
        setCounts({ loaded, failed });
        pump();
      }
    };
    const load = (index: number, attempt: number) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => {
        if (cancelled) return;
        images[index] = img;
        loaded += 1;
        settle();
      };
      img.onerror = () => {
        if (cancelled) return;
        if (attempt === 0) {
          timers.push(window.setTimeout(() => !cancelled && load(index, 1), 800));
          return;
        }
        failed += 1;
        settle();
      };
      img.src = list[index];
    };
    const pump = () => {
      // Frame 0 goes alone so it paints first; the rest follow in spin order.
      const limit = loaded + failed === 0 ? 1 : CONCURRENCY;
      while (active < limit && next < list.length) {
        active += 1;
        load(next++, 0);
      }
    };
    pump();
    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
    };
  }, [key]);

  return { images: imagesRef.current, ...counts };
}

interface StageProps extends CommonProps {
  sources: Source[];
  ready: number;
  failed: number;
  total: number;
  resolution: number;
}

function SpinStage({ sources, ready, failed, total, resolution, className = "", stageClassName = STUDIO, label }: StageProps) {
  const { t } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourcesRef = useRef(sources);
  sourcesRef.current = sources;
  const motion = useRef({ pos: 0, vel: 0, dragging: false, lastX: 0, interacted: false });
  const [angle, setAngle] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const count = Math.max(1, total);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const list = sourcesRef.current;
    if (!canvas || list.length === 0) return;
    const index = ((Math.round(motion.current.pos) % count) + count) % count;
    // A frame that is still loading (or failed) is replaced by the nearest one that is available.
    let source: Source = null;
    for (let d = 0; d < count && !source; d++) {
      source = list[(index + d) % count] ?? list[(index - d + count) % count] ?? null;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!source) return;
    const w = (source as HTMLImageElement).naturalWidth || (source as HTMLCanvasElement).width || canvas.width;
    const h = (source as HTMLImageElement).naturalHeight || (source as HTMLCanvasElement).height || canvas.height;
    const scale = Math.min(canvas.width / w, canvas.height / h);
    const dw = w * scale;
    const dh = h * scale;
    ctx.drawImage(source, (canvas.width - dw) / 2, (canvas.height - dh) / 2, dw, dh);
  }, [count]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    // Skip work while the viewer is scrolled out of view.
    let visible = true;
    const stage = canvasRef.current;
    const observer =
      stage && "IntersectionObserver" in window
        ? new IntersectionObserver(([entry]) => {
            visible = entry.isIntersecting;
          })
        : null;
    if (stage) observer?.observe(stage);
    const tick = (now: number) => {
      const m = motion.current;
      const dt = Math.min(50, now - last);
      last = now;
      if (!visible && !m.dragging) {
        raf = requestAnimationFrame(tick);
        return;
      }
      if (!m.dragging) {
        if (Math.abs(m.vel) > 0.002 && !reducedMotion) {
          m.pos += (m.vel * dt) / 16;
          m.vel *= Math.pow(0.94, dt / 16);
        } else if (!m.interacted && !reducedMotion) {
          m.pos += (count * dt) / TURN_MS;
        }
      }
      draw();
      const deg = Math.round(((((Math.round(m.pos) % count) + count) % count) / count) * 360) % 360;
      if (deg !== shown) {
        shown = deg;
        setAngle(deg);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [draw, count, reducedMotion]);

  const markInteracted = () => {
    motion.current.interacted = true;
    setInteracted(true);
  };

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    motion.current.dragging = true;
    motion.current.lastX = e.clientX;
    motion.current.vel = 0;
    markInteracted();
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const m = motion.current;
    if (!m.dragging) return;
    const width = e.currentTarget.getBoundingClientRect().width || 1;
    const dx = e.clientX - m.lastX;
    m.lastX = e.clientX;
    const delta = (-dx / width) * count * 0.9;
    m.pos += delta;
    m.vel = delta * 0.6 + m.vel * 0.4;
  };

  const onPointerUp = () => {
    motion.current.dragging = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, Home: 0, End: 0 };
    if (!(e.key in steps)) return;
    e.preventDefault();
    markInteracted();
    motion.current.vel = 0;
    if (e.key === "Home") motion.current.pos = 0;
    else if (e.key === "End") motion.current.pos = count - 1;
    else motion.current.pos = Math.round(motion.current.pos) + steps[e.key];
  };

  const allFailed = total > 0 && failed >= total;
  const loading = ready + failed < total;

  return (
    <div className={`p-1.5 ${className}`}>
      <div
        className={`relative aspect-square cursor-grab touch-pan-y select-none overflow-hidden rounded-[1.4rem] active:cursor-grabbing ${stageClassName}`}
        tabIndex={0}
        role="slider"
        aria-orientation="horizontal"
        aria-label={label ? t("viewer.ariaNamed", { name: label }) : t("viewer.aria")}
        aria-valuemin={0}
        aria-valuemax={359}
        aria-valuenow={angle}
        aria-valuetext={`${angle}°`}
        aria-busy={loading}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onFocus={markInteracted}
      >
        {ready === 0 && !allFailed && <span className="absolute inset-[18%] animate-pulse-soft rounded-full bg-white/50" aria-hidden="true" />}
        <canvas ref={canvasRef} width={resolution} height={resolution} className="pointer-events-none relative block size-full" />
        {allFailed && (
          <span className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-ink-soft" role="status">
            <span className="flex flex-col items-center gap-2">
              <LuImageOff aria-hidden="true" className="size-6" />
              {t("viewer.failed")}
            </span>
          </span>
        )}
        {!interacted && ready > 0 && (
          <span
            className="absolute bottom-3.5 left-1/2 inline-flex -translate-x-1/2 animate-pulse-soft items-center gap-1.5 whitespace-nowrap rounded-full bg-clay-950/80 px-3 py-1 text-[0.8rem] font-medium text-paper backdrop-blur"
            aria-hidden="true"
          >
            <LuMoveHorizontal className="size-3.5" /> {t("viewer.drag")}
          </span>
        )}
        {loading && !allFailed && (
          <span className="absolute left-3 top-3 rounded-full bg-white/80 px-2.5 py-0.5 text-xs text-ink-soft" aria-hidden="true">
            {t("viewer.loading")} {ready}/{total}
          </span>
        )}
        <span className="absolute right-3 top-3 rounded-full bg-white/80 px-2.5 py-0.5 text-xs tabular-nums text-ink-soft" aria-hidden="true">
          {angle}°
        </span>
      </div>
      <div className="mx-2.5 mb-1 mt-3 h-1 overflow-hidden rounded-full bg-paper-2" aria-hidden="true">
        <span className="block h-full rounded-full bg-brand" style={{ width: `${(angle / 360) * 100}%` }} />
      </div>
    </div>
  );
}
