/**
 * Typed client for the Vitrina API. The API is served from the same origin under `/api`
 * (CloudFront routes it to API Gateway), so there is no CORS and no absolute URL to configure.
 * Media (`/media/*`) and sample photo sets (`/samples/*`) are same-origin paths too.
 *
 * Credentials:
 * - Invite phrase (`X-Access-Code`): sessionStorage only, forgotten when the tab closes.
 * - Edit token (`X-Edit-Token`, `<storeId>.<secret>`): the long-lived credential is the edit link
 *   itself. The create flow keeps the current session's token in sessionStorage so a reload does not
 *   lose a run in progress.
 */

/* ───────────── Types ───────────── */

export type Lang = "en" | "es";
export type Tone = "warm" | "minimal" | "rustic" | "playful";
export type Currency = "USD" | "PEN" | "EUR" | "MXN";

export const TONES: readonly Tone[] = ["warm", "minimal", "rustic", "playful"];
export const CURRENCIES: readonly Currency[] = ["USD", "PEN", "EUR", "MXN"];

export const PIPELINE_STEPS = ["validate", "background", "align", "fidelity", "brand", "listing", "ready"] as const;
export type PipelineStep = (typeof PIPELINE_STEPS)[number];

export const PIPELINE_ERRORS = [
  "not_enough_photos",
  "too_blurry",
  "invalid_image",
  "no_object",
  "low_fidelity",
  "timeout",
  "internal_error",
] as const;
export type PipelineErrorCode = (typeof PIPELINE_ERRORS)[number];

export type ProductStatus = "uploading" | "processing" | "ready_360" | "ready_3d" | "failed";

export interface CopyBlock {
  name: string;
  description: string;
}
export type ProductCopy = Partial<Record<Lang, CopyBlock>>;

export interface Brand {
  colors?: string[];
  tone?: Tone;
  displayName?: string;
}

export interface ReplayTimings {
  totalMs: number;
  steps: { step: PipelineStep; ms: number }[];
}

export interface PublicProduct {
  id: string;
  status: ProductStatus;
  frames: string[];
  thumbs: string[];
  copy: ProductCopy;
  name?: string;
  price?: number;
  fidelityScore?: number;
  fidelityChecked?: number;
  sampleId?: string | null;
  replay?: ReplayTimings;
}

export interface PublicStore {
  slug: string;
  name: string;
  brand: Brand;
  whatsapp: string;
  currency: string;
  demo: boolean;
  products: PublicProduct[];
}

export interface PipelineError {
  code: string;
  message?: string;
}

export interface OwnerStore {
  storeId: string;
  slug: string;
  name: string;
  whatsapp: string;
  currency: string;
  brand: Brand;
  status: "draft" | "published";
  demo: boolean;
}

export interface OwnerProduct extends PublicProduct {
  step?: PipelineStep | null;
  createdAt?: string;
  error?: PipelineError;
}

export interface Counts {
  views: number;
  clicks: number;
}

export interface MeResponse {
  store: OwnerStore;
  products: OwnerProduct[];
  stats: Counts & { products: Record<string, Counts> };
}

/** One photo whose background is removed: the photo and its cutout at the same size, with its real score. */
export interface LivePreview {
  index: number;
  photo: string;
  cutout: string;
  /** null: this photo was not scored (only some are, to respect the embedding model's rate limit). */
  fidelity: number | null;
}

/** What a run in flight has produced so far. Only present while `status` is `processing`. */
export interface LiveProgress {
  previews: LivePreview[];
  aligned: { index: number; thumb: string }[];
  review?: { threshold: number | null; dropped: number[] };
  brand?: Brand;
}

export interface StatusResponse {
  status: ProductStatus;
  step: PipelineStep | null;
  stepIndex: number;
  totalSteps: number;
  photos: { done: number; total: number };
  live?: LiveProgress;
  error?: PipelineError;
  frames?: string[];
  thumbs?: string[];
  copy?: ProductCopy;
  fidelityScore?: number | null;
  fidelityChecked?: number | null;
  brand?: Brand;
}

export interface UploadForm {
  key: string;
  url: string;
  fields: Record<string, string>;
}

export interface CreatedProduct {
  productId: string;
  uploads: UploadForm[];
  expiresIn: number;
}

export interface CreatedStore {
  storeId: string;
  slug: string;
  editToken: string;
}

export interface SampleSet {
  id: string;
  name: Record<Lang, string>;
  photos: number;
  kind: string;
  credit: string;
}

/* ───────────── Errors and transport ───────────── */

/** `status` 0 means the request never got an answer (offline, DNS, CORS, aborted by a timeout). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail = "",
  ) {
    super(`${status} ${code}`);
  }
}

export function isApiError(err: unknown, status?: number, code?: string): err is ApiRequestError {
  return err instanceof ApiRequestError && (status === undefined || err.status === status) && (code === undefined || err.code === code);
}

interface RequestOptions {
  body?: unknown;
  token?: string;
  code?: string;
  signal?: AbortSignal;
}

async function request<T>(method: string, path: string, { body, token, code, signal }: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers["X-Edit-Token"] = token;
  if (code) headers["X-Access-Code"] = code;
  let response: Response;
  try {
    response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal });
  } catch (err) {
    if (signal?.aborted) throw err;
    throw new ApiRequestError(0, "network");
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text().catch(() => "");
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!response.ok) {
    const payload = (data ?? {}) as { error?: string; message?: string };
    const fallback = response.status >= 500 ? "server" : "unknown";
    throw new ApiRequestError(response.status, payload.error ?? fallback, payload.message ?? "");
  }
  if (data === null) throw new ApiRequestError(response.status, "invalid_response");
  return data as T;
}

/** The store id is the part of the edit token before the first dot. */
export function storeIdOf(token: string): string {
  return token.split(".")[0] ?? "";
}

/* ───────────── Invite phrase ───────────── */

const CODE_KEY = "vitrina.access-code";

/** The invite phrase lives in sessionStorage only: it is forgotten when the tab closes. */
export function getStoredCode(): string | null {
  try {
    return sessionStorage.getItem(CODE_KEY);
  } catch {
    return null;
  }
}

export function storeCode(code: string): void {
  try {
    sessionStorage.setItem(CODE_KEY, code);
  } catch {
    /* storage may be unavailable; the user will simply be asked again */
  }
}

export function clearStoredCode(): void {
  try {
    sessionStorage.removeItem(CODE_KEY);
  } catch {
    /* ignore */
  }
}

/** Resolves when the phrase is valid; throws ApiRequestError (401, 429, ...) otherwise. */
export function verifyAccessCode(code: string): Promise<void> {
  return request<void>("POST", "/api/access/verify", { body: { code } }).then(() => undefined);
}

/* ───────────── Create-flow session (sessionStorage) ───────────── */

const RUN_KEY = "vitrina.create-run";
const EDIT_KEY = "vitrina.edit-token";

/** A run the user started in this tab, so a reload can resume polling it. */
export interface SavedRun {
  token: string;
  productId: string;
  slug: string;
  origin: "sample" | "custom";
  sampleId?: string;
  startedAt: number;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function getSavedRun(): SavedRun | null {
  const run = readJson<SavedRun>(RUN_KEY);
  return run && typeof run.token === "string" && typeof run.productId === "string" ? run : null;
}

export function saveRun(run: SavedRun): void {
  try {
    sessionStorage.setItem(RUN_KEY, JSON.stringify(run));
  } catch {
    /* ignore */
  }
}

export function clearSavedRun(): void {
  try {
    sessionStorage.removeItem(RUN_KEY);
  } catch {
    /* ignore */
  }
}

/** Handed from the dashboard to `/create?add=1` so the token never goes into that URL. */
export function getSessionToken(): string | null {
  try {
    return sessionStorage.getItem(EDIT_KEY);
  } catch {
    return null;
  }
}

export function saveSessionToken(token: string): void {
  try {
    sessionStorage.setItem(EDIT_KEY, token);
  } catch {
    /* ignore */
  }
}

/* ───────────── Creator endpoints ───────────── */

export function createStore(code: string, input: { name: string; whatsapp?: string; currency?: string; brand?: Brand }) {
  return request<CreatedStore>("POST", "/api/stores", { code, body: input });
}

export function createProduct(
  token: string,
  input: { photoCount: number; contentTypes?: string[]; name?: string; price?: number; notes?: string },
) {
  return request<CreatedProduct>("POST", `/api/stores/${storeIdOf(token)}/products`, { token, body: input });
}

export function startProcessing(code: string, token: string, productId: string) {
  return request<{ status: "processing" }>("POST", `/api/stores/${storeIdOf(token)}/products/${productId}/start`, { code, token });
}

export function getStatus(token: string, productId: string, signal?: AbortSignal) {
  return request<StatusResponse>("GET", `/api/stores/${storeIdOf(token)}/products/${productId}/status`, { token, signal });
}

export function getMe(token: string, signal?: AbortSignal) {
  return request<MeResponse>("GET", "/api/me", { token, signal });
}

export function updateStore(token: string, changes: Partial<Pick<OwnerStore, "name" | "whatsapp" | "currency" | "brand">>) {
  return request<{ store: OwnerStore }>("PUT", `/api/stores/${storeIdOf(token)}`, { token, body: changes });
}

export function updateProduct(token: string, productId: string, changes: { copy?: Record<Lang, CopyBlock>; price?: number }) {
  return request<{ product: OwnerProduct }>("PUT", `/api/stores/${storeIdOf(token)}/products/${productId}`, { token, body: changes });
}

export function publishStore(token: string) {
  return request<{ slug: string; status: "published" }>("POST", `/api/stores/${storeIdOf(token)}/publish`, { token });
}

/* ───────────── Samples ───────────── */

export async function getSamples(signal?: AbortSignal): Promise<SampleSet[]> {
  const data = await request<{ samples?: SampleSet[] }>("GET", "/samples/index.json", { signal });
  return Array.isArray(data.samples) ? data.samples : [];
}

/** Public URL of photo `n` (1-based) of a sample set. */
export function samplePhoto(id: string, n: number): string {
  return `/samples/${encodeURIComponent(id)}/${String(n).padStart(2, "0")}.jpg`;
}

/** Starts a live run on a sample set. 429 `sample_cap` means today's live runs are used up. */
export function runSample(id: string, storeName?: string) {
  return request<CreatedStore & { productId: string }>("POST", `/api/samples/${encodeURIComponent(id)}/run`, {
    body: storeName ? { storeName } : {},
  });
}

/* ───────────── Public endpoints ───────────── */

const STORE_TTL_MS = 60_000;
const storeCache = new Map<string, { at: number; promise: Promise<PublicStore> }>();

/**
 * Published store by slug (the example store has its own endpoint). Cached for a minute so moving
 * between the store and its products does not refetch; failures are not cached.
 */
export function getPublicStore(slug: string, { fresh = false } = {}): Promise<PublicStore> {
  const hit = storeCache.get(slug);
  if (!fresh && hit && Date.now() - hit.at < STORE_TTL_MS) return hit.promise;
  const path = slug === EXAMPLE_SLUG ? "/api/public/example" : `/api/public/stores/${encodeURIComponent(slug)}`;
  const promise = request<PublicStore>("GET", path);
  storeCache.set(slug, { at: Date.now(), promise });
  promise.catch(() => storeCache.delete(slug));
  return promise;
}

export const EXAMPLE_SLUG = "example";

export function getExampleStore(options?: { fresh?: boolean }): Promise<PublicStore> {
  return getPublicStore(EXAMPLE_SLUG, options);
}

/** Fire and forget: analytics must never break or slow down the page. */
export function sendEvent(type: "view" | "click", slug: string, productId?: string): void {
  const body = JSON.stringify(productId ? { type, slug, productId } : { type, slug });
  try {
    void fetch("/api/public/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
      () => undefined,
    );
  } catch {
    /* ignore */
  }
}

/* ───────────── Direct upload to S3 (presigned POST) ───────────── */

/**
 * Uploads one file to its presigned POST form: every policy field first, the file last (S3 ignores
 * fields after `file`). Uses XHR for upload progress. Resolves on S3's 204.
 */
export function uploadToForm(form: UploadForm, file: File, onProgress?: (fraction: number) => void, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(form.fields)) data.append(key, value);
    data.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.open("POST", form.url);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress?.(event.loaded / event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(1);
        resolve();
      } else {
        reject(new ApiRequestError(xhr.status, "upload_failed"));
      }
    };
    xhr.onerror = () => reject(new ApiRequestError(0, "network"));
    xhr.onabort = () => reject(new ApiRequestError(0, "aborted"));
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });
    xhr.send(data);
  });
}
