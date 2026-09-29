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
**Products** — PK `storeId`, SK `productId`. Attributes: `name`, `price`, `status` (`uploading|processing|ready_360|ready_3d|failed`), `rawKeys[]`, `frameKeys[]`, `glbKey?`, `fidelityScore`, `copy {en,es}`, `createdAt`.
**Stats** — PK `storeId`, SK `STATS`. Atomic counters (`views`, `clicks`) and per-product counters.
**Limits** — PK `visitorKey` (hash of IP + day), counter of products created; with TTL.

## 6. API
Writes (creator) require the `X-Edit-Token` header. Generation requires `X-Access-Code` except for the example store.
- `POST /stores` → creates a store; returns `storeId` and `editToken` **only once**.
- `POST /stores/{storeId}/products` → creates a product; returns presigned URLs to upload photos (max 24, ≤ 8 MB each, JPEG/PNG/WebP).
- `POST /stores/{storeId}/products/{productId}/start` → validates and starts Step Functions.
- `GET /stores/{storeId}/products/{productId}/status` → state and per-step progress.
- `PUT /stores/{storeId}` and `PUT /stores/{storeId}/products/{productId}` → edit brand, price, WhatsApp; `POST /stores/{storeId}/publish`.
- `GET /public/stores/{slug}` → store + published products (cacheable in CloudFront).
- `POST /public/events` → `view` or `click` (rate limited).
- `GET /public/example` → pre-generated example store (**no code**).
- `GET /health` → liveness check.

## 7. Per-product pipeline (Step Functions)
1. **Validate:** photo count (≥ 6), minimum resolution, sharpness (Laplacian variance), file type. Clear user-facing error if it fails.
2. **Remove background** from each photo. Options to evaluate (pick the best and cheapest): a background-removal task in a Bedrock image model if available in the region, or a library (e.g. rembg) in a container Lambda. *To be validated.*
3. **Align and center:** crop, scale and compose on a neutral background; order the angles. Generate 12–24 WebP frames and thumbnails.
4. **Brand** (only if the store has none yet): palette via k-means over the object's pixels + suggested name and tone from a multimodal Bedrock model.
5. **Fidelity:** multimodal embeddings of each processed frame vs. its original photo; cosine similarity. Frames below the threshold are dropped; if fewer than 6 remain, the product becomes `failed` with a useful message. Store the average as `fidelityScore`.
6. **Listing:** name and short description in EN/ES from a Bedrock text model, based on the photos and what the artisan wrote. Do not invent materials, origin or dimensions the user did not provide.
7. **Mark `ready_360`.** From here the product can be viewed and published.
8. **3D branch (optional, `ENABLE_3D`):** if enabled, invoke the SageMaker async endpoint with the frames; store the (optimized/compressed) GLB and move to `ready_3d`. Any failure here is logged and **does not affect** `ready_360`.
Retries with backoff on Bedrock steps; explicit timeouts; state visible to the UI.

## 8. Viewer
- **360°:** frame sequence; pointer/touch drag changes the frame, with inertia and progressive preloading. No heavy libraries.
- **3D:** `<model-viewer>` (or three.js) with the GLB; rotate and zoom. Shown only when `ready_3d`.
- Badge: "View made from the artisan's real photos" (translated).

## 9. Guardrails and security
- Pre-generated, public example store; live generation asks for a code (`X-Access-Code`, value in SSM).
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
