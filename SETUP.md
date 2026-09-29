# SETUP.md — Preparing Claude Code to build Vitrina

Verify each command against current AWS documentation; details may change.
Docs: https://docs.aws.amazon.com/agent-toolkit/latest/userguide/getting-started-aws-mcp-server.html

## 0. Before starting
- An AWS account and a profile at https://builder.aws.com with your correct country. Join the **Zero to Shipped** hackathon.
- Working region: **us-east-1**.
- Do not use the root user for the agent. Create a limited IAM user (`vitrina-agent`) with only what the project needs; avoid `AdministratorAccess`. The policies are in `infra/iam/`.

## 1. Local tools
1. **Claude Code**, installed and signed in.
2. **AWS CLI v2** (2.32.0 or later): `aws --version`.
3. **AWS SAM CLI**: `sam --version` (Windows: `winget install Amazon.SAM-CLI`).
4. **uv** (for the MCP proxy): `curl -LsSf https://astral.sh/uv/install.sh | sh`.
5. Node 20+ and Python 3.12.
6. Git.

## 2. IAM user and credentials
As root (only for this step, in a separate CLI profile):
```bash
aws login --profile root-admin
cd infra/iam
aws iam create-policy --policy-name vitrina-boundary --policy-document file://vitrina-boundary.json
aws iam create-policy --policy-name vitrina-agent --policy-document file://vitrina-agent-policy.json
aws iam create-user --user-name vitrina-agent
aws iam attach-user-policy --user-name vitrina-agent --policy-arn arn:aws:iam::<ACCOUNT_ID>:policy/vitrina-agent
aws iam attach-user-policy --user-name vitrina-agent --policy-arn arn:aws:iam::aws:policy/AWSMCPSignInOAuthAccessPolicy
aws iam attach-user-policy --user-name vitrina-agent --policy-arn arn:aws:iam::aws:policy/IAMUserChangePassword
aws iam attach-user-policy --user-name vitrina-agent --policy-arn arn:aws:iam::aws:policy/SignInLocalDevelopmentAccess
aws iam create-login-profile --user-name vitrina-agent --password "<TEMP_PASSWORD>" --password-reset-required
```
(Replace `<ACCOUNT_ID>` in the policy files and commands with your account ID.) Then sign in as the new user in a private window and set a new password, and:
```bash
aws login                       # default profile -> vitrina-agent
aws sts get-caller-identity     # must show user/vitrina-agent, not root
```
If you use IAM Identity Center: `aws configure sso`. On `ExpiredTokenException`, repeat `aws login`. Sessions last at most 12 hours.

## 3. Connect the AWS MCP Server to Claude Code
**Option A (recommended): official plugin** — bundles the MCP server and AWS skills:
```
/plugin marketplace add aws/agent-toolkit-for-aws
/plugin install aws-core@agent-toolkit-for-aws
```
On Windows, if the clone fails because of long paths, run with `GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.longpaths GIT_CONFIG_VALUE_0=true`, and use the HTTPS URL if SSH is not configured (`claude plugin marketplace add https://github.com/aws/agent-toolkit-for-aws.git`).

**Option B (OAuth):** attach `AWSMCPSignInOAuthAccessPolicy` and run:
```bash
claude mcp add aws-mcp https://aws-mcp.us-east-1.api.aws/mcp --transport http
```
**Option C (SigV4, terminal):**
```bash
claude mcp add-json aws-mcp '{"type":"stdio","command":"uvx","args":["mcp-proxy-for-aws-cli@latest","https://aws-mcp.us-east-1.api.aws/mcp","--metadata","AWS_REGION=us-east-1"],"env":{}}'
```
Do not combine the plugin with a manual `aws-mcp` server (duplicated tools).

Verify:
1. In Claude Code run `/mcp`: the AWS server must show as connected (the first time it can take a few minutes; if it times out, reconnect from `/mcp`).
2. Ask: *"What AWS Regions are available?"* You should see tools such as `search_documentation` and `run_script`.

## 4. Evidence: what to keep (with visible date and time)
- [ ] Screenshot of the plugin/MCP install and of `/mcp` showing the server connected.
- [ ] Screenshot of the first question to AWS and its answer.
- [ ] Screenshots of sessions where the agent creates real resources (SAM deploy, tables, buckets).
- [ ] Export or copy key session transcripts to `docs/evidence/`.
- [ ] Screenshot of **CloudTrail** events for those actions (Event history, filtered by user/role).
- [ ] `docs/BUILD_LOG.md` updated after each step (required by `CLAUDE.md`).
- [ ] Commits dated after Sep 18.
- [ ] At the end: screenshot of the live app and of the resources in the console.
Do not build or reconstruct evidence afterwards: it must reflect how the project was actually built.

## 5. Cost guardrails (do this before creating anything expensive)
- [x] **AWS Budgets:** USD 20/month with alerts at 50/80/100% (files in `infra/iam/budget*.json`; created with root: `aws budgets create-budget --profile root-admin ...`). Email alerts arrive only when a threshold is crossed; no subscription confirmation is needed.
- [ ] Confirm access to the Bedrock models you will use (text and multimodal embeddings) in us-east-1.
- [ ] Do not create NAT Gateways or always-on instances.
- [x] Spending cap and owner recorded in `docs/DECISIONS.md`.

## 6. Repository
```bash
git init -b main
git remote add origin https://github.com/hallzyx/vitrina.git
```
- Layout: `infra/`, `backend/`, `frontend/`, `docs/mockups/`, `docs/evidence/`.
- `.gitignore` must include at least: `.env`, `.env.*` (except `.env.example`), `.aws-sam/`, `samconfig.toml`, `node_modules/`, `__pycache__/`, `*.pem`.
- Export the mockup screens (screenshots) to `docs/mockups/`. Claude Code cannot open the private canvas, so screenshots give it the visual reference.
- **Conventional Commits** for every commit (`feat:`, `fix:`, `docs:`, `chore:`...).
- Public GitHub repo (good for storytelling and verification). Check for secrets before the first push.

## 7. First prompt to paste into Claude Code
> Read `CLAUDE.md`, `SPEC.md` and `PLAN.md`. Confirm the AWS MCP Server is connected and tell me the account and region you work in. Then, for today's session: (1) propose the repo structure and the minimal SAM `template.yaml` with S3 + CloudFront + a `GET /health` Lambda, (2) give me the estimated cost, (3) after my confirmation, deploy it, (4) log everything in `docs/BUILD_LOG.md` and commit with Conventional Commits. At the end, give me the public URL.

## 8. If something fails
- OAuth 400: check that `AWSMCPSignInOAuthAccessPolicy` (MCP) and `SignInLocalDevelopmentAccess` (`aws login` for IAM users) are attached.
- "Not authorized" when changing the console password: attach `IAMUserChangePassword`.
- Missing credentials: `aws login` or `aws configure sso`.
- AWS tools do not appear: restart Claude Code, then reconnect from `/mcp`.
