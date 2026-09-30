# BUILD_LOG

Format: `date-time (America/Lima) · what was requested · what the agent did · resources/IDs · commands/tools`.

## 2026-09-29 · Local skeleton (no AWS changes)
- **Requested:** review the project files and build what they describe (SETUP.md §7, Tuesday evening session).
- **Done:** `infra/ backend/ frontend/ docs/` structure, `.gitignore`, `.env.example`, `infra/template.yaml` (S3 + CloudFront OAC + HTTP API + `GET /health` Lambda).
- **AWS resources:** none yet.
- **Tools:** Claude Code (Write/Bash).

## 2026-09-29 · AWS plugin and limited IAM user (account 850995568854, us-east-1)
- **Requested:** install the official AWS plugin and stop operating as root.
- **Plugin:** `claude plugin marketplace add https://github.com/aws/agent-toolkit-for-aws.git` (with `core.longpaths` via environment variable) and `claude plugin install aws-core@agent-toolkit-for-aws` (v1.1.0, user scope). It includes the AWS MCP Server.
- **IAM (run by the user with `!`, root session):** policies `vitrina-boundary` and `vitrina-agent` (see `infra/iam/`), user `vitrina-agent`, temporary console password with forced reset. Managed policies attached: `AWSMCPSignInOAuthAccessPolicy`, `IAMUserChangePassword`, `SignInLocalDevelopmentAccess`.
- **Issues:** `IAMUserChangePassword` was missing (error when changing the password) and `SignInLocalDevelopmentAccess` was missing (400 on `aws login`). The CLI `default` profile now points to `vitrina-agent`.
- **Verification:** `aws sts get-caller-identity` and, through the MCP, `run_script` (STS GetCallerIdentity) → `user/vitrina-agent`; `list_regions` OK.
- **Repo change:** `PermissionsBoundary` in `Globals.Function` of `infra/template.yaml`.

## 2026-09-29 · Policy v2, Budgets and SAM CLI
- **Done (root, profile `root-admin`, run by the user):** `aws iam create-policy-version --set-as-default` for `vitrina-agent` and `vitrina-boundary` (v2: CloudWatch, KMS via SSM) and `aws budgets create-budget` (`vitrina-monthly`, USD 20/month, actual-spend alerts at 50/80/100% by email). Files in `infra/iam/`.
- **Done (agent):** SAM CLI 1.166.2 installed with `winget install Amazon.SAM-CLI`; `sam validate --lint` passes on `infra/template.yaml`.
- **Verification (agent, MCP `run_script` as `user/vitrina-agent`):** IAM GetPolicy → default v2 on both; Budgets DescribeBudgets/DescribeNotificationsForBudget → 1 budget, thresholds 50/80/100.
- **Spending cap:** USD 20/month; watched by the account owner.

## 2026-09-29 · First deployment: skeleton stack `vitrina` (us-east-1)
- **Requested:** deploy the minimal skeleton (S3 + CloudFront + `GET /health`) and provide a way to pause and destroy everything. Cost estimate given beforehand (~USD 0); user confirmed.
- **Done (agent, as `user/vitrina-agent`):** added `Paused` parameter + `IsPaused` condition to `infra/template.yaml` (disables CloudFront, throttles the API to 0), added `scripts/deploy.sh`, `scripts/pause.sh`, `scripts/destroy.sh`; `sam validate --lint`, `sam build`, `sam deploy` (`--resolve-s3 --capabilities CAPABILITY_IAM`, tag `project=vitrina`); uploaded `frontend/index.html`; CloudFront invalidation.
- **Resources:** stack `vitrina`; bucket `vitrina-frontendbucket-zdyg5a5lrtjb`; CloudFront distribution `E2QFDRCIB8GU97` (https://dz81nhpgrhb93.cloudfront.net); HTTP API `uksp9t9yrj` (https://uksp9t9yrj.execute-api.us-east-1.amazonaws.com/prod); Lambda `HealthFunction`; SAM-managed artifact bucket (stack `aws-sam-cli-managed-default`).
- **Verification:** `GET /prod/health` → 200 `{"status": "ok", "service": "vitrina"}`; site `/` → 200 with `<title>Vitrina</title>`; `/s/example` → 200 (SPA fallback).
- **Not yet tested:** `scripts/pause.sh` and `scripts/destroy.sh` (only written).
- **Tools:** AWS SAM CLI 1.166.2, AWS CLI (`s3 cp`, `cloudfront create-invalidation`), curl.

## 2026-09-29 · Frontend demo deployed (all screens, EN/ES)
- **Requested:** recreate every screen from the `.md` specs without screenshots.
- **Done (agent):** Vite + React + TypeScript SPA in `frontend/` with the routes from `SPEC.md` (landing, guided capture → brand → processing → viewer → publish, store, buyer view, dashboard), real EN/ES i18n (browser-language default, persisted toggle), and an interactive 360° viewer fed by procedurally rendered demo pieces (no real photos exist yet). Added `scripts/deploy-frontend.sh` (build, `s3 sync` with immutable caching for hashed assets and `no-cache` for `index.html`, CloudFront invalidation).
- **AWS changes:** objects uploaded to `vitrina-frontendbucket-zdyg5a5lrtjb`; CloudFront invalidations on `E2QFDRCIB8GU97`. No new resources.
- **Verification (headless browser, mobile and desktop):** 0 console errors and 0 failed requests; routes `/`, `/create`, `/s/example`, `/s/example/woven-basket`, `/edit/<token>` and the 404 page render on the live URL; full creation flow completes; language toggle persists; WhatsApp link carries the localized message.
- **Bugs found and fixed during testing:** (1) `useEffect(() => window.scrollTo(...))` returned a non-function and blanked the page on any client-side navigation; (2) the language toggle's `aria-label` did not contain its visible text (WCAG 2.5.3).
- **Tools:** npm (with `allowScripts` approval for `esbuild` only), headless browser automation, AWS CLI.

## 2026-09-29 · Landing redesign deployed (Tailwind + three.js hero)
- **Requested:** publish the redesigned frontend (delegated to a subagent; reviewed and verified by the main agent before deploying).
- **Done (agent):** `git push` of 4 commits (`2e52a2c`..`b969f92`), then `scripts/deploy-frontend.sh` (build, `s3 sync --delete` with immutable caching for hashed assets, `index.html` with `no-cache`, CloudFront invalidation of `/index.html` and `/favicon.svg`).
- **AWS changes:** objects synced to `vitrina-frontendbucket-zdyg5a5lrtjb` (old hashed assets removed); CloudFront invalidation on `E2QFDRCIB8GU97`. No new resources.
- **Verification (headless browser on the public URL):** CDN serves the new bundle; `/`, `/?lite`, `/create`, `/s/example`, `/s/example/wooden-bowl`, `/edit/<token>` and the 404 render at 1280 and 390 px with no runtime errors captured (0 console errors, 0 failed requests); Spanish toggle sets `<html lang="es">`; client-side navigation works.
- **Bundle (gzip):** initial `/` about 132 kB JS; three.js chunk 132 kB, downloaded only on the landing when WebGL is usable.
- **Tools:** AWS CLI (`s3 sync`, `s3 cp`, `cloudfront create-invalidation`), headless browser automation.

## 2026-09-29 · Backend base with invite-phrase gate (stack `vitrina` update)
- **Requested:** secure store and product creation with a single invite phrase (kept out of the code), then build the backend base. Cost stated beforehand (about USD 0, no fixed hourly resources) and approved by the user.
- **Done (agent, as `user/vitrina-agent`):**
  - `aws ssm put-parameter --type SecureString` for `/vitrina/prod/access-code` (value provided by the user; not written to any file).
  - Backend in `backend/src` (Python 3.12): invite check, store creation, publish, product creation with presigned POST, public store/example, events, and shared limits/validation/security modules. 23 pytest tests with moto, all passing.
  - `infra/template.yaml`: 4 DynamoDB tables (pay per request, TTL on limits), raw and processed S3 buckets, 5 functions with per-function policies, HTTP API routes under `/api`, CloudFront `/api/*` and `/media/*` behaviors, a CloudFront Function for SPA routing, and cache/origin-request policies.
  - Deployment: `sam build`, then a change set created with `--no-execute-changeset`, reviewed (23 additions, 4 in-place modifications, 1 deletion: the old OAC) and executed with `aws cloudformation execute-change-set`; result `UPDATE_COMPLETE`. The first direct `sam deploy` attempt was blocked by the permission classifier ("apply without preview"), hence the review step.
  - Frontend: invite-phrase screen at the start of `/create`, backed by the real API; deployed with `scripts/deploy-frontend.sh`.
- **Resources (new):** tables `vitrina-stores|products|stats|limits`; buckets `vitrina-raw-850995568854-us-east-1` and `vitrina-processed-850995568854-us-east-1`; functions Access, Stores, Products, Public (Health updated); CloudFront Function `vitrina-spa-rewrite`; policies `vitrina-api-no-cache` and `vitrina-api-origin`; OAC `vitrina-s3-oac` (replaces `FrontendOAC`); SSM parameter `/vitrina/prod/access-code`.
- **Verification on the public URL:** `/api/health` 200; wrong phrase 401; right phrase 200; store creation without phrase 401, with phrase 201; product creation without token 403, with token 201 (6 forms); presigned upload 204, tampered field/key 403, 9 MB file 400; store hidden until published; publish with wrong token 403; public store leaks neither the token nor its hash; an API 404 returns JSON (not `index.html`); `/s/example` still serves the SPA. Browser test of the gate: wrong-phrase message, right phrase unlocks, survives a reload, cleared with the session, `?add=1` skips it, Spanish text, example link.
- **Test data:** two smoke-test stores, their products, stats and one uploaded object were created and then deleted (tables confirmed empty). Limit counters expire by TTL.
- **Tools:** AWS SAM CLI, AWS CLI (`ssm`, `cloudformation`, `dynamodb`, `s3api`, `s3`), curl, headless browser automation, pytest + moto.

## 2026-09-30 · Product pipeline deployed and verified end to end (stack `vitrina` update)
- **Requested:** build the 360° pipeline with the "plan B" (no Marketplace models), after the model-availability findings recorded in `docs/DECISIONS.md`.
- **Preceding checks (AWS CLI as `user/vitrina-agent`):** `bedrock list-foundation-models`; Nova Canvas v1 denied as Legacy; Stability remove-background worked once then failed on a Marketplace subscription (also for root); Nova Lite/Pro and Titan embeddings invoked successfully. The `vitrina-agent` policy was updated to v3 by the account owner with root (Bedrock allowed in us-east-1/us-east-2/us-west-2 for cross-region profiles; other regions still denied).
- **Done (agent):** `backend/pipeline` (validate, background removal, align, fidelity, brand, listing, finalize, fail), `backend/src/handlers/pipeline_api.py` (start and status), `infra/pipeline.asl.json`, template additions, `scripts/upload-segmentation-model.sh`; 64 pytest tests (moto, stubbed models) passing. `sam build` for arm64 (129 MB unzipped), model uploaded to `s3://vitrina-processed-850995568854-us-east-1/models/isnet-general-use.onnx` (178,648,008 bytes), three deployments each through a reviewed change set (`--no-execute-changeset`, then `execute-change-set`): 8 additions and 6 in-place modifications, then two code-only updates. Stack `UPDATE_COMPLETE`.
- **New resources:** Lambda `PipelineFunction` (3008 MB, 300 s, arm64) and `PipelineApiFunction`, Step Functions state machine `vitrina-pipeline` (STANDARD), three IAM roles (all with the `vitrina-boundary` permissions boundary), two API routes (`POST .../start`, `GET .../status`).
- **Verification on the public URL (three complete runs of 12 photos each):** all `SUCCEEDED` in 34–40 s; per-frame fidelity 0.963–0.990; 12 frames and 12 thumbnails served by CloudFront as `image/webp` with immutable caching; intermediate `work/` files removed; bilingual listing without invented claims; palette and tone stored; margins ≥ 81 px; the artisan's notes are translated faithfully and used. A wrong-input case (too few or blurry photos) and the retry limit are covered by tests.
- **Issues found and fixed during the work (all caught by tests or real runs):** quotas were consumed before validation (earlier); the alignment could push frames to the canvas edge; English/Spanish equivalents were rejected as invented claims; a brand name hinted at a material; the blur check failed when most photos were blurry.
- **Test data:** three test stores with their products, photos and frames were created through the real API and then deleted (tables and `raw/`, `media/`, `work/` confirmed empty); my own daily limit counters for testing were deleted too. The segmentation model was kept.
- **Permission classifier:** a direct `sam deploy` earlier in the project was blocked as "apply without preview"; every deployment since follows create change set, review, execute.
- **Tools:** AWS SAM CLI, AWS CLI (`bedrock`, `bedrock-runtime`, `stepfunctions`, `cloudformation`, `dynamodb`, `s3`, `s3api`), curl, pytest + moto, Pillow, numpy, onnxruntime, Blender (local demo photo sets).

## 2026-09-30 · Global sample cap raised from 12 to 20 per day
- **Requested by the owner:** more live runs on the sample sets for evaluators. Estimated cost about USD 0.02 per run, so at most about USD 0.40 per day at the cap.
- **Done:** CloudFormation parameter `MaxGlobalSampleRunsPerDay` default 20 (template) and set explicitly on the stack with `--parameter-overrides` (SAM keeps the previous stack value for parameters that are not overridden, so changing only the default has no effect); reviewed change set, `UPDATE_COMPLETE`. Verified: stack parameter = 20 and `MAX_GLOBAL_SAMPLE_RUNS_PER_DAY=20` on `SamplesFunction`. The per-visitor cap stays at 2 per day. This is our own application cap, unrelated to the AWS Bedrock service quota (which only AWS can raise).

## 2026-09-30 · Frontend wired to the real API, example store seeded, frontend deployed
- **Requested:** finish what was missing: real upload and processing in the UI, sample gallery with live runs and a replay fallback, the pre-built example store, and honest labels. The UI wiring was delegated to a subagent and then independently reviewed and verified by the main agent.
- **Backend additions (agent, reviewed change sets, `UPDATE_COMPLETE`):** `GET /api/me`, `PUT /api/stores/{id}`, `PUT /api/stores/{id}/products/{id}`, `POST /api/samples/{id}/run` (no invite phrase; caps of 2 per visitor and, after the owner's request, 20 global per day), edit token now `<storeId>.<secret>`, publish requires a WhatsApp number and a finished product, CloudFront `/samples/*` behavior and bucket policy, Bedrock throttling resilience (backoff, unscored frames reported as unchecked, Step Functions retries, Map concurrency 3). One information leak found by a test and fixed: every authorization failure is now the same 403.
- **Data:** five sample photo sets (renders of CC0 scans) and `samples/index.json` uploaded to the processed bucket; the example store (`slug example`, 5 products) was built by running the real pipeline on each set through the live API (35–47 s each, fidelity 0.9725–0.9883, 12 of 12 frames scored) with the real per-step timings recorded from Step Functions history (the first version of the recorder mis-measured the Map step as 0 ms; fixed and recomputed from the stored histories).
- **Frontend deployed:** `scripts/deploy-frontend.sh` (S3 sync, immutable hashed assets, CloudFront invalidation). Bundle served by the CDN confirmed.
- **Verification on the public URL:** a real live sample run from the UI (gallery, ring, process live, polling, result) took 45 s with 12 of 12 media requests returning 200, fidelity line shown, the "real photos" badge absent on demo products and the demonstration label present, 0 console errors; the example store page renders its five real products with the demo and recorded-run labels. The subagent additionally verified (with request interception) the cap-to-replay path, every pipeline error code, network failure, the custom-photos path and a down API.
- **Incident:** live runs during seeding hit Bedrock `ThrottlingException` on Titan embeddings (CloudWatch: 93 of 213 invocations throttled in 3 hours): a new-account quota. Mitigated as described above; raising the quota is an owner action (Service Quotas) that this user cannot perform.
- **Test data:** all stores created by tests and verification runs (including two demo stores from UI runs) were deleted with their files; only the example store remains.
- **Tools:** AWS SAM CLI, AWS CLI, boto3, Step Functions history API, headless browser automation, pytest + moto.
