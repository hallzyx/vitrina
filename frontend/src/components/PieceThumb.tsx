import { useEffect, useRef } from "react";
import { renderFrame, type PieceSpec } from "../lib/render";

const thumbs = new Map<string, HTMLCanvasElement>();

export function PieceThumb({ piece, size = 320, className = "" }: { piece: PieceSpec; size?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const key = `${piece.id}:${size}`;
    let source = thumbs.get(key);
    if (!source) {
      source = renderFrame(piece, 0.5, size);
      thumbs.set(key, source);
    }
    const ctx = ref.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, 0, 0);
    }
  }, [piece, size]);

  return <canvas ref={ref} width={size} height={size} className={`thumb ${className}`} aria-hidden="true" />;
}
