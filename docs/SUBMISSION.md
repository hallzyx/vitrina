# Vitrina: hackathon submission

**AWS Zero to Shipped** · category `#commercial-potential` · lane `#startups` · region `us-east-1`
Repository: https://github.com/hallzyx/vitrina · Live app: https://dz81nhpgrhb93.cloudfront.net

## 1. One paragraph

Vitrina lets a small artisan photograph a handmade piece with a phone (about 12 photos) and get a public storefront where buyers **spin the piece 360 degrees using the artisan's real photos** and order through WhatsApp. A Step Functions pipeline removes each background with a mask (the pixels of the piece are never altered), aligns the frames, checks fidelity against the original photos with Amazon Titan multimodal embeddings, extracts a brand palette, and writes a listing in English and Spanish with Amazon Nova Pro, refusing to invent materials, origin or measurements. No accounts: the store is managed through a secret edit link.

## 2. Try it in under a minute (no code, no sign-up)

| What | Where | Needs a code? |
| --- | --- | --- |
| Example store with spinnable products | https://dz81nhpgrhb93.cloudfront.net/s/example | No |
| Buyer view of a product (drag to spin, WhatsApp button) | open any product in the example store | No |
| Run the real pipeline live on a sample photo set and watch it work | `/create` then "Try with sample photos" | No (daily caps apply; a labeled replay is offered when exhausted) |
| Upload your own photos | `/create` then "Use my photos" | Yes, an invite phrase (spending control; provided with the submission, never stored in the repo) |

Language follows the browser (Spanish for `es*`, English otherwise); the toggle in the header overrides it.

Machine-checkable endpoints (no authentication):

```bash
curl -s https://dz81nhpgrhb93.cloudfront.net/api/health
curl -s https://dz81nhpgrhb93.cloudfront.net/api/public/example      # store JSON with frame URLs
```

## 3. AWS services and why each one is used

| Service | Role in Vitrina |
| --- | --- |
| **Amazon Bedrock** (Titan Multimodal Embeddings, Nova Pro) | Fidelity check of every processed frame; brand name/tone and the EN/ES listing |
| **AWS Step Functions** (Standard) | The 7-step pipeline with per-photo parallelism (Map), retries on throttling and a failure path |
| **AWS Lambda** (Python 3.12, arm64) | API handlers and the pipeline tasks (ONNX background removal runs in-function) |
| **Amazon API Gateway** (HTTP API) | Public and creator API behind CloudFront |
| **Amazon S3** | Frontend, private raw uploads (presigned POST), processed frames served through CloudFront |
| **Amazon CloudFront** | One origin for site, `/api/*`, `/media/*`, `/samples/*`; Origin Access Control; SPA routing function |
| **Amazon DynamoDB** (on-demand) | Stores, products, view/click stats, rate-limit counters with TTL |
| **AWS Systems Manager Parameter Store** | The invite phrase as a SecureString |
| **AWS IAM** | Least privilege per function, all roles under a permissions boundary (`vitrina-boundary`) |
| **AWS Budgets, CloudWatch, CloudTrail** | USD 20/month cap with alerts at 50/80/100 %, logs, audit trail |
| **AWS SAM / CloudFormation** | The whole stack as code (`infra/template.yaml`) |

No NAT gateway, no GPU, no resource with a fixed hourly cost.

## 4. How the coding agent was used (documented evidence)

- **Claude Code** with the **AWS MCP Server** (plugin `aws-core@agent-toolkit-for-aws`) built the project from a written specification. It worked as a limited IAM user (`vitrina-agent`), never as root.
- Every AWS-changing step has a dated entry in [`BUILD_LOG.md`](BUILD_LOG.md): request, what the agent did, resources created, commands used. Decisions with their reasons are in [`DECISIONS.md`](DECISIONS.md), including what was dropped (the optional 3D branch) and why.
- A subagent (Claude Opus) built the landing page and the real-time processing "workbench"; the lead agent reviewed, tested and deployed them.
- Every deploy went through a reviewed CloudFormation change set. CloudTrail holds the audit trail of the agent's calls (`vitrina-agent`), including Bedrock invocations.
- 98 automated tests (pytest with moto) cover validation, limits, security behaviors, pipeline flow and the API.

## 5. Judging criteria

**Technical innovation and originality.** Fidelity as a design constraint: no generative AI touches the piece's appearance. Background removal produces only a mask; Titan embeddings compare each cutout with its original photo, using both an absolute floor and a floor relative to the set's own median; frames that drift are dropped and the product reports how many frames were actually checked (Titan on-demand allows 20 requests per minute, so every second frame is scored and the rest are reported as unchecked). The listing validator blocks invented materials, origin and measurements, treating EN and ES equivalents as the same claim. Measured behavior and its limits are in [`DECISIONS.md`](DECISIONS.md).

**Implementation quality.** Single SAM template; per-function least-privilege roles under a permissions boundary; uniform 403 on every authorization failure so store existence never leaks; presigned uploads with size and type constraints; invite phrase with lockout; per-visitor and global daily caps; API and pipeline retries with backoff; pause and destroy scripts; 98 tests; every deploy previewed as a change set.

**Community and market impact.** Artisans sell through chat apps with a handful of flat photos. Vitrina needs a phone, no design skills and no account, works in Spanish and English, and ends in the channel buyers already use (WhatsApp). Cost per product is a few cents of Bedrock and Lambda; the stack idles near zero.

**Creativity and storytelling.** A real-time processing "workbench" shows the artisan's own photos losing their background one by one, aligning into a ring and starting to spin, with the real fidelity score for each frame, followed by palette and listing reveal. A landing page built around the spin, bilingual from the first screen.

## 6. Guardrails

| Concern | Mechanism |
| --- | --- |
| Spend | Budget USD 20/month; daily global caps; per-visitor caps; no idle compute |
| Abuse | Invite phrase (SSM) with lockout; per-IP counters; edit tokens of 128+ random bits, only their SHA-256 stored |
| Fidelity | Mask-only background removal; embedding check; frames below the floor are discarded |
| Honesty | Replays are labeled as recorded; demo stores are labeled as demos; partial fidelity checks are reported as partial |
| Availability | The real-photo 360 viewer has no optional dependency; `scripts/pause.sh` and `scripts/destroy.sh` switch everything off |

## 7. Known limitations (stated openly)

- Fidelity scores are a coarse detector, not a pixel-exact one (measured ranges are in `DECISIONS.md`).
- Only every second frame is scored because of the non-adjustable Titan on-demand quota.
- The optional 3D branch was dropped: image-to-3D needs GPU or a Marketplace subscription, and generated geometry would break the fidelity principle.
- Creating stores with your own photos is gated by the invite phrase to bound spend; the example store and the sample gallery are open.

## 8. Repository map

| Path | Contents |
| --- | --- |
| `infra/template.yaml`, `infra/pipeline.asl.json`, `infra/iam/` | Stack, state machine, IAM and budget definitions |
| `backend/src/` | API Lambdas (`handlers/`, `common/`) |
| `backend/pipeline/` | Pipeline tasks (segmentation, alignment, Bedrock calls, brand, listing) |
| `backend/tests/` | 98 tests |
| `frontend/src/` | SPA (landing, create flow, workbench, viewer, store, dashboard), EN/ES strings |
| `scripts/` | deploy, publish, pause, destroy, example seeding |
| `docs/` | `ARCHITECTURE.md`, `BUILD_LOG.md`, `DECISIONS.md`, `CREDITS.md` |
