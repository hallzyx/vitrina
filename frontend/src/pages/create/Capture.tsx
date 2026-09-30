import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { LuCamera, LuCheck, LuImagePlus, LuTriangleAlert, LuX } from "react-icons/lu";
import { ErrorNote, Spinner } from "../../components/Chrome";
import { ProgressBar } from "../../components/Pipeline";
import { btn, label } from "../../components/ui";
import { useI18n, type TKey } from "../../i18n";
import {
  ApiRequestError,
  clearStoredCode,
  createProduct,
  createStore,
  getStoredCode,
  isApiError,
  startProcessing,
  uploadToForm,
  type CreatedProduct,
  type SavedRun,
} from "../../lib/api";
import { apiErrorKey } from "../../lib/product";
import { CaptureRing } from "./CaptureRing";
import { Actions, MAX_BYTES, MAX_PHOTOS, MIN_PHOTOS, PHOTO_TYPES, ScreenTitle } from "./shared";

const UPLOAD_CONCURRENCY = 4;

interface Photo {
  id: number;
  file: File;
  url: string;
}

type FileState = { state: "pending" | "uploading" | "done" | "failed"; progress: number };
type Phase = "edit" | "creating" | "uploading" | "starting";

interface Props {
  /** Edit token of an existing store (adding a product from the dashboard). Without it, a store is created first. */
  existingToken: string | null;
  onBack: () => void;
  /** The invite phrase is missing or was rejected: go back to the gate. */
  onNeedCode: () => void;
  onStarted: (run: SavedRun) => void;
}

/** Custom photos: pick 6 to 24 photos, upload them straight to S3 and start the pipeline. */
export function Capture({ existingToken, onBack, onNeedCode, onStarted }: Props) {
  const { t } = useI18n();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [rejected, setRejected] = useState<{ key: TKey; n: number }[]>([]);
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");
  const [storeName, setStoreName] = useState("");
  const [phase, setPhase] = useState<Phase>("edit");
  const [files, setFiles] = useState<FileState[]>([]);
  const [error, setError] = useState<TKey | null>(null);
  const [touched, setTouched] = useState(false);
  const nextId = useRef(1);
  // What the server already has, so a retry never creates a second store or product.
  const created = useRef<{ token: string; slug: string } | null>(existingToken ? { token: existingToken, slug: "" } : null);
  const product = useRef<{ data: CreatedProduct; at: number; photoIds: string } | null>(null);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  useEffect(() => {
    return () => photosRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const busy = phase !== "edit";
  const count = photos.length;
  const needsStore = !existingToken;
  const priceValue = price.trim() === "" ? undefined : Number(price);
  const priceInvalid = priceValue !== undefined && (!Number.isFinite(priceValue) || priceValue < 0);
  const storeMissing = needsStore && !storeName.trim();
  const canSubmit = count >= MIN_PHOTOS && count <= MAX_PHOTOS && !priceInvalid && !storeMissing;

  const onFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    let wrongType = 0;
    let tooBig = 0;
    let tooMany = 0;
    const accepted: Photo[] = [];
    for (const file of picked) {
      if (!PHOTO_TYPES.includes(file.type)) wrongType++;
      else if (file.size > MAX_BYTES) tooBig++;
      else if (count + accepted.length >= MAX_PHOTOS) tooMany++;
      else accepted.push({ id: nextId.current++, file, url: URL.createObjectURL(file) });
    }
    setRejected(
      [
        { key: "capture.rejectType" as TKey, n: wrongType },
        { key: "capture.rejectSize" as TKey, n: tooBig },
        { key: "capture.rejectCount" as TKey, n: tooMany },
      ].filter((r) => r.n > 0),
    );
    if (accepted.length) {
      setPhotos((list) => [...list, ...accepted]);
      setFiles([]);
    }
    setError(null);
  };

  const remove = (id: number) => {
    setPhotos((list) => {
      const gone = list.find((p) => p.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return list.filter((p) => p.id !== id);
    });
    setFiles([]);
  };

  const clearAll = () => {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]);
    setRejected([]);
    setFiles([]);
  };

  /** Uploads every file that is not done yet, a few at a time, retrying each failure once. */
  const uploadAll = async (data: CreatedProduct, list: Photo[], states: FileState[]): Promise<number> => {
    const current = states.map((s) => ({ ...s }));
    const publish = () => setFiles(current.map((s) => ({ ...s })));
    const queue = current.map((s, i) => (s.state === "done" ? -1 : i)).filter((i) => i >= 0);
    let failures = 0;
    const worker = async () => {
      while (queue.length) {
        const i = queue.shift()!;
        current[i] = { state: "uploading", progress: 0 };
        publish();
        let ok = false;
        for (let attempt = 0; attempt < 2 && !ok; attempt++) {
          try {
            await uploadToForm(data.uploads[i], list[i].file, (fraction) => {
              current[i] = { state: "uploading", progress: fraction };
              publish();
            });
            ok = true;
          } catch {
            /* retried once below, then reported */
          }
        }
        current[i] = ok ? { state: "done", progress: 1 } : { state: "failed", progress: 0 };
        if (!ok) failures++;
        publish();
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, queue.length) }, worker));
    return failures;
  };

  const submit = async () => {
    setTouched(true);
    if (!canSubmit || busy) return;
    const code = getStoredCode();
    if (!code) {
      onNeedCode();
      return;
    }
    setError(null);
    const list = photos;
    const photoIds = list.map((p) => p.id).join(",");
    try {
      if (!created.current) {
        setPhase("creating");
        const store = await createStore(code, { name: storeName.trim() });
        created.current = { token: store.editToken, slug: store.slug };
      }
      const token = created.current.token;
      // Presigned forms expire: reuse them only for the same photos and while they are still valid.
      const reusable =
        product.current && product.current.photoIds === photoIds && Date.now() - product.current.at < (product.current.data.expiresIn - 60) * 1000;
      let states = files;
      if (!reusable) {
        setPhase("creating");
        const data = await createProduct(token, {
          photoCount: list.length,
          contentTypes: list.map((p) => p.file.type),
          name: name.trim() || undefined,
          price: priceValue,
          notes: notes.trim() || undefined,
        });
        product.current = { data, at: Date.now(), photoIds };
        states = list.map(() => ({ state: "pending", progress: 0 }));
        setFiles(states);
      }
      const data = product.current!.data;
      setPhase("uploading");
      const failures = await uploadAll(data, list, states);
      if (failures > 0) {
        setPhase("edit");
        setError("upload.failedFiles");
        return;
      }
      setPhase("starting");
      try {
        await startProcessing(code, token, data.productId);
      } catch (err) {
        if (!isApiError(err, 409, "already_started")) throw err;
      }
      onStarted({ token, productId: data.productId, slug: created.current.slug, origin: "custom", startedAt: Date.now() });
    } catch (err) {
      setPhase("edit");
      if (isApiError(err, 401)) {
        clearStoredCode();
        onNeedCode();
        return;
      }
      setError(createErrorKey(err));
    }
  };

  const doneCount = files.filter((f) => f.state === "done").length;
  const failedCount = files.filter((f) => f.state === "failed").length;
  const uploadPercent = files.length ? (files.reduce((sum, f) => sum + f.progress, 0) / files.length) * 100 : 0;

  return (
    <section>
      <ScreenTitle sub={t("capture.subtitle")}>{t("capture.title")}</ScreenTitle>
      <CaptureRing photos={photos.map((p) => p.url)} />

      <div className="mb-4 flex flex-wrap justify-center gap-2">
        <label className={btn("primary", "md", busy ? "pointer-events-none opacity-45" : "")}>
          <LuCamera aria-hidden="true" className="size-4" /> {t("capture.take")}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple capture="environment" className="sr-only" onChange={onFiles} disabled={busy} />
        </label>
        <label className={btn("outline", "md", busy ? "pointer-events-none opacity-45" : "")}>
          <LuImagePlus aria-hidden="true" className="size-4" /> {t("capture.pick")}
          <input type="file" accept="image/jpeg,image/png,image/webp" multiple className="sr-only" onChange={onFiles} disabled={busy} />
        </label>
        {count > 0 && !busy && (
          <button type="button" className={btn("ghost")} onClick={clearAll}>
            {t("capture.clear")}
          </button>
        )}
      </div>

      <div aria-live="polite">
        {rejected.map((r) => (
          <p key={r.key} className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-terracotta-deep">
            <LuTriangleAlert aria-hidden="true" className="size-4 shrink-0" /> {t(r.key, { n: r.n, max: MAX_PHOTOS })}
          </p>
        ))}
      </div>

      {count > 0 && (
        <ul className="mb-4 grid grid-cols-4 gap-1.5">
          {photos.map((p, i) => {
            const f = files[i];
            return (
              <li key={p.id} className="relative aspect-square overflow-hidden rounded-xl bg-paper-2">
                <img src={p.url} alt={t("capture.photoAlt", { n: i + 1 })} className="block size-full object-cover" />
                {f && f.state !== "pending" && (
                  <span className="absolute inset-x-0 bottom-0 h-1.5 bg-black/30" aria-hidden="true">
                    <span
                      className={`block h-full ${f.state === "failed" ? "bg-[#b3261e]" : f.state === "done" ? "bg-olive" : "bg-terracotta"}`}
                      style={{ width: `${f.state === "failed" ? 100 : f.progress * 100}%` }}
                    />
                  </span>
                )}
                {f?.state === "done" && (
                  <span className="absolute right-1 top-1 grid size-5 place-items-center rounded-full bg-olive text-white" aria-hidden="true">
                    <LuCheck className="size-3" strokeWidth={3.5} />
                  </span>
                )}
                {!busy && (
                  <button
                    type="button"
                    className="absolute right-1 top-1 grid size-7 cursor-pointer place-items-center rounded-full bg-clay-950/75 text-paper hover:bg-clay-950"
                    onClick={() => remove(p.id)}
                    aria-label={t("capture.remove", { n: i + 1 })}
                  >
                    <LuX aria-hidden="true" className="size-4" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {phase === "uploading" || (files.length > 0 && failedCount > 0) ? (
        <div className="mb-2">
          <ProgressBar percent={uploadPercent} label={t("upload.progress", { done: doneCount, total: files.length })} />
          <p className="-mt-3 text-sm text-ink-soft" role="status" aria-live="polite">
            {t("upload.progress", { done: doneCount, total: files.length })}
          </p>
        </div>
      ) : null}

      <div className="my-4 grid gap-4">
        {needsStore && (
          <label className={label}>
            {t("capture.storeName")}
            <input
              value={storeName}
              onChange={(e) => setStoreName(e.target.value)}
              placeholder={t("capture.storeNamePh")}
              maxLength={60}
              disabled={busy || !!created.current}
              aria-invalid={touched && storeMissing}
              required
            />
            {touched && storeMissing && <small className="font-semibold text-terracotta-deep">{t("capture.storeNameRequired")}</small>}
          </label>
        )}
        <label className={label}>
          {t("capture.name")}
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("capture.namePh")} maxLength={80} disabled={busy} />
        </label>
        <label className={label}>
          {t("capture.price")}
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            placeholder="48"
            disabled={busy}
            aria-invalid={priceInvalid}
          />
          <small className="font-normal text-ink-soft">{t("capture.priceHint")}</small>
        </label>
        <label className={label}>
          {t("capture.notes")}
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("capture.notesPh")} rows={3} maxLength={400} disabled={busy} />
        </label>
      </div>

      <details className="my-4 rounded-2xl bg-paper px-4 py-3 text-[0.92rem]">
        <summary className="cursor-pointer font-bold">{t("capture.tipsTitle")}</summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-soft marker:text-terracotta">
          <li>{t("capture.tip1")}</li>
          <li>{t("capture.tip2")}</li>
          <li>{t("capture.tip3")}</li>
          <li>{t("capture.tip4", { max: MAX_PHOTOS })}</li>
        </ul>
      </details>

      {count < MIN_PHOTOS && <p className="mt-3 text-sm font-semibold text-[#9a4a26]">{t("capture.min", { min: MIN_PHOTOS })}</p>}
      {error && <ErrorNote className="mt-3" message={t(error, { n: failedCount })} />}
      {busy && (
        <p className="mt-3 flex items-center gap-2 text-sm text-ink-soft" role="status">
          <Spinner className="size-4" />
          {phase === "creating" ? t("upload.creating") : phase === "starting" ? t("upload.starting") : t("upload.uploading")}
        </p>
      )}
      <Actions>
        <button type="button" className={btn("ghost")} onClick={onBack} disabled={busy}>
          {t("common.back")}
        </button>
        <button type="button" className={btn("primary", "md", "flex-1")} disabled={busy || count < MIN_PHOTOS} onClick={submit}>
          {error === "upload.failedFiles" ? t("upload.retry") : t("capture.upload")}
        </button>
      </Actions>
    </section>
  );
}

function createErrorKey(err: unknown): TKey {
  if (err instanceof ApiRequestError) {
    if (err.status === 429 && err.code === "limit_reached") return "upload.limit";
    if (err.status === 400 && err.code === "missing_uploads") return "upload.missing";
    if (err.status === 403) return "upload.forbidden";
  }
  return apiErrorKey(err);
}
