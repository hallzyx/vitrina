# CLAUDE.md — Vitrina

Permanent context for Claude Code. Read it fully before acting. Product details are in `SPEC.md`, the schedule in `PLAN.md`.

## What we are building
**Vitrina**: an artisan uploads about 12 photos of a piece and gets a public storefront where buyers can **spin the piece** (a 360° viewer built from real photos, with an optional 3D model as an extra) and order via WhatsApp. No login: the store is managed through a secret edit link.

It is our entry to the **AWS Zero to Shipped** hackathon (Sep 18 – Oct 2, 2026; deadline Oct 2 23:59 PT = Oct 3 01:59 Lima time).

Repository: https://github.com/hallzyx/vitrina

## Hackathon rules that override everything else
- **Ship gate (pass/fail):** the app must be live on AWS with a public URL, reachable by human judges **and by an AI system that cannot type access codes**. The example store and the whole viewer must work without a code or sign-up.
- **Must stay online** for the whole evaluation (until the week of Oct 19). The web tier is cheap; the GPU must never be left running.
- **Original project**, started on or after Sep 18. Do not reuse code from other projects.
- Criteria (25% each): technical innovation and originality, **implementation quality**, community/market impact, creativity and storytelling.
- AWS service usage and coding-agent usage must be documented, with proof of console connection.
- Category: `#commercial-potential`. Lane: `#startups`.

## Engineering principles
1. **Reliability first.** The real-photo 360° viewer is the foundation and **must always work**. 3D is an extra behind a feature flag (`ENABLE_3D`); if it fails or runs late, switch it off without touching the rest.
2. **Fidelity to the real product.** Never invent or "improve" the piece's appearance with generative AI. Buyers see the artisan's real photos (with a clean background). Any view that deviates from the original photos is discarded.
3. **Controlled spend.** No idle GPU. Daily per-visitor product limit, AWS Budgets alarm, live generation protected by a code; the pre-generated example is public.
4. **Simple and explainable.** Everything as IaC (AWS SAM, `template.yaml`). Nothing created by hand in the console without recording it.
5. **Mobile first.** The artisan uses a phone.
6. **i18n: English and Spanish.** The UI language defaults to the browser language: Spanish if it starts with `es`, English for anything else. A visible toggle lets the user override it (persist the choice). Product copy is generated in EN and ES.

## Language and commits
- **All documentation, code, comments, identifiers and commit messages are in English.** Only the chat with the user is in Spanish.
- Use **Conventional Commits** (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `ci:`, `build:`; optional scope, e.g. `feat(viewer): add inertia`). Small, frequent commits. Never rewrite git history.

## AWS
- Region for everything: **us-east-1**. Console/API access through the connected AWS MCP Server (plugin `aws-core@agent-toolkit-for-aws`).
- Work as the limited IAM user `vitrina-agent` (default CLI profile), never as root. Root (profile `root-admin`) is only for IAM/Budgets changes the user runs personally. Policies live in `infra/iam/`.
- Minimum permissions per Lambda function (all roles use the `vitrina-boundary` permissions boundary). Never `*` on resources when avoidable. No admin credentials at runtime.
- **Zero secrets in code or repo.** Configuration through environment variables (see `.env.example`); the access code lives in SSM Parameter Store (SecureString). Lambda uses its IAM role.
- Before creating anything that costs money (GPU, endpoints, NAT Gateway, etc.), state the estimated cost and wait for confirmation. **Avoid NAT Gateways and any resource with a fixed hourly cost.**
- Spending cap: USD 20/month (`vitrina-monthly` budget, alerts at 50/80/100%).

## Evidence (hackathon requirement)
After every step that changes AWS, add an entry to `docs/BUILD_LOG.md`:
`date-time (America/Lima) · what was requested · what the agent did · resources/IDs created · commands or MCP tools used`.

## Working style
- Before a large change, propose the plan in a few lines.
- Suggested layout: `infra/` (SAM, `iam/`), `backend/` (Lambdas, Python 3.12), `frontend/` (Vite + React + TypeScript), `docs/` (`BUILD_LOG.md`, `DECISIONS.md`, `mockups/`, `ARCHITECTURE.md`).
- For open decisions, pick the simplest option that meets the ship gate and record it in `docs/DECISIONS.md`.
