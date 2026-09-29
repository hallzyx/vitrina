import type { CSSProperties } from "react";
import { LuArrowUpRight, LuRotate3D } from "react-icons/lu";
import { Link } from "react-router-dom";
import type { Product, Store } from "../data/mock";
import { useI18n } from "../i18n";
import { PieceThumb } from "./PieceThumb";

export function brandStyle(store: Store): CSSProperties {
  return { "--brand": store.colors[0], "--brand-soft": store.colors[1] } as CSSProperties;
}

/** Product tile shared by the store grid and "more from this store". */
export function ProductCard({ store, product, size = 320, spinLabel }: { store: Store; product: Product; size?: number; spinLabel?: string }) {
  const { l, money } = useI18n();
  return (
    <Link
      to={`/s/${store.slug}/${product.id}`}
      className="group block overflow-hidden rounded-card border border-line bg-card no-underline shadow-card transition-[transform,box-shadow] duration-300 ease-out-soft hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative bg-[radial-gradient(circle_at_50%_38%,#fff,#f1e6d7)]">
        <div className="p-2 transition-transform duration-700 ease-out-soft group-hover:scale-105 sm:p-3">
          <PieceThumb piece={product.piece} size={size} />
        </div>
        {spinLabel && (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-clay-950/80 px-2.5 py-1 text-[0.72rem] font-semibold text-paper backdrop-blur">
            <LuRotate3D aria-hidden="true" className="size-3.5" /> {spinLabel}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 px-3.5 pb-3.5 pt-3 sm:px-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-medium text-ink sm:text-lg">{l(product.name)}</h3>
          <span className="text-sm font-bold text-brand-strong">{money(product.price, store.currency)}</span>
        </div>
        <LuArrowUpRight aria-hidden="true" className="mb-0.5 size-5 shrink-0 text-ink-soft transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
      </div>
    </Link>
  );
}
