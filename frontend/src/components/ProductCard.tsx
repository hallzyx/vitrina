import { useState } from "react";
import { LuArrowUpRight, LuBox, LuImageOff, LuRotate3D } from "react-icons/lu";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n";
import type { PublicProduct } from "../lib/api";
import { hasPrice, isDemoProduct, productText, thumbOf } from "../lib/product";

export { brandStyle } from "../lib/product";

interface Props {
  slug: string;
  currency: string;
  product: PublicProduct;
  storeIsDemo?: boolean;
  spinLabel?: string;
}

/** Product tile shared by the store grid and "more from this store". */
export function ProductCard({ slug, currency, product, storeIsDemo = false, spinLabel }: Props) {
  const { t, lang, money } = useI18n();
  const text = productText(product, lang);
  const thumb = thumbOf(product);
  const [broken, setBroken] = useState(false);
  const demo = isDemoProduct(product, storeIsDemo);
  return (
    <Link
      to={`/s/${slug}/${product.id}`}
      className="group block overflow-hidden rounded-card border border-line bg-card no-underline shadow-card transition-[transform,box-shadow] duration-300 ease-out-soft hover:-translate-y-1 hover:shadow-lift"
    >
      <div className="relative aspect-square bg-[radial-gradient(circle_at_50%_38%,#fff,#f1e6d7)]">
        {thumb && !broken ? (
          <img
            src={thumb}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            className="block size-full object-contain p-2 transition-transform duration-700 ease-out-soft group-hover:scale-105 sm:p-3"
          />
        ) : (
          <span className="grid size-full place-items-center text-ink-soft" aria-hidden="true">
            <LuImageOff className="size-7" />
          </span>
        )}
        {demo && (
          <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-[0.68rem] font-bold uppercase tracking-wider text-[#6b4a07]">
            <LuBox aria-hidden="true" className="size-3" /> {t("badge.demoShort")}
          </span>
        )}
        {spinLabel && (
          <span className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1 rounded-full bg-clay-950/80 px-2.5 py-1 text-[0.72rem] font-semibold text-paper backdrop-blur">
            <LuRotate3D aria-hidden="true" className="size-3.5" /> {spinLabel}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2 px-3.5 pb-3.5 pt-3 sm:px-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-base font-medium leading-snug text-ink sm:text-lg" lang={text.lang}>
            {text.name || t("product.untitled")}
          </h3>
          {hasPrice(product.price) && <span className="text-sm font-bold text-brand-strong">{money(product.price, currency)}</span>}
        </div>
        <LuArrowUpRight
          aria-hidden="true"
          className="mb-0.5 size-5 shrink-0 text-ink-soft transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink"
        />
      </div>
    </Link>
  );
}
