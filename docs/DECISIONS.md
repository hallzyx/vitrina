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
