import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { LuCamera, LuCheck, LuKeyRound, LuPartyPopper } from "react-icons/lu";
import { CopyButton, RealBadge, Topbar } from "../components/Chrome";
import { InviteGate } from "../components/InviteGate";
import { PieceThumb } from "../components/PieceThumb";
import { btn, card, eyebrow, label } from "../components/ui";
import { Viewer360 } from "../components/Viewer360";
import { EXAMPLE_STORE, VASE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";
import { ApiRequestError, clearStoredCode, getStoredCode, verifyAccessCode } from "../lib/api";
import { renderFrame } from "../lib/render";

type Step = "capture" | "brand" | "processing" | "result" | "publish";

const TARGET_PHOTOS = 12;
const MIN_PHOTOS = 6;
const TONES = ["warm", "minimal", "rustic", "playful"] as const;
type Tone = (typeof TONES)[number];

const PIPELINE: TKey[] = [
  "processing.validate",
  "processing.background",
  "processing.align",
  "processing.brand",
  "processing.fidelity",
  "processing.listing",
  "processing.ready",
];

function randomToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export function CreateFlow() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const addMode = params.get("add") === "1";
  const steps: Step[] = addMode ? ["capture", "processing", "result", "publish"] : ["capture", "brand", "processing", "result", "publish"];

  // Creating a store needs the invite phrase; adding a product later uses the edit token instead.
  const [access, setAccess] = useState<"checking" | "locked" | "open">(() =>
    addMode ? "open" : getStoredCode() ? "checking" : "locked",
  );
  useEffect(() => {
    if (access !== "checking") return;
    let cancelled = false;
    verifyAccessCode(getStoredCode() ?? "")
      .then(() => !cancelled && setAccess("open"))
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof ApiRequestError && err.status === 401) clearStoredCode();
        setAccess("locked");
      });
    return () => {
      cancelled = true;
    };
  }, [access]);

  const [step, setStep] = useState<Step>("capture");
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [storeName, setStoreName] = useState(t("brand.defaultName"));
  const [tone, setTone] = useState<Tone>("warm");
  const [colors, setColors] = useState<string[]>(EXAMPLE_STORE.colors);
  const [published, setPublished] = useState<{ token: string } | null>(null);

  const index = steps.indexOf(step);
  const next = () => setStep(steps[Math.min(index + 1, steps.length - 1)]);
  const back = () => (index === 0 ? navigate("/") : setStep(steps[index - 1]));

  return (
    <>
      <Topbar />
      <main className="grain relative flex justify-center px-4 pb-12 pt-4 sm:pt-8">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-80 bg-[radial-gradient(60%_100%_at_50%_0%,rgb(194_98_63/0.14),transparent)]"
          aria-hidden="true"
        />
        <div className="w-full max-w-[460px] rounded-sheet border border-line bg-card px-5 pb-6 pt-5 shadow-lift sm:px-6">
          {access === "locked" && <InviteGate onUnlocked={() => setAccess("open")} />}
          {access === "checking" && (
            <p className="py-10 text-center text-ink-soft" role="status">
              {t("gate.checking")}
            </p>
          )}
          {access === "open" && (
          <>
          <nav className="mb-2 flex gap-1.5" aria-label={t("create.stepOf", { n: index + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <span
                key={s}
                className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${
                  i === index ? "bg-terracotta" : i < index ? "bg-terracotta/45" : "bg-paper-2"
                }`}
                aria-current={i === index ? "step" : undefined}
              >
                <span className="sr-only">{t(`create.step.${s}` as TKey)}</span>
              </span>
            ))}
          </nav>
          <p className="mb-4 text-center text-sm text-ink-soft">
            {t("create.stepOf", { n: index + 1, total: steps.length })} · {t(`create.step.${step}` as TKey)}
          </p>
          <div key={step} className="animate-rise">

          {step === "capture" && (
            <Capture
              photos={photos}
              setPhotos={setPhotos}
              name={name}
              setName={setName}
              price={price}
              setPrice={setPrice}
              notes={notes}
              setNotes={setNotes}
              onBack={back}
              onNext={next}
            />
          )}
          {step === "brand" && (
            <BrandStep
              storeName={storeName}
              setStoreName={setStoreName}
              tone={tone}
              setTone={setTone}
              colors={colors}
              setColors={setColors}
              onBack={back}
              onNext={next}
            />
          )}
          {step === "processing" && <Processing onDone={next} />}
          {step === "result" && (
            <Result storeName={storeName} name={name} notes={notes} onBack={back} onNext={next} />
          )}
          {step === "publish" && (
            <Publish published={published} onPublish={() => setPublished({ token: randomToken() })} onBack={back} />
          )}
          </div>
          </>
          )}
        </div>
      </main>
    </>
  );
}

/* ───────────── 1. Guided capture ───────────── */

interface CaptureProps {
  photos: string[];
  setPhotos: (p: string[]) => void;
  name: string;
  setName: (v: string) => void;
  price: string;
  setPrice: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onBack: () => void;
  onNext: () => void;
}

function Capture({ photos, setPhotos, name, setName, price, setPrice, notes, setNotes, onBack, onNext }: CaptureProps) {
  const { t } = useI18n();
  const count = photos.length;

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).slice(0, 24 - count);
    setPhotos([...photos, ...files.map((f) => URL.createObjectURL(f))]);
    e.target.value = "";
  };

  const useDemo = () => {
    const demo = Array.from({ length: TARGET_PHOTOS }, (_, i) =>
      renderFrame(VASE, (i / TARGET_PHOTOS) * Math.PI * 2, 160).toDataURL("image/png"),
    );
    setPhotos(demo);
  };

  return (
    <section>
      <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("capture.title")}</h1>
      <p className="text-ink-soft">{t("capture.subtitle")}</p>

      <div
        className="relative mx-auto my-5 aspect-square w-full max-w-[300px] [container-type:inline-size]"
        role="img"
        aria-label={t("capture.count", { n: count, total: TARGET_PHOTOS })}
      >
        <div className="absolute inset-[11%] rounded-full border border-dashed border-sand" aria-hidden="true" />
        {Array.from({ length: TARGET_PHOTOS }, (_, i) => {
          const a = (i / TARGET_PHOTOS) * 360;
          const filled = i < count;
          return (
            <span
              key={i}
              className={`absolute left-1/2 top-1/2 -m-3 grid size-6 place-items-center rounded-full border-2 transition-all duration-300 ${
                filled ? "border-terracotta bg-terracotta text-white" : "border-dashed border-[#cbbfae] bg-white"
              }`}
              style={{ transform: `rotate(${a}deg) translateY(-40cqw) rotate(${-a}deg)`, transitionDelay: `${i * 25}ms` }}
            >
              {filled && <LuCheck aria-hidden="true" className="size-3" strokeWidth={3.5} />}
            </span>
          );
        })}
        <div className="absolute inset-[22%] flex flex-col items-center justify-center gap-1 text-center text-[0.8rem]">
          <PieceThumb piece={VASE} size={160} className="w-[70%]" />
          <strong className="tabular-nums">{t("capture.count", { n: count, total: TARGET_PHOTOS })}</strong>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        <label className={btn("primary")}>
          <LuCamera aria-hidden="true" className="size-4" /> {t("capture.add")}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" hidden onChange={onFiles} />
        </label>
        <button type="button" className={btn("outline")} onClick={useDemo}>
          {t("capture.demo")}
        </button>
        {count > 0 && (
          <button type="button" className={btn("ghost")} onClick={() => setPhotos([])}>
            {t("capture.clear")}
          </button>
        )}
      </div>

      {count > 0 && (
        <ul className="mb-4 grid grid-cols-4 gap-1.5">
          {photos.map((src, i) => (
            <li key={`${i}-${src.slice(-12)}`} className="aspect-square overflow-hidden rounded-xl bg-paper-2">
              <img src={src} alt="" className="block size-full object-cover" />
            </li>
          ))}
        </ul>
      )}

      <div className="my-4 grid gap-4">
        <label className={label}>
          {t("capture.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("capture.namePh")} maxLength={80} />
        </label>
        <label className={label}>
          {t("capture.price")}
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="48" />
        </label>
        <label className={label}>
          {t("capture.notes")}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("capture.notesPh")} rows={3} maxLength={400} />
        </label>
      </div>

      <details className="my-4 rounded-2xl bg-paper px-4 py-3 text-[0.92rem]" open>
        <summary className="cursor-pointer font-bold">{t("capture.tipsTitle")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft marker:text-terracotta">
          <li>{t("capture.tip1")}</li>
          <li>{t("capture.tip2")}</li>
          <li>{t("capture.tip3")}</li>
        </ul>
      </details>
      <p className="text-sm text-ink-soft">{t("capture.demoNote")}</p>

      {count < MIN_PHOTOS && <p className="mt-3 text-sm font-semibold text-[#9a4a26]">{t("capture.min", { min: MIN_PHOTOS })}</p>}
      <div className="mt-6 flex justify-between gap-2.5">
        <button type="button" className={btn("ghost")} onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className={btn("primary", "md", "flex-1")} disabled={count < MIN_PHOTOS} onClick={onNext}>
          {t("common.continue")}
        </button>
      </div>
    </section>
  );
}

/* ───────────── 2. Brand (first product only) ───────────── */

interface BrandProps {
  storeName: string;
  setStoreName: (v: string) => void;
  tone: Tone;
  setTone: (v: Tone) => void;
  colors: string[];
  setColors: (v: string[]) => void;
  onBack: () => void;
  onNext: () => void;
}

function BrandStep({ storeName, setStoreName, tone, setTone, colors, setColors, onBack, onNext }: BrandProps) {
  const { t } = useI18n();
  return (
    <section>
      <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("brand.title")}</h1>
      <p className="text-ink-soft">{t("brand.subtitle")}</p>
      <p className={`${eyebrow} mt-5 text-terracotta-deep`}>{t("brand.suggested")}</p>

      <div className="my-4 grid gap-4">
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
                  aria-label={`${t("brand.palette")} ${i + 1}`}
                  onChange={(e) => setColors(colors.map((old, j) => (j === i ? e.target.value : old)))}
                />
              </label>
            ))}
          </div>
        </div>
        <label className={label}>
          {t("brand.name")}
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={60} />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-semibold">{t("brand.tone")}</span>
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t("brand.tone")}>
            {TONES.map((tn) => (
              <button
                key={tn}
                type="button"
                role="radio"
                aria-checked={tone === tn}
                className={`cursor-pointer rounded-full border-[1.5px] px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                  tone === tn ? "border-ink bg-ink text-paper" : "border-line bg-white hover:border-ink/40"
                }`}
                onClick={() => setTone(tn)}
              >
                {t(`tone.${tn}` as TKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className={`${eyebrow} text-terracotta-deep`}>{t("brand.preview")}</p>
      <div className="relative mt-2 flex flex-col gap-0.5 overflow-hidden rounded-2xl p-5" style={{ background: colors[1], color: colors[3] }}>
        <strong className="font-display text-2xl font-medium" style={{ color: colors[0] }}>
          {storeName || "…"}
        </strong>
        <span>{t(`tone.${tone}` as TKey)}</span>
        <i className="absolute -right-5 -top-5 size-24 rounded-full opacity-85" style={{ background: colors[0] }} />
      </div>

      <div className="mt-6 flex justify-between gap-2.5">
        <button type="button" className={btn("ghost")} onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className={btn("primary", "md", "flex-1")} onClick={onNext}>
          {t("common.continue")}
        </button>
      </div>
    </section>
  );
}

/* ───────────── 3. Processing (simulated) ───────────── */

function Processing({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [done, setDone] = useState(0);

  useEffect(() => {
    if (done >= PIPELINE.length) {
      const id = setTimeout(onDone, 700);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setDone((d) => d + 1), 850);
    return () => clearTimeout(id);
  }, [done, onDone]);

  const percent = Math.round((done / PIPELINE.length) * 100);

  return (
    <section>
      <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("processing.title")}</h1>
      <p className="text-ink-soft">{t("processing.subtitle")}</p>
      <div
        className="my-5 h-2.5 overflow-hidden rounded-full bg-paper-2"
        role="progressbar"
        aria-label={t("processing.title")}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,var(--color-terracotta),var(--color-ochre))] transition-[width] duration-700 ease-out-soft"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ol className="mb-4 grid gap-2">
        {PIPELINE.map((key, i) => {
          const state = i < done ? "done" : i === done ? "active" : "todo";
          return (
            <li
              key={key}
              className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition-all duration-300 ${
                state === "active" ? "bg-terracotta/10 font-bold text-ink" : state === "done" ? "bg-paper text-ink" : "bg-paper text-ink-soft"
              }`}
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                  state === "done"
                    ? "border-olive bg-olive text-white"
                    : state === "active"
                      ? "animate-pulse-soft border-terracotta text-terracotta"
                      : "border-[#d8cdbd]"
                }`}
                aria-hidden="true"
              >
                {state === "done" ? (
                  <LuCheck className="size-3.5" strokeWidth={3.5} />
                ) : state === "active" ? (
                  <span className="size-1.5 rounded-full bg-terracotta" />
                ) : null}
              </span>
              {t(key)}
            </li>
          );
        })}
      </ol>
      <p className="text-sm text-ink-soft">{t("processing.demoNote")}</p>
    </section>
  );
}

/* ───────────── 4. Viewer + listing ───────────── */

interface ResultProps {
  storeName: string;
  name: string;
  notes: string;
  onBack: () => void;
  onNext: () => void;
}

function Result({ storeName, name, notes, onBack, onNext }: ResultProps) {
  const { t } = useI18n();
  const defaults = useMemo(
    () => ({
      nameEn: name || "Blue clay vase",
      nameEs: name || t("result.defaultName"),
      descEn: notes || t("result.defaultDescEn", { store: storeName }),
      descEs: notes || t("result.defaultDescEs", { store: storeName }),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [nameEn, setNameEn] = useState(defaults.nameEn);
  const [nameEs, setNameEs] = useState(defaults.nameEs);
  const [descEn, setDescEn] = useState(defaults.descEn);
  const [descEs, setDescEs] = useState(defaults.descEs);

  return (
    <section>
      <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("result.title")}</h1>
      <div className={`${card} mt-3 p-1`}>
        <Viewer360 piece={VASE} />
      </div>
      <div className="mb-1 mt-3 flex flex-wrap items-center gap-2.5">
        <RealBadge />
        <span className="text-sm text-ink-soft">
          {t("result.fidelity")} 0.93 · {t("result.frames", { n: 24 })}
        </span>
      </div>
      <p className="text-sm text-ink-soft">{t("result.demoNote")}</p>

      <h2 className="mb-1 mt-6 text-2xl font-medium">{t("result.listing")}</h2>
      <p className="text-sm text-ink-soft">{t("result.listingNote")}</p>
      <div className="my-4 grid gap-4">
        <label className={label}>
          {t("result.nameEn")}
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={80} />
        </label>
        <label className={label}>
          {t("result.descEn")}
          <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={2} maxLength={400} />
        </label>
        <label className={label}>
          {t("result.nameEs")}
          <input value={nameEs} onChange={(e) => setNameEs(e.target.value)} maxLength={80} />
        </label>
        <label className={label}>
          {t("result.descEs")}
          <textarea value={descEs} onChange={(e) => setDescEs(e.target.value)} rows={2} maxLength={400} />
        </label>
      </div>

      <div className="mt-6 flex justify-between gap-2.5">
        <button type="button" className={btn("ghost")} onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className={btn("primary", "md", "flex-1")} onClick={onNext}>
          {t("result.publish")}
        </button>
      </div>
    </section>
  );
}

/* ───────────── 5. Publish ───────────── */

interface PublishProps {
  published: { token: string } | null;
  onPublish: () => void;
  onBack: () => void;
}

function Publish({ published, onPublish, onBack }: PublishProps) {
  const { t } = useI18n();
  const [whatsapp, setWhatsapp] = useState("");
  const [currency, setCurrency] = useState("USD");

  if (published) {
    const origin = window.location.origin;
    const editUrl = `${origin}/edit/${published.token}`;
    const storeUrl = `${origin}/s/${EXAMPLE_STORE.slug}`;
    return (
      <section>
        <span className="mb-3 grid size-14 place-items-center rounded-full bg-olive/15 text-olive-deep" aria-hidden="true">
          <LuPartyPopper className="size-7" />
        </span>
        <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("publish.done")}</h1>
        <div className="my-4 grid gap-4">
          <div>
            <span className="mb-1.5 block text-sm font-semibold">{t("publish.storeLink")}</span>
            <div className="flex gap-2">
              <input readOnly value={storeUrl} aria-label={t("publish.storeLink")} className="min-w-0 flex-1 text-sm" />
              <CopyButton text={storeUrl} />
            </div>
          </div>
          <div className="rounded-2xl border border-terracotta/30 bg-[color-mix(in_oklab,var(--color-terracotta)_9%,white)] p-4">
            <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold">
              <LuKeyRound aria-hidden="true" className="size-4 text-terracotta-deep" /> {t("publish.editLinkTitle")}
            </span>
            <div className="flex gap-2">
              <input readOnly value={editUrl} aria-label={t("publish.editLinkTitle")} className="min-w-0 flex-1 text-sm" />
              <CopyButton text={editUrl} />
            </div>
            <p className="mt-2 text-sm">{t("publish.editLinkWarn")}</p>
          </div>
        </div>
        <p className="text-sm text-ink-soft">{t("publish.demoNote")}</p>
        <div className="mt-6 flex justify-between gap-2.5">
          <Link to={`/edit/${published.token}`} className={btn("outline", "md", "flex-1")}>
            {t("publish.openDashboard")}
          </Link>
          <Link to={`/s/${EXAMPLE_STORE.slug}`} className={btn("primary", "md", "flex-1")}>
            {t("publish.openStore")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1 className="mb-2 text-[1.85rem] font-medium leading-tight tracking-[-0.02em]">{t("publish.title")}</h1>
      <div className="my-4 grid gap-4">
        <label className={label}>
          {t("publish.whatsapp")}
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, ""))} inputMode="tel" placeholder="+51 999 999 999" />
          <small className="font-normal text-ink-soft">{t("publish.whatsappHint")}</small>
        </label>
        <label className={label}>
          {t("publish.currency")}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option>USD</option>
            <option>PEN</option>
            <option>EUR</option>
            <option>MXN</option>
          </select>
        </label>
      </div>
      <div className="mt-6 flex justify-between gap-2.5">
        <button type="button" className={btn("ghost")} onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className={btn("primary", "md", "flex-1")} onClick={onPublish}>
          {t("publish.cta")}
        </button>
      </div>
    </section>
  );
}
