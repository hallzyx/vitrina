# Compliance with the AWS Zero to Shipped Hackathon rules

Source: the official Terms and Conditions (last updated September 18, 2026). This file maps each requirement to where it is met and how to verify it. Status: **Met** (verifiable now), **Owner** (the participant must do or confirm it in Builder Center) or **Ongoing** (must stay true during evaluation).

Submission: https://github.com/hallzyx/vitrina · Live app: https://dz81nhpgrhb93.cloudfront.net
Category: **Commercial Potential** · Focus track: **Startup**

## 1. Submission requirements

| # | Requirement (Terms) | How it is met | Verify | Status |
| --- | --- | --- | --- | --- |
| 1 | Connect a coding agent to the AWS console before or during the Submission Period | Claude Code connected to the AWS MCP Server (plugin `aws-core@agent-toolkit-for-aws`), working as the limited IAM user `vitrina-agent` | `docs/BUILD_LOG.md` entries from Sep 29; CloudTrail events by `vitrina-agent`; screenshots of `/mcp` in the Builder Center post | Met, screenshots Owner |
| 2 | Build and ship a live application on AWS, publicly reachable by judges and the AI scoring system | CloudFront distribution in us-east-1; no code needed for the example store, the viewer or the sample demo; static `about.html`, `llms.txt` and a JSON endpoint for readers that do not run JavaScript | Open the live app in a private window; `curl https://dz81nhpgrhb93.cloudfront.net/api/health` | Met, Ongoing until the end of evaluation |
| 3 | Choose one of five categories | Commercial Potential | Stated in the post, in `README.md`, `docs/SUBMISSION.md`, `about.html` and `llms.txt` | Met, post line Owner |
| 4 | Choose a focus track (Community or Startup) | Startup | Same places | Met, post line Owner |
| 5 | Publish a project on AWS Builder Center with (a) proof of coding agent connection, (b) description of the project and development process, (c) category and track, (d) link to the live application | Draft in `docs/BUILDER_CENTER_POST.md` covers (b), (c) and (d). Part (a) needs screenshots inside the post | Builder Center post | Owner |
| 6 | Original application, not previously published | First commit on 2026-09-29 (after the Sep 18 start); no code from other projects; third-party material listed in `docs/CREDITS.md` | `git log --reverse` | Met |
| 7 | Document the use of AWS services and the coding agent | `docs/SUBMISSION.md` §3 and §4, `docs/BUILD_LOG.md`, `docs/DECISIONS.md`, `docs/ARCHITECTURE.md` | Those files | Met |

## 2. Ship gate (pass/fail)

| Condition | Evidence |
| --- | --- |
| Live on AWS and reachable via a public URL at the time of evaluation | CloudFront URL above. The web tier costs almost nothing; there is no GPU or fixed-cost resource. `scripts/pause.sh` exists but must **not** be used during evaluation |
| Documented proof of coding agent connection to the AWS console | See section 4 |
| Accessible to the AI scoring system and to human judges | No access code anywhere on the evaluation path. A reader without JavaScript gets `<noscript>` content, `/about.html`, `/llms.txt`, the public JSON of the example store and the repository documentation |

## 3. Evaluation criteria (each 25%)

| Criterion | Where the evidence is |
| --- | --- |
| Technical innovation and originality | `docs/SUBMISSION.md` §5: fidelity as a constraint (mask-only background removal, embedding check, claim validator), `docs/DECISIONS.md` |
| Implementation quality | One SAM template, least-privilege roles with a permissions boundary, 105 automated tests, reviewed change sets for every deploy, guardrails (invite phrase with lockout, daily caps, budget), `docs/ARCHITECTURE.md` |
| Community and market impact | `docs/PRODUCT.md` |
| Creativity and storytelling | The real-time processing workbench, the landing page, the Builder Center post |

Gate 1 (week of October 5) mixes AI scoring and human review, so the documentation is written to be read by both: short summaries first, links to detail, no claim without evidence, limitations stated openly (`docs/SUBMISSION.md` §7).

## 4. Proof of coding agent connection to the AWS console

Material that exists in the repository or can be regenerated:

- `docs/BUILD_LOG.md`: every AWS-changing step, with date, request, what the agent did, resource IDs and tools (the AWS MCP tools and the AWS CLI).
- CloudTrail: events whose user is `vitrina-agent` (Bedrock calls, CloudFormation change sets, S3, DynamoDB, Step Functions). Lookup command: `aws cloudtrail lookup-events --lookup-attributes AttributeKey=Username,AttributeValue=vitrina-agent`.
- The IAM user, permissions boundary and budget definitions in `infra/iam/`.
- `claude mcp list` showing the AWS MCP server `plugin:aws-core:aws-mcp` connected.

To add to the Builder Center post (participant action): a screenshot of `/mcp` with the AWS server connected, a screenshot of the plugin installed, and a CloudTrail event list filtered by `vitrina-agent`.

## 5. Eligibility (participant)

These depend on the person, not on the code; the participant confirms each one:

- At least 18 years old and a builder.aws.com profile.
- Not living in an excluded country (the list includes Argentina, Brazil and Italy; Peru is not on it) and not an Amazon or AWS employee or household member.
- One entry per person. Finalists may be asked for a verifiable profile (for example LinkedIn).

## 6. Representations and warranties

- No illegal, offensive or harmful activity; no infringement. Third-party material and licenses are in `docs/CREDITS.md`: the ISNet model (Apache-2.0), CC0 demo scans credited anyway, open-source libraries.
- No secrets in the repository (`.env.example` has placeholders only); the invite phrase lives in SSM Parameter Store.

## 7. Timeline and after the deadline

- Submission Period ends **October 2, 2026, 11:59 p.m. PT** (October 3, 1:59 a.m. in Lima). Submitting after the deadline is a disqualification ground. The internal target is October 2, 2:00 p.m. Lima.
- Gate 1: week of October 5. Gate 2 (top 100, human panel): week of October 12.
- The Terms say nothing about changes to the repository after the deadline. To be safe: tag the submitted state (`submission-v1`), keep `main` stable afterwards, make only small fixes, never rewrite history, and never take the public example offline.
- Keep the site up and the budget alarm watched until the winners are announced.
