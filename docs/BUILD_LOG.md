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
