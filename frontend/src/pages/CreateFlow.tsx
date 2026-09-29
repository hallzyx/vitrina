import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CopyButton, RealBadge, Topbar } from "../components/Chrome";
import { PieceThumb } from "../components/PieceThumb";
import { Viewer360 } from "../components/Viewer360";
import { EXAMPLE_STORE, VASE } from "../data/mock";
import { useI18n, type TKey } from "../i18n";
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
      <main className="flow">
        <div className="flow-card">
          <nav className="stepper" aria-label={t("create.stepOf", { n: index + 1, total: steps.length })}>
            {steps.map((s, i) => (
              <span key={s} className={`stepper-dot ${i <= index ? "is-done" : ""} ${i === index ? "is-current" : ""}`} aria-current={i === index ? "step" : undefined}>
                <span className="sr-only">{t(`create.step.${s}` as TKey)}</span>
              </span>
            ))}
          </nav>
          <p className="muted small center">
            {t("create.stepOf", { n: index + 1, total: steps.length })} · {t(`create.step.${step}` as TKey)}
          </p>

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
      <h1>{t("capture.title")}</h1>
      <p className="lead-sm">{t("capture.subtitle")}</p>

      <div className="ring" role="img" aria-label={t("capture.count", { n: count, total: TARGET_PHOTOS })}>
        {Array.from({ length: TARGET_PHOTOS }, (_, i) => (
          <span key={i} className={`ring-dot ${i < count ? "is-filled" : ""}`} style={{ ["--a" as string]: `${(i / TARGET_PHOTOS) * 360}deg` }} />
        ))}
        <div className="ring-center">
          <PieceThumb piece={VASE} size={160} className="ring-piece" />
          <strong>{t("capture.count", { n: count, total: TARGET_PHOTOS })}</strong>
        </div>
      </div>

      <div className="actions">
        <label className="btn btn-primary">
          📷 {t("capture.add")}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" hidden onChange={onFiles} />
        </label>
        <button type="button" className="btn btn-outline" onClick={useDemo}>
          {t("capture.demo")}
        </button>
        {count > 0 && (
          <button type="button" className="btn btn-ghost" onClick={() => setPhotos([])}>
            {t("capture.clear")}
          </button>
        )}
      </div>

      {count > 0 && (
        <ul className="photo-grid">
          {photos.map((src, i) => (
            <li key={`${i}-${src.slice(-12)}`}>
              <img src={src} alt="" />
            </li>
          ))}
        </ul>
      )}

      <div className="form">
        <label>
          {t("capture.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("capture.namePh")} maxLength={80} />
        </label>
        <label>
          {t("capture.price")}
          <input value={price} onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="48" />
        </label>
        <label>
          {t("capture.notes")}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("capture.notesPh")} rows={3} maxLength={400} />
        </label>
      </div>

      <details className="tips" open>
        <summary>{t("capture.tipsTitle")}</summary>
        <ul>
          <li>{t("capture.tip1")}</li>
          <li>{t("capture.tip2")}</li>
          <li>{t("capture.tip3")}</li>
        </ul>
      </details>
      <p className="muted small">{t("capture.demoNote")}</p>

      {count < MIN_PHOTOS && <p className="hint">{t("capture.min", { min: MIN_PHOTOS })}</p>}
      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className="btn btn-primary" disabled={count < MIN_PHOTOS} onClick={onNext}>
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
      <h1>{t("brand.title")}</h1>
      <p className="lead-sm">{t("brand.subtitle")}</p>
      <p className="eyebrow">{t("brand.suggested")}</p>

      <div className="form">
        <div>
          <span className="label">{t("brand.palette")}</span>
          <div className="palette">
            {colors.map((c, i) => (
              <label key={i} className="palette-swatch" style={{ background: c }}>
                <input
                  type="color"
                  value={c}
                  aria-label={`${t("brand.palette")} ${i + 1}`}
                  onChange={(e) => setColors(colors.map((old, j) => (j === i ? e.target.value : old)))}
                />
              </label>
            ))}
          </div>
        </div>
        <label>
          {t("brand.name")}
          <input value={storeName} onChange={(e) => setStoreName(e.target.value)} maxLength={60} />
        </label>
        <div>
          <span className="label">{t("brand.tone")}</span>
          <div className="chips" role="radiogroup" aria-label={t("brand.tone")}>
            {TONES.map((tn) => (
              <button key={tn} type="button" role="radio" aria-checked={tone === tn} className={`chip-btn ${tone === tn ? "is-active" : ""}`} onClick={() => setTone(tn)}>
                {t(`tone.${tn}` as TKey)}
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="eyebrow">{t("brand.preview")}</p>
      <div className="brand-preview" style={{ background: colors[1], color: colors[3] }}>
        <strong style={{ color: colors[0] }}>{storeName || "…"}</strong>
        <span>{t(`tone.${tone}` as TKey)}</span>
        <i style={{ background: colors[0] }} />
      </div>

      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
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
      <h1>{t("processing.title")}</h1>
      <p className="lead-sm">{t("processing.subtitle")}</p>
      <div className="progress" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
        <span style={{ width: `${percent}%` }} />
      </div>
      <ol className="pipeline">
        {PIPELINE.map((key, i) => {
          const state = i < done ? "done" : i === done ? "active" : "todo";
          return (
            <li key={key} className={`pipeline-item is-${state}`}>
              <span className="pipeline-mark" aria-hidden="true">
                {state === "done" ? "✓" : state === "active" ? "…" : ""}
              </span>
              {t(key)}
            </li>
          );
        })}
      </ol>
      <p className="muted small">{t("processing.demoNote")}</p>
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
      <h1>{t("result.title")}</h1>
      <div className="card">
        <Viewer360 piece={VASE} />
      </div>
      <div className="result-meta">
        <RealBadge />
        <span className="muted small">
          {t("result.fidelity")} 0.93 · {t("result.frames", { n: 24 })}
        </span>
      </div>
      <p className="muted small">{t("result.demoNote")}</p>

      <h2 className="section-title">{t("result.listing")}</h2>
      <p className="muted small">{t("result.listingNote")}</p>
      <div className="form">
        <label>
          {t("result.nameEn")}
          <input value={nameEn} onChange={(e) => setNameEn(e.target.value)} maxLength={80} />
        </label>
        <label>
          {t("result.descEn")}
          <textarea value={descEn} onChange={(e) => setDescEn(e.target.value)} rows={2} maxLength={400} />
        </label>
        <label>
          {t("result.nameEs")}
          <input value={nameEs} onChange={(e) => setNameEs(e.target.value)} maxLength={80} />
        </label>
        <label>
          {t("result.descEs")}
          <textarea value={descEs} onChange={(e) => setDescEs(e.target.value)} rows={2} maxLength={400} />
        </label>
      </div>

      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onNext}>
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
        <h1>🎉 {t("publish.done")}</h1>
        <div className="form">
          <div>
            <span className="label">{t("publish.storeLink")}</span>
            <div className="copy-row">
              <input readOnly value={storeUrl} aria-label={t("publish.storeLink")} />
              <CopyButton text={storeUrl} />
            </div>
          </div>
          <div className="callout">
            <span className="label">🔑 {t("publish.editLinkTitle")}</span>
            <div className="copy-row">
              <input readOnly value={editUrl} aria-label={t("publish.editLinkTitle")} />
              <CopyButton text={editUrl} />
            </div>
            <p className="small">{t("publish.editLinkWarn")}</p>
          </div>
        </div>
        <p className="muted small">{t("publish.demoNote")}</p>
        <div className="nav-row">
          <Link to={`/edit/${published.token}`} className="btn btn-outline">
            {t("publish.openDashboard")}
          </Link>
          <Link to={`/s/${EXAMPLE_STORE.slug}`} className="btn btn-primary">
            {t("publish.openStore")}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section>
      <h1>{t("publish.title")}</h1>
      <div className="form">
        <label>
          {t("publish.whatsapp")}
          <input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value.replace(/[^0-9+ ]/g, ""))} inputMode="tel" placeholder="+51 999 999 999" />
          <small className="muted">{t("publish.whatsappHint")}</small>
        </label>
        <label>
          {t("publish.currency")}
          <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
            <option>USD</option>
            <option>PEN</option>
            <option>EUR</option>
            <option>MXN</option>
          </select>
        </label>
      </div>
      <div className="nav-row">
        <button type="button" className="btn btn-ghost" onClick={onBack}>
          {t("common.back")}
        </button>
        <button type="button" className="btn btn-primary" onClick={onPublish}>
          {t("publish.cta")}
        </button>
      </div>
    </section>
  );
}
