import { useI18n, type TKey } from "../i18n";
import { CURRENCIES, TONES, type Tone } from "../lib/api";
import { readableAccent } from "../lib/product";
import { label } from "./ui";

export interface BrandDraft {
  name: string;
  tone: Tone;
  colors: string[];
}

/** WhatsApp numbers are stored as digits with the country code (8 to 15 digits). */
export function whatsappDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export function isValidWhatsapp(value: string): boolean {
  const digits = whatsappDigits(value);
  return digits.length >= 8 && digits.length <= 15;
}

/** Store name, tone chips and a four-color palette, with a live preview. */
export function BrandEditor({
  value,
  onChange,
  suggestedName,
  idPrefix,
}: {
  value: BrandDraft;
  onChange: (next: BrandDraft) => void;
  suggestedName?: string;
  idPrefix: string;
}) {
  const { t } = useI18n();
  const { name, tone, colors } = value;
  return (
    <div className="grid gap-4">
      <label className={label}>
        {t("brand.name")}
        <input value={name} onChange={(e) => onChange({ ...value, name: e.target.value })} maxLength={60} required />
      </label>
      {suggestedName && suggestedName !== name && (
        <p className="-mt-2 text-sm text-ink-soft">
          {t("brand.suggestedName")}{" "}
          <button
            type="button"
            className="cursor-pointer rounded-full border border-line bg-white px-2.5 py-0.5 font-semibold text-ink hover:border-ink/40"
            onClick={() => onChange({ ...value, name: suggestedName })}
          >
            {t("brand.useSuggested", { name: suggestedName })}
          </button>
        </p>
      )}
      <div>
        <span className="mb-1.5 block text-sm font-semibold" id={`${idPrefix}-tone`}>
          {t("brand.tone")}
        </span>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-labelledby={`${idPrefix}-tone`}>
          {TONES.map((tn) => (
            <button
              key={tn}
              type="button"
              role="radio"
              aria-checked={tone === tn}
              className={`cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                tone === tn ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-ink/40"
              }`}
              onClick={() => onChange({ ...value, tone: tn })}
            >
              {t(`tone.${tn}` as TKey)}
            </button>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">{t("brand.palette")}</span>
        <div className="flex gap-2.5">
          {colors.map((c, i) => (
            <label
              key={i}
              className="relative size-12 cursor-pointer overflow-hidden rounded-full border-[3px] border-white shadow-[0_0_0_1px_var(--color-line),0_6px_14px_-4px_rgb(0_0_0/0.25)] transition-transform hover:scale-110 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-terracotta-deep"
              style={{ background: c }}
            >
              <input
                className="absolute -inset-2 size-[70px] cursor-pointer border-0 p-0 opacity-0"
                type="color"
                value={c}
                aria-label={t("brand.color", { n: i + 1 })}
                onChange={(e) => onChange({ ...value, colors: colors.map((old, j) => (j === i ? e.target.value : old)) })}
              />
            </label>
          ))}
        </div>
      </div>
      <div>
        <span className="mb-1.5 block text-sm font-semibold">{t("brand.preview")}</span>
        <div className="relative flex flex-col gap-0.5 overflow-hidden rounded-2xl border border-line p-5 text-ink" style={{ background: colors[1] }}>
          <strong className="relative z-10 break-words pr-16 font-display text-2xl font-medium" style={{ color: readableAccent(colors) }}>
            {name || "…"}
          </strong>
          <span className="relative z-10">{t(`tone.${tone}` as TKey)}</span>
          <i className="absolute -right-5 -top-5 size-24 rounded-full opacity-85" style={{ background: colors[0] }} aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

/** WhatsApp number and currency, the two things a store needs before it can publish. */
export function ContactFields({
  whatsapp,
  currency,
  onWhatsapp,
  onCurrency,
  whatsappError,
}: {
  whatsapp: string;
  currency: string;
  onWhatsapp: (v: string) => void;
  onCurrency: (v: string) => void;
  whatsappError?: string;
}) {
  const { t } = useI18n();
  return (
    <div className="grid gap-4">
      <label className={label}>
        {t("publish.whatsapp")}
        <input
          value={whatsapp}
          onChange={(e) => onWhatsapp(e.target.value.replace(/[^0-9+ ()-]/g, ""))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="+51 999 999 999"
          aria-invalid={!!whatsappError}
        />
        <small className={`font-normal ${whatsappError ? "font-semibold text-terracotta-deep" : "text-ink-soft"}`}>{whatsappError ?? t("publish.whatsappHint")}</small>
      </label>
      <label className={label}>
        {t("publish.currency")}
        <select value={currency} onChange={(e) => onCurrency(e.target.value)}>
          {CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
    </div>
  );
}
