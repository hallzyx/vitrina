# DECISIONS

## 2026-09-29 · Skeleton
- API and CloudFront are separate for now (no `/api/*` behavior); restricted CORS is added when endpoints with data exist.
- CloudFront `PriceClass_100` (cheapest); Lambda on arm64 / 128 MB.

## 2026-09-29 · Spending cap
- Cap: **USD 20/month** (`vitrina-monthly` budget, alerts at 50/80/100% by email). Watched by the account owner.

## 2026-09-29 · Access model
- The agent works as the limited IAM user `vitrina-agent` (default CLI profile) with a permissions boundary (`vitrina-boundary`) required on every role it creates. Root is kept in a separate profile (`root-admin`) and used only by the account owner for IAM/Budgets changes.
- Policies are versioned in `infra/iam/`.

## 2026-09-29 · Frontend demo data
- Until the pipeline exists, the store, viewer and capture screens run on demo data. The 360° frames of the demo pieces (vase, basket, bowl) are rendered procedurally on a canvas (`frontend/src/lib/render.ts`) and are clearly labeled as demo in the UI. The viewer only needs an ordered list of frames, so it will consume the real WebP frames unchanged.
- No UI or state libraries beyond React and `react-router-dom`; plain CSS with variables.
- npm's `--strict-allow-scripts` blocks install scripts by default; only `esbuild` is approved (`allowScripts` in `frontend/package.json`), everything else stays blocked.

## 2026-09-29 · Language and i18n
- All repo documentation, code, comments and commit messages are in English; the chat with the user is in Spanish.
- UI languages: English and Spanish only (Portuguese dropped from the original plan). Default from `navigator.languages` (`es*` → Spanish, otherwise English), with a persisted manual toggle.
- Public routes renamed to English: `/create`, `/s/:slug`, `/edit/:token`; example store at `/s/example`.
- Conventional Commits are mandatory.

## 2026-09-29 · Frontend styling, landing and motion
- Supersedes "plain CSS with variables" above: the whole SPA now uses **Tailwind CSS v4** (`@tailwindcss/vite`). Design tokens live in one `@theme` block (`frontend/src/styles.css`); per-store brand colors stay runtime CSS variables (`--brand`, `--brand-soft`) exposed as `bg-brand`/`text-brand-strong` through `@theme inline`. Tailwind is a build-time dependency only.
- Art direction: "the workshop at night" (dark clay/kiln surfaces for the landing's hero, fidelity and CTA sections) against warm paper surfaces for the product screens. Fraunces + Instrument Sans, self-hosted with Fontsource (no external font requests).
- **three.js** (plain, no react-three-fiber) for the landing hero: a lathe-turned vase/bowl/basket on a turntable, with the same surface patterns as the demo pieces (`lib/render.ts`). Plain three.js keeps the chunk smaller and the lifecycle explicit (dispose on unmount, pause when off screen or tab hidden). It is an illustration and labeled as such; real products are only ever shown from photos.
- Fallback chain so the landing never renders blank: `pickHeroMode()` checks WebGL (a software rasterizer counts as unavailable), `saveData`, low memory/CPU **before** downloading three.js; if it fails, or the chunk fails to load, or the renderer throws or loses its context, the hero shows the frame-based `Viewer360`. A poster frame covers the chunk download. `?lite` / `?3d` force either path.
- **motion** (`motion/react`) for scroll-linked storytelling and reveals, only inside the landing chunk. `MotionConfig reducedMotion="user"` plus explicit static layouts keep `prefers-reduced-motion` users on simple fades.
- **react-icons** (Lucide set only, per-icon imports) replaced every emoji icon.
- Route-level code splitting with `React.lazy`; three.js has its own chunk (`manualChunks`). An error boundary offers a reload if a route chunk fails to load (e.g. after a redeploy).

## 2026-09-29 · Invite phrase and API guardrails
- **Scope of the invite phrase:** required to create a store (`POST /api/stores`) and, when the pipeline exists, to start processing (`.../start`), which is the step that spends Bedrock/GPU money. Adding products to an existing store uses the edit token that was issued after the phrase, plus per-visitor and global daily caps. Everything public (example store, viewer, store pages, events) never asks for it, so the ship gate holds for judges and AI systems.
- **Where the phrase lives:** SSM Parameter Store SecureString `/vitrina/prod/access-code`; the Lambdas get only its *name* (`ACCESS_CODE_PARAM_NAME`) and read it with a 5-minute cache. It is not a plain environment variable (visible in the Lambda console and CloudFormation) and never a `VITE_*` variable (bundled into public JavaScript). The chosen phrase was shared in chat by the owner; it is low-risk and is rotated with one `aws ssm put-parameter --overwrite`.
- **Brute force:** 10 wrong phrases per IP per hour, then 429 (`MAX_FAILED_ATTEMPTS`). Comparison is constant time on SHA-256 digests. Codes and tokens are never logged.
- **Quotas count only valid requests:** validation runs before the counters are incremented (a unit test guards this), so a typo does not burn a visitor's daily allowance. Global daily caps (20 stores, 30 products) bound total spend if IPs rotate.
- **Client identity:** behind CloudFront the API sees the edge IP, so limits use the `CloudFront-Viewer-Address` header (set by CloudFront, not spoofable) and fall back to the socket IP for direct calls. IPs are stored only as hashes with a TTL.

## 2026-09-29 · Same-origin API, uploads and SPA routing
- The API is exposed through CloudFront at `/api/*` (origin path = stage), so the SPA calls a relative URL and needs no CORS or `VITE_API_URL`. A custom cache policy (TTL 0) and an origin request policy forward only the headers the API needs.
- The SPA fallback moved from distribution-wide `CustomErrorResponses` to a CloudFront Function on the site behavior. Distribution-wide error responses would have turned the API's own 403/404 answers into `index.html`.
- Photos are uploaded with **presigned POST** (not PUT) because only POST policies can enforce `content-length-range` (8 MB), the exact `Content-Type` and the exact key. Verified live: a tampered field or key gets 403 and a 9 MB file gets 400 `EntityTooLarge`. Content-based type checks (magic bytes) happen in the pipeline.
- Buckets are named explicitly (`<stack>-raw|processed-<account>-<region>`) and referenced by name from the functions, which breaks a dependency cycle (API -> functions -> bucket CORS -> CloudFront -> API).
- `/media/*` on CloudFront serves the processed bucket (frames, GLB) through OAC; the raw bucket is never public.
- Each function has its own least-privilege policy (all under the `vitrina-boundary` permissions boundary); the tables are pay-per-request and there is no resource with a fixed hourly cost.
