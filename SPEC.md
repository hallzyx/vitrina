# SPEC.md — Vitrina

## 1. Product
An artisan photographs a piece in a guided way (about 12 photos while rotating it). Vitrina prepares the images, suggests a brand, writes the listing in EN/ES and publishes a **storefront** with a viewer that lets buyers **spin the piece** (360° from real photos; optional 3D). The buyer orders through WhatsApp. The artisan can come back with their **edit link** and add more products, which inherit their brand.

Target users: micro-sellers and single-person craft businesses without a marketing team. Pitch: *"Upload photos of your craft and get a store where your customers can spin it and see it in detail."*

## 2. Screens (see `docs/mockups/`)
Mobile (390×844): Home · Guided capture · Your brand · Processing · 360/3D viewer · Your store · Buyer view · My store (dashboard). Desktop: Landing.

Creator flow: Home → Capture → Brand (first time only) → Processing → Viewer → Publish → Store. Returning with the edit link → Dashboard → Add product (skips Brand).

## 3. Internationalization (i18n)
- Supported UI languages: **English (`en`) and Spanish (`es`)**.
- Default: read `navigator.languages`; if the first match starts with `es`, use Spanish, otherwise English.
- A visible language toggle lets the user override the default; the choice is persisted (`localStorage`) and wins over browser detection.
- All UI strings live in translation files (`frontend/src/i18n/en.json`, `es.json`); no hard-coded UI text. Set `<html lang>` accordingly.
- Generated product copy (`copy {en, es}`) follows the same two languages; the buyer view shows the viewer's language and falls back to English.

## 4. Architecture (us-east-1)
- **Frontend:** SPA (Vite + React + TS) on S3 + CloudFront (OAC). Routes: `/`, `/create`, `/s/:slug` (store), `/s/:slug/:productId`, `/edit/:token`. (Route names are English; the example store lives at `/s/example`.)
- **API:** API Gateway HTTP API + Lambda (Python 3.12). CORS restricted to the CloudFront domain. Stage throttling.
- **Data:** DynamoDB (on-demand). S3 for original photos, processed views and GLB models (public access blocked; access via presigned URLs or CloudFront with OAC).
- **Orchestration:** Step Functions (Standard) for per-product processing.
- **AI:** Amazon Bedrock. Models configurable by environment variable (do not hard-code IDs). 3D branch: SageMaker asynchronous inference scaling to zero.
- **Operations:** CloudWatch Logs, CloudTrail, AWS Budgets. IaC: AWS SAM.

## 5. Data model (DynamoDB)
**Stores** — PK `storeId` (ULID). Attributes: `slug` (GSI `slug-index`), `name`, `brand {colors[], tone, displayName}`, `whatsapp`, `currency`, `editTokenHash` (SHA-256; never the token), `status` (`draft|published`), `createdAt`.
**Products** — PK `storeId`, SK `productId`. Attributes: `name`, `price`, `status` (`uploading|processing|ready_360|ready_3d|failed`), `rawKeys[]`, `frameKeys[]`, `glbKey?`, `fidelityScore`, `copy {en,es}`, `createdAt`. Only while a run is in flight: `previews[] {i, o, c, s}`, `alignedThumbs[] {i, k}`, `fidelityReview {threshold, dropped[]}` (progress for the processing screen, removed when the run ends).
**Stats** — PK `storeId`, SK `STATS`. Atomic counters (`views`, `clicks`) and per-product counters.
**Limits** — PK `visitorKey`, atomic `count`, TTL attribute `expiresAt`. Keys: `fail#<ipHash>#<hour>` (wrong phrases), `store#<ipHash>#<day>` and `prod#<ipHash>#<day>` (per visitor), `store#global#<day>` and `prod#global#<day>` (global daily cap on spend), `evt#<ipHash>#<day>` (events). Counters are incremented only after the request validates, so a typo never burns a quota.

## 6. API
Served from the same origin as the site under `/api/*` (CloudFront routes it to API Gateway), so there is no CORS. Writes by the creator require the `X-Edit-Token` header. Anything that creates a store or spends money on generation requires the **invite phrase** in `X-Access-Code`; the example store and everything public never do. Status: ✅ implemented, ⏳ planned.
- ✅ `POST /api/access/verify` → checks the invite phrase (body `{code}`) without side effects; 401 if wrong, 429 after too many failures from one IP.
- ✅ `POST /api/stores` (invite phrase) → creates a store; returns `storeId`, `slug` and `editToken` **only once**.
- ✅ `POST /api/stores/{storeId}/products` (edit token) → creates a product; returns one **presigned POST form** per photo (6–24 photos, ≤ 8 MB each, JPEG/PNG/WebP; size, type and key are enforced by the signed policy).
- ✅ `POST /api/stores/{storeId}/publish` (edit token) → makes the store public.
- ✅ `GET /api/public/stores/{slug}` → published store + its `ready_*` products.
- ✅ `GET /api/public/example` → pre-generated example store (**no code**).
- ✅ `POST /api/public/events` → `view` or `click` (rate limited).
- ✅ `GET /api/health` → liveness check.
- ✅ `POST /api/stores/{storeId}/products/{productId}/start` (invite phrase + edit token) → checks the uploads exist (≥ 6), claims the product (`uploading`/`failed` → `processing`, max 3 attempts) and starts Step Functions. 202 on success.
- ✅ `GET /api/stores/{storeId}/products/{productId}/status` (edit token) → `status`, current `step` (validate, background, align, fidelity, brand, listing, ready), photo progress, an `error.code` when failed (`not_enough_photos`, `too_blurry`, `invalid_image`, `no_object`, `low_fidelity`, `timeout`, `internal_error`) and, when ready, the frame and thumbnail URLs, the EN/ES copy, the fidelity score and the brand.
  While `status` is `processing` it also returns `live`, what the run has produced so far (only real outputs, for the processing screen): `previews[]` `{index, photo, cutout, fidelity}` for every photo whose background is removed (480 px WebP of the photo and of its transparent cutout, same size so one overlays the other; `fidelity` is that photo's real score or `null` when it was not scored), `aligned[]` `{index, thumb}` once the frames are aligned, `review {threshold, dropped[]}` once the fidelity check ran, and `brand` (the store's palette) once the brand step is done. The previews live under `media/<storeId>/<productId>/live/` (unguessable ULID paths, `Cache-Control: private, max-age=900`), are listed only by this token-protected endpoint, and are deleted together with the `previews`, `alignedThumbs` and `fidelityReview` attributes when the run finishes or fails (a retry also clears them). Writing a preview is best effort and never fails a photo.
- ⏳ `PUT /api/stores/{storeId}` and `PUT /api/stores/{storeId}/products/{productId}` → edit brand, price, WhatsApp.

Error shape: `{"error": "<code>", "message": "<text>"}` with codes such as `invalid_code`, `too_many_attempts`, `limit_reached`, `forbidden`, `not_found`, `invalid_request`.

## 7. Per-product pipeline (Step Functions)
Status: ✅ steps 1–7 implemented and verified end to end on the public URL (about 35–40 s for 12 photos). One Lambda (`backend/pipeline`, Python 3.12 arm64, 3 GB) runs every step; Step Functions orchestrates and retries. No step needs an AWS Marketplace subscription.
1. **Validate:** real file type by content (JPEG/PNG/WebP), minimum side 600 px, sharpness (variance of the Laplacian on a 512 px copy). A photo is blurry if it is below an absolute floor (12) or below 35% of the set's median; measured on real renders, sharp photos score 70–650 and the same photos blurred (radius 3) score 2.5–15. Needs ≥ 6 usable photos, otherwise `failed` with `not_enough_photos` or `too_blurry`.
2. **Remove background** of each photo (4 in parallel) with `isnet-general-use`, an ONNX segmentation model (Apache-2.0) that runs inside the Lambda. It is pure segmentation: the piece's pixels stay exactly as photographed (verified: zero difference inside the mask). The model file lives in S3 (`models/`) and is copied to `/tmp` per warm container. Stability AI's remove-background (Bedrock) gave equivalent cutouts (IoU 0.997 on the test piece) but needs a Marketplace subscription; Nova Canvas v1 is "Legacy" and blocked for new accounts.
3. **Align and center:** every frame shares one scale and one floor line; the union of all frames is fitted and centered with a 6% margin, so nothing is clipped even when perspective moves a foot lower in some views. A steady camera (tripod or turntable) keeps one fixed axis; a hand-held set is re-centered per frame with light smoothing. Output: transparent 1024 px WebP frames and 320 px thumbnails under `media/`.
4. **Fidelity:** Titan Multimodal embeddings of the original photo's crop vs. the processed cutout (on neutral gray); cosine similarity per frame. A frame is dropped if it is below an absolute floor (`FIDELITY_THRESHOLD`, 0.80) or more than a margin below the set's own median, so a uniformly lower baseline on cluttered real photos does not reject good frames. The margin is `FIDELITY_MAX_DROP` (0.05) for tight sets and widens to 2.5 robust sigmas of the set's own spread (capped by `FIDELITY_MAX_MARGIN`, 0.10) when at least 4 frames are scored, because correct cutouts of a dark phone-photographed bottle scored anywhere from 0.855 to 0.94. Measured: a correct cutout scores 0.96–0.99, scattered holes 0.82–0.88, a lost quarter of the piece 0.92–0.97 (a coarse detector, not a pixel-exact one). Fewer than 6 frames left → `failed` with `low_fidelity`. The average is stored as `fidelityScore`. Because Titan on-demand is capped at 20 requests per minute (not adjustable), only every `FIDELITY_SAMPLE_EVERY`-th frame (default 2) is scored; the others are kept and left out of `fidelityChecked`, so a partial check is always reported as partial.
5. **Brand** (only if the store has none yet): palette by k-means over the piece's pixels, plus a suggested display name and tone from Amazon Nova Pro. Names that hint at a material ("Woody", "Clayworks") are discarded.
6. **Listing:** name and short description in EN/ES from Amazon Nova Pro, based on the photos and what the artisan wrote. The model is told to describe only what is visible; its answer is then checked for materials, techniques, origin and measurements the artisan did not give (English and Spanish equivalents count as the same claim). One repair attempt, then a fallback made only of the artisan's own words.
7. **Mark `ready_360`.** From here the product can be viewed and published. Intermediate cutouts are deleted.
8. **3D branch (optional, `ENABLE_3D`):** if enabled, invoke the SageMaker async endpoint with the frames; store the (optimized/compressed) GLB and move to `ready_3d`. Any failure here is logged and **does not affect** `ready_360`.
Retries with backoff on Bedrock steps; explicit timeouts; state visible to the UI.

## 8. Viewer
- **360°:** frame sequence; pointer/touch drag changes the frame, with inertia and progressive preloading. No heavy libraries.
- **3D:** `<model-viewer>` (or three.js) with the GLB; rotate and zoom. Shown only when `ready_3d`.
- Badge: "View made from the artisan's real photos" (translated).

## 9. Guardrails and security
- Pre-generated, public example store; store creation and live generation ask for an invite phrase (`X-Access-Code`), whose value lives only in SSM Parameter Store (SecureString) and is compared in constant time. It is never a `VITE_*` variable (those are bundled into public JavaScript). The browser keeps it in `sessionStorage` only.
- Limits: max 3 products/day per visitor; API Gateway throttling; limited file size and count; type validation by content.
- Edit token ≥ 128 random bits, constant-time comparison, only its hash in the DB.
- S3 with no public access; minimal CORS; no logs containing tokens or codes.
- AWS Budgets alarms at 50/80/100% of the defined cap; no always-on GPU instances.
- Sanitize all user text before rendering it.

## 10. Out of scope (for now)
Online payments, user accounts, custom domain per store, native app, advanced image editing, video.

## 11. Acceptance criteria
- [ ] The public CloudFront URL opens the landing page on mobile and desktop.
- [ ] `/s/example` shows a store with ≥ 3 spinnable products, **without a code**.
- [ ] Creating a store from scratch with 12 photos reaches `ready_360` in under 3 minutes (with the access code).
- [ ] The 360° viewer spins smoothly on a mid-range phone.
- [ ] Returning with the edit link and adding a second product that inherits the brand.
- [ ] The WhatsApp button opens the chat with the product message.
- [ ] Visit and click counters visible in the dashboard.
- [ ] UI defaults to Spanish for `es*` browsers and English otherwise; the toggle overrides and persists.
- [ ] No secrets in the repo; `template.yaml` deploys everything from scratch.
- [ ] `docs/BUILD_LOG.md` with evidence of agent and AWS MCP Server usage.
- [ ] Builder Center post published with architecture, process and URL.
