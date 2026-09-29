/**
 * Shared Tailwind class recipes. Keeping them here gives every screen the same
 * buttons, cards and chips without a component library.
 */

export type ButtonVariant = "primary" | "brand" | "outline" | "ghost" | "light" | "whatsapp" | "outlineLight";
export type ButtonSize = "sm" | "md" | "lg";

const BUTTON_BASE =
  "group/btn relative inline-flex items-center justify-center gap-2 rounded-full border-[1.5px] font-semibold no-underline " +
  "cursor-pointer select-none whitespace-nowrap transition-[transform,box-shadow,background-color,color,border-color] duration-200 ease-out-soft " +
  "hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-45";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-transparent bg-terracotta-deep text-white shadow-[0_10px_24px_-10px_rgb(164_71_42/0.8)] hover:bg-[#8f3b20] hover:shadow-[0_16px_30px_-12px_rgb(164_71_42/0.9)]",
  brand: "border-transparent bg-brand-strong text-white shadow-[0_10px_24px_-12px_var(--brand)] hover:brightness-110",
  outline: "border-ink/80 bg-transparent text-ink hover:bg-ink hover:text-paper",
  ghost: "border-transparent bg-transparent text-ink hover:bg-ink/[0.06]",
  light: "border-transparent bg-paper text-clay-950 hover:bg-white shadow-[0_10px_30px_-12px_rgb(0_0_0/0.6)]",
  outlineLight: "border-paper/40 bg-white/[0.04] text-paper backdrop-blur-sm hover:border-paper hover:bg-paper hover:text-clay-950",
  whatsapp: "border-transparent bg-whatsapp text-white shadow-[0_10px_24px_-10px_rgb(21_128_61/0.8)] hover:bg-[#116932]",
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: "px-3.5 py-1.5 text-sm",
  md: "px-5 py-2.5 text-[0.95rem]",
  lg: "px-6 py-3.5 text-base",
};

export function btn(variant: ButtonVariant = "primary", size: ButtonSize = "md", extra = ""): string {
  return `${BUTTON_BASE} ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${extra}`.trim();
}

export const card = "rounded-card border border-line bg-card shadow-card";

export const eyebrow = "text-[0.72rem] font-bold uppercase tracking-[0.18em]";

export const label = "grid gap-1.5 text-sm font-semibold";

export const muted = "text-ink-soft";
