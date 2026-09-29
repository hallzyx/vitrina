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
