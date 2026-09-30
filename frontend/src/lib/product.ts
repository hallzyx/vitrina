/** Small, pure helpers shared by the store, product, dashboard and create screens. */
import type { CSSProperties } from "react";
import type { TKey } from "../i18n";
import { ApiRequestError, PIPELINE_ERRORS, type Brand, type Lang, type PublicProduct } from "./api";

const HEX = /^#[0-9a-f]{6}$/i;
export const DEFAULT_COLORS = ["#c2623f", "#e9c9a6", "#6b7a4f", "#2b2622"];

/** Four palette colors, validated (they end up in inline styles) and padded with the house palette. */
export function paletteOf(brand: Brand | undefined): string[] {
  const colors = (brand?.colors ?? []).filter((c) => HEX.test(c));
  return DEFAULT_COLORS.map((fallback, i) => colors[i] ?? fallback);
}

export function brandStyle(brand: Brand | undefined): CSSProperties {
  const [brandColor, soft] = paletteOf(brand);
  return { "--brand": brandColor, "--brand-soft": soft } as CSSProperties;
}

/** Name and description in the active language, falling back to the other one, then to the plain name. */
export function productText(product: Pick<PublicProduct, "copy" | "name">, lang: Lang): { name: string; description: string; lang: Lang } {
  const other: Lang = lang === "en" ? "es" : "en";
  for (const code of [lang, other]) {
    const block = product.copy?.[code];
    if (block?.name) return { name: block.name, description: block.description ?? "", lang: code };
  }
  return { name: product.name ?? "", description: "", lang };
}

export function thumbOf(product: Pick<PublicProduct, "thumbs" | "frames">): string | undefined {
  return product.thumbs?.[0] ?? product.frames?.[0];
}

/** Demonstration products come from the sample photo sets (renders of 3D scans), never from an artisan's photos. */
export function isDemoProduct(product: Pick<PublicProduct, "sampleId">, storeIsDemo = false): boolean {
  return storeIsDemo || !!product.sampleId;
}

export function isReady(product: Pick<PublicProduct, "status">): boolean {
  return product.status === "ready_360" || product.status === "ready_3d";
}

export function whatsappLink(number: string, message: string): string | null {
  const digits = number.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function hasPrice(price: number | undefined | null): price is number {
  return typeof price === "number" && Number.isFinite(price);
}

/** Translation key for a failed pipeline run, by its error code. */
export function pipelineErrorKey(code: string | undefined): TKey {
  const known = (PIPELINE_ERRORS as readonly string[]).includes(code ?? "") ? code : "internal_error";
  return `pipelineError.${known}` as TKey;
}

/** Translation key for a failed API call, with the most useful wording for the user. */
export function apiErrorKey(err: unknown): TKey {
  if (!(err instanceof ApiRequestError)) return "error.unexpected";
  if (err.status === 0) return "error.network";
  if (err.status === 403) return "error.forbidden";
  if (err.status === 404) return "error.notFound";
  if (err.status === 429) return "error.tooMany";
  if (err.status >= 500) return "error.server";
  if (err.code === "invalid_request") return "error.invalid";
  return "error.unexpected";
}
