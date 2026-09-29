import { useEffect, useRef } from "react";
import { renderFrame, type PieceSpec } from "../lib/render";

const thumbs = new Map<string, HTMLCanvasElement>();

interface Props {
  piece: PieceSpec;
  size?: number;
  /** Rotation of the piece in radians (the default shows its "front"). */
  angle?: number;
  className?: string;
}

export function PieceThumb({ piece, size = 320, angle = 0.5, className = "" }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const key = `${piece.id}:${size}:${angle.toFixed(3)}`;
    let source = thumbs.get(key);
    if (!source) {
      source = renderFrame(piece, angle, size);
      thumbs.set(key, source);
    }
    const ctx = ref.current?.getContext("2d");
    if (ctx) {
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(source, 0, 0);
    }
  }, [piece, size, angle]);

  return <canvas ref={ref} width={size} height={size} className={`block h-auto w-full ${className}`} aria-hidden="true" />;
}
