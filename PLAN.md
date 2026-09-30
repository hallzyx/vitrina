# PLAN.md — Schedule (Lima time)

Deadline: **Friday Oct 2, 11:59 PM PT = Saturday Oct 3, 1:59 AM Lima.** Real submission target: **Friday Oct 2, 2:00 PM Lima** (noon PT), leaving a 12-hour margin.

## Tuesday Sep 29 (evening) — Foundation and evidence
- [x] Install and connect the AWS MCP Server (plugin `aws-core`); capture evidence (see `SETUP.md`).
- [x] Limited IAM user `vitrina-agent`, permissions boundary, USD 20 AWS Budgets alarm.
- [ ] Create repo, `.gitignore`, `.env.example`, folder structure, `docs/BUILD_LOG.md`; push to https://github.com/hallzyx/vitrina with Conventional Commits.
- [ ] SAM skeleton deployed: S3 + CloudFront + a `GET /health` Lambda. **Public URL working today.**

## Wednesday Sep 30 — End-to-end 360° pipeline
- [ ] DynamoDB, S3 and presigned URLs; `POST /stores` and product creation.
- [x] Step Functions: validate → remove background → align → frames. Background removal decided: ONNX segmentation inside the Lambda (Nova Canvas v1 is Legacy; Stability needs a Marketplace subscription that does not complete on this account).
- [x] Fidelity check with embeddings: floor 0.80 plus "0.05 below the set's median"; measured on renders, to be re-checked with real photos.
- [x] Brand and listing with Amazon Nova Pro (no invented materials, origin or measurements; validated).
- [ ] Test with **real phone photos** (at least one set) to confirm sharpness and fidelity thresholds. Five demo sets (vase, basket, bowl, elephant, jug) are rendered from CC0 3D scans and already pass.
- [ ] *3D spike, 3-hour limit:* can an acceptable GLB be generated on SageMaker? Record the result in `docs/DECISIONS.md`.

## Thursday Oct 1 — Complete product
- [x] Frontend: guided capture, processing, 360° viewer, store, buyer view, dashboard with edit link (all on the real API; deployed).
- [x] i18n EN/ES with browser-language default and a toggle.
- [ ] Add a second product inheriting the brand. (Implemented: the pipeline skips the brand step when the store already has one, and /create?add=1 exists; not yet verified live end to end.)
- [ ] Pre-generated public example store (`/s/example`), no code.
- [x] View/click counters, guardrails (limits, access code, sample caps).
- [ ] **3D decision at noon:** if the spike worked, integrate behind the feature flag; otherwise drop it, no regrets.

## Friday Oct 2 — Polish and submission
- [ ] Landing (desktop and mobile), translation review, basic accessibility.
- [ ] Tests on a real phone and a laptop; check load times.
- [ ] Architecture diagram in `docs/ARCHITECTURE.md`.
- [ ] Builder Center post: problem, solution, architecture, how the agent was used, evidence, URL, category `#commercial-potential`, lane `#startups`.
- [ ] Verify the ship gate from a private window and without a code.
- [ ] **Submit before 2:00 PM Lima.** Use the margin only for fixes.

## After submission (until the announcement, week of Oct 19)
- Keep the site up; GPU off; check the Budgets alarm every two days.
- Do not change anything that breaks the public example.

## Cut rules (if time is tight, in this order)
1. Drop 3D. 2. Drop click counters. 3. Simplify the dashboard. **Never cut:** public URL, example store without a code, 360° viewer, agent evidence. (The Spanish/English toggle stays; it is cheap.)
