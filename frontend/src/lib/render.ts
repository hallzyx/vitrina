/**
 * Procedural demo pieces.
 *
 * There are no real photos yet, so the demo store renders a handful of turned objects
 * (vase, basket, bowl) as canvas frames. The 360° viewer consumes these exactly like the
 * WebP frames the real pipeline will produce. Demo only: the real product never uses this.
 */
import { useEffect, useState } from "react";

export type Shape = "vase" | "basket" | "bowl";
export type Pattern = "bands" | "weave" | "grain";
export type RGB = [number, number, number];

export interface PieceSpec {
  id: string;
  shape: Shape;
  pattern: Pattern;
  base: RGB;
  accent: RGB;
  glossy: boolean;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const fract = (x: number) => x - Math.floor(x);

/** Vertical extent of each shape, as a fraction of the canvas. */
const GEOMETRY: Record<Shape, { top: number; bottom: number }> = {
  vase: { top: 0.08, bottom: 0.9 },
  basket: { top: 0.22, bottom: 0.86 },
  bowl: { top: 0.34, bottom: 0.72 },
};

/** Radius (fraction of canvas width) at height t, where 0 is the rim and 1 is the base. */
function radius(shape: Shape, t: number): number {
  switch (shape) {
    case "vase": {
      let r = 0.15 + 0.31 * smooth(0, 0.5, t);
      r *= 1 - 0.38 * smooth(0.62, 1, t);
      r += 0.05 * (1 - smooth(0, 0.06, t));
      return r;
    }
    case "basket":
      return 0.3 + 0.13 * (1 - t) - (t > 0.94 ? (0.04 * (t - 0.94)) / 0.06 : 0);
    case "bowl":
      return Math.max(0.17, 0.47 * Math.sqrt(Math.max(0, 1 - Math.pow(t, 1.9))));
  }
}

/** 0 = base color, 1 = accent color. `u` is the angle around the piece, `v` the height. */
function patternMix(pattern: Pattern, u: number, v: number): number {
  if (pattern === "bands") {
    const band = Math.sin(v * Math.PI * 11) > 0.78 ? 1 : 0;
    let diamond = 0;
    if (v > 0.34 && v < 0.66) {
      const a = Math.abs(fract((u * 3) / Math.PI) - 0.5);
      const b = Math.abs(fract(v * 10) - 0.5);
      diamond = a + b < 0.28 ? 1 : 0;
    }
    return Math.max(band, diamond);
  }
  if (pattern === "weave") {
    const cu = (u * 8) / Math.PI;
    const cv = v * 24;
    if (fract(cu) < 0.09 || fract(cv) < 0.09) return 1;
    return (Math.floor(cu) + Math.floor(cv)) & 1 ? 0.5 : 0;
  }
  const ring = 0.5 + 0.5 * Math.sin(v * 80 + Math.sin(u * 2.5) * 3 + u * 0.4);
  return ring * 0.7;
}

const rgba = (c: RGB, a: number, k = 1) => `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;

export function renderFrame(spec: PieceSpec, angle: number, size: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const { top, bottom } = GEOMETRY[spec.shape];
  const y0 = Math.floor(top * size);
  const y1 = Math.floor(bottom * size);
  const cx = size / 2;

  for (let y = y0; y <= y1; y++) {
    const v = (y - y0) / (y1 - y0);
    const R = radius(spec.shape, v) * size;
    for (let x = Math.ceil(cx - R); x <= Math.floor(cx + R); x++) {
      const s = Math.max(-1, Math.min(1, (x + 0.5 - cx) / R));
      const theta = Math.asin(s);
      const m = patternMix(spec.pattern, theta + angle, v);
      const light = Math.cos(theta + 0.7);
      const shade = 0.45 + 0.65 * (0.5 + 0.5 * light);
      const gloss = spec.glossy ? Math.pow(Math.max(0, light), 24) * 0.35 * 255 : 0;
      const i = (y * size + x) * 4;
      for (let ch = 0; ch < 3; ch++) {
        const color = spec.base[ch] + (spec.accent[ch] - spec.base[ch]) * m;
        data[i + ch] = Math.min(255, color * shade + gloss);
      }
      data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);

  // Opening / rim so the top reads as a volume.
  const rimRadius = radius(spec.shape, 0) * size;
  ctx.fillStyle = rgba(spec.base, 1, 0.32);
  ctx.beginPath();
  ctx.ellipse(cx, y0, rimRadius, rimRadius * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,0.28)";
  ctx.lineWidth = Math.max(1.5, size / 240);
  ctx.stroke();

  // Soft contact shadow, drawn behind the piece.
  ctx.globalCompositeOperation = "destination-over";
  ctx.save();
  ctx.translate(cx, y1 + size * 0.008);
  ctx.scale(1, 0.16);
  const baseRadius = radius(spec.shape, 1) * size * 1.35;
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, baseRadius);
  gradient.addColorStop(0, "rgba(43,38,34,0.32)");
  gradient.addColorStop(1, "rgba(43,38,34,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, baseRadius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  return canvas;
}

const frameCache = new Map<string, HTMLCanvasElement[]>();

/** Generates frames progressively (one per tick) so the page never freezes. */
export function useFrames(spec: PieceSpec, total: number, size: number) {
  const key = `${spec.id}:${total}:${size}`;
  const [ready, setReady] = useState(() => frameCache.get(key)?.length ?? 0);

  useEffect(() => {
    let cancelled = false;
    let frames = frameCache.get(key);
    if (!frames) {
      frames = [];
      frameCache.set(key, frames);
    }
    const list = frames;
    const step = () => {
      if (cancelled) return;
      if (list.length >= total) {
        setReady(total);
        return;
      }
      list.push(renderFrame(spec, (list.length / total) * Math.PI * 2, size));
      setReady(list.length);
      setTimeout(step, 0);
    };
    step();
    return () => {
      cancelled = true;
    };
  }, [key, spec, total, size]);

  return { frames: frameCache.get(key) ?? [], ready, total };
}
