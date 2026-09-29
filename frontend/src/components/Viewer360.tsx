import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useI18n } from "../i18n";
import { useFrames, type PieceSpec } from "../lib/render";

const TOTAL_FRAMES = 24;

interface Props {
  piece: PieceSpec;
  className?: string;
  showTabs?: boolean;
}

/**
 * 360° viewer: drag or swipe to spin, with inertia, keyboard support and progressive loading.
 * No third-party libraries. It only needs an ordered list of frames.
 */
export function Viewer360({ piece, className = "", showTabs = true }: Props) {
  const { t } = useI18n();
  const { frames, ready, total } = useFrames(piece, TOTAL_FRAMES, 480);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const motion = useRef({ pos: 0, vel: 0, dragging: false, lastX: 0, interacted: false });
  const [angle, setAngle] = useState(0);
  const [interacted, setInteracted] = useState(false);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const available = framesRef.current;
    if (!canvas || available.length === 0) return;
    const index = ((Math.round(motion.current.pos) % total) + total) % total;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(available[index % available.length], 0, 0, canvas.width, canvas.height);
  }, [total]);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let shown = -1;
    const tick = (now: number) => {
      const m = motion.current;
      const dt = Math.min(50, now - last);
      last = now;
      if (!m.dragging) {
        if (Math.abs(m.vel) > 0.002) {
          m.pos += (m.vel * dt) / 16;
          m.vel *= Math.pow(0.94, dt / 16);
        } else if (!m.interacted && !reducedMotion) {
          m.pos += (0.06 * dt) / 16;
        }
      }
      draw();
      const deg = Math.round((((m.pos % total) + total) % total) / total * 360) % 360;
      if (deg !== shown) {
        shown = deg;
        setAngle(deg);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [draw, total, reducedMotion]);

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
    const delta = (-dx / width) * total * 0.9;
    m.pos += delta;
    m.vel = delta * 0.6 + m.vel * 0.4;
  };

  const onPointerUp = () => {
    motion.current.dragging = false;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    markInteracted();
    motion.current.pos += e.key === "ArrowRight" ? 1 : -1;
  };

  return (
    <div className={`viewer ${className}`}>
      {showTabs && (
        <div className="viewer-tabs" role="tablist">
          <button role="tab" aria-selected="true" className="viewer-tab is-active" type="button">
            {t("viewer.tab360")}
          </button>
          <button role="tab" aria-selected="false" className="viewer-tab" type="button" disabled title={t("viewer.3dOff")}>
            {t("viewer.tab3d")}
          </button>
        </div>
      )}
      <div
        className="viewer-stage"
        tabIndex={0}
        role="img"
        aria-label={t("viewer.aria")}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <canvas ref={canvasRef} width={480} height={480} />
        {!interacted && ready > 0 && (
          <span className="viewer-hint" aria-hidden="true">
            ⟷ {t("viewer.drag")}
          </span>
        )}
        {ready < total && (
          <span className="viewer-loading">
            {t("viewer.loading")} {ready}/{total}
          </span>
        )}
        <span className="viewer-angle" aria-hidden="true">
          {angle}°
        </span>
      </div>
      <div className="viewer-ring" aria-hidden="true">
        <span style={{ width: `${(angle / 360) * 100}%` }} />
      </div>
    </div>
  );
}
