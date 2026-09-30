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

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Contrast ratio against white (buttons use white text; text sits on near-white paper). */
function contrastOnWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * The accent the UI can actually use: the first palette color with enough contrast for white text,
 * else the darkest palette color, else the house color. Palettes extracted from pale pieces
 * (white porcelain, light wood) would otherwise make brand text and buttons unreadable.
 */
export function readableAccent(colors: string[]): string {
  const valid = colors.filter((c) => HEX.test(c));
  const good = valid.find((c) => contrastOnWhite(c) >= 3);
  if (good) return good;
  const darkest = [...valid].sort((a, b) => luminance(a) - luminance(b))[0];
  return darkest && contrastOnWhite(darkest) >= 3 ? darkest : DEFAULT_COLORS[0];
}

export function brandStyle(brand: Brand | undefined): CSSProperties {
  const palette = paletteOf(brand);
  return { "--brand": readableAccent(palette), "--brand-soft": palette[1] } as CSSProperties;
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
