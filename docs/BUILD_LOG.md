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
