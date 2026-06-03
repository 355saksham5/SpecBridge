---
name: pr-readiness-check
description: >-
  Runs a first-pass readiness check on a GitHub Pull Request before it goes to
  human review. Checks common standards and catches obvious issues early: SDD
  traceability (REQ-… IDs, story links, scope match), PR description quality,
  code quality, security basics, Snyk/dependency scanning, test coverage, naming
  conventions, documentation, breaking changes, AWS tagging/encryption,
  third-party library pinning, WatchGuard Open Source Use policy (WGSEC) compliance
  when dependencies change, performance and scalability of hot paths and data access,
  and WatchGuard shared-library usage (wg_dotnet_utils for ECS/Container apps;
  wgc-dotnet-lambda-layer for Lambda apps). Targets **Angular** SPA plus **ASP.NET Core**
  APIs in this kit. Use when the user asks to run a readiness
  check, sanity check, or first-pass check on a PR.
---
# PR Readiness Check
> **This is a first-pass sanity check, not a replacement for human review.**
> It catches common issues early — before a human reviewer spends time on a PR
> that is missing basics. Run it on your own PR before requesting review, or as
> a pre-merge gate before the human reviewer looks at the code.
>
> **Companion to `.cursor/agents/doc_review_assistant.md`.**
> Run this skill for code/security/compliance readiness. Use `doc_review_assistant.md` for
> acceptance-criteria mapping, release notes, and demo scripts. Together they form
> the full post-implementation gate in the SDD workflow.
>
> **Output location:** Readiness report is printed to chat. Optionally save to
> `output/{project-name}/pr-readiness-{pr-number}.md` in the workspace — keeping it
> alongside your spec, stories, and plan.

## Prerequisites

- `gh` CLI installed and authenticated (`gh auth login`)
- PR number and repo (e.g. `owner/repo`) — or a full PR URL
- (Optional) Access to the internal GitHub Enterprise instance for shared-library checks

---

## Workflow

Follow these steps in order.

### Step 1 — Gather PR data
Run all three commands and capture their output:
```bash
gh pr view <PR_NUMBER> --repo <owner/repo> --json number,title,body,author,baseRefName,headRefName,labels,url
gh pr diff <PR_NUMBER> --repo <owner/repo>
gh pr checks <PR_NUMBER> --repo <owner/repo>
```
If the user provides a full URL (e.g. `https://github.com/owner/repo/pull/123`), extract `owner/repo` and `123` from it.
If the user is already inside a cloned repo, omit `--repo` and use the current directory context.
When evaluating **Snyk / dependency scanning:** use the output of `gh pr checks` to see if a Snyk (or similar) check ran and whether it passed. If the PR changes dependencies or a Dockerfile, confirm that dependency/container scanning is present and passing, or that high/critical findings are documented and accepted.

---
### Step 2 — Inspect the shared library / layer contents (Container/ECS and Lambda PRs only)
Before evaluating the checklist, **actively fetch the module list** from the relevant shared repo so you know exactly what is available to compare against the PR's code.

#### For Container/ECS PRs — fetch wg_dotnet_utils modules
```powershell
# List top-level folders under src (adjust path if repo layout differs)
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/DaaS-Common/wg_dotnet_utils/contents/src" --jq '.[].name'

# Drill into any subfolder that looks relevant to the PR
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/DaaS-Common/wg_dotnet_utils/contents/src/<package>" --jq '.[].name'

# Read the source of any type file that might overlap with PR code
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/DaaS-Common/wg_dotnet_utils/contents/src/<path>/<file>.cs" `
  --jq '.content' | ForEach-Object {
    $bytes = [System.Convert]::FromBase64String($_.Replace("`n",""))
    [System.Text.Encoding]::UTF8.GetString($bytes)
  }
```
#### For Lambda PRs — fetch wgc-dotnet-lambda-layer modules
```powershell
# List top-level areas inside the layer's dotnet source
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/wgc-common/wgc-dotnet-lambda-layer/contents/application/src/dotnet/LambdaHelpers" `
  --jq '.[].name'

# Drill into any subfolder that looks relevant (e.g. DynamoDb, SecretsManager)
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/wgc-common/wgc-dotnet-lambda-layer/contents/application/src/dotnet/LambdaHelpers/<module>" `
  --jq '.[].name'

# Read the source to understand the public API and capabilities
gh api --hostname github.infra.int.daas-watchguard.com `
  "repos/wgc-common/wgc-dotnet-lambda-layer/contents/application/src/dotnet/LambdaHelpers/<module>/<file>.cs" `
  --jq '.content' | ForEach-Object {
    $bytes = [System.Convert]::FromBase64String($_.Replace("`n",""))
    [System.Text.Encoding]::UTF8.GetString($bytes)
  }
```
For each new service or helper added in the PR's diff, compare it against what you fetched:
- What types and methods does the shared library expose?
- Does the PR's new code re-implement something the shared library already provides?
- Does the shared library's version include capabilities the PR's version is missing (e.g. retry logic, resilience policies, throttle handling)?
- Is the PR's version justified because the shared library lacks a required capability (e.g. transactions, bulk APIs)?
Document your findings explicitly in the **Container/ECS & Utils** or **Lambda & Shared Layer** category of the review report.

---
### Step 3 — Evaluate against the checklist
Read [CHECKLIST.md](CHECKLIST.md) and evaluate each category against the diff and PR metadata.
For every item, assign one of:
- `BLOCKER` — must be resolved before merge
- `SUGGESTION` — worth improving but not blocking
- `PASS` — criterion is satisfied
**Stack-specific evaluation (Angular + ASP.NET Core):**
- **Angular (`.ts`, `.html`, `.scss`):** Check change-detection strategy (Default vs OnPush), RxJS subscription lifecycle and leak risk, lazy-loading impact on bundle size, accessibility (WCAG 2.1 AA), and XSS via unsanitised template bindings. Reference `.cursor/rules/angular-patterns.mdc` and `.cursor/rules/web-security.mdc`.
- **ASP.NET Core / Minimal API (`.cs`):** Check FluentValidation or Data Annotations on inputs, idempotency for write operations, authorization enforced in the application/service layer (not only `[Authorize]` on endpoints), and EF Core migration ordering for schema changes. Reference `.cursor/rules/dotnet-api.mdc`, `dotnet-backend-patterns.mdc`, and `dotnet-data-access.mdc`.
- **Container/ECS apps:** Also evaluate the **Container / ECS Applications — .NET shared utils** checklist section. Ensure the app uses [wg_dotnet_utils](https://github.infra.int.daas-watchguard.com/DaaS-Common/wg_dotnet_utils) where appropriate and that no code duplicates functionality already in that utils repo.
- **Lambda apps:** Also evaluate the **Lambda Applications — Shared .NET Lambda Layer** checklist section. Ensure the function attaches the [wgc-dotnet-lambda-layer](https://github.infra.int.daas-watchguard.com/wgc-common/wgc-dotnet-lambda-layer) where appropriate and that no code bundled inside the Lambda duplicates functionality already in the shared layer.
- **Open Source (WGSEC):** For any PR that **adds or upgrades dependencies** or introduces new OSS, also evaluate the **Open Source Use (WatchGuard policy)** checklist section in [CHECKLIST.md](CHECKLIST.md) against [WGSEC Open Source Use policy](https://watchguard.atlassian.net/wiki/spaces/WGSEC/pages/32440352/Open+Source+Use+at+WatchGuard+-+Policy+Processes).
- **Performance & scalability:** For PRs that affect **latency, throughput, capacity, or resource usage**, also evaluate the **Performance & Scalability** checklist section in [CHECKLIST.md](CHECKLIST.md) in addition to code-quality and stack-specific bullets above.

---
### Step 4 — Output the review
Use the report template below exactly. Optionally save to `output/{project-name}/pr-review-{pr-number}.md`.

---
## Report template

```markdown
## PR Review: #<number> — <title>
**Repo:** <owner/repo>
**Author:** <author>
**Base → Head:** <base> ← <head>
**CI Status:** <passing / failing / pending / no checks>

---
### Summary
<One concise paragraph describing what the PR does and the overall quality assessment.>

---
### Category Findings

#### SDD Traceability
- [PASS/SUGGESTION/BLOCKER] <finding — REQ-… IDs present; Jira story linked; scope matches the story>

#### PR Description
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Code Quality
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Security
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Snyk / Dependency Scanning
- [PASS/SUGGESTION/BLOCKER] <finding — Snyk or equivalent in CI; no new high/critical vulns unaddressed>

#### Tests
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Naming & Style
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Documentation
- [PASS/SUGGESTION/BLOCKER] <finding>

#### Breaking Changes
- [PASS/SUGGESTION/BLOCKER] <finding>

#### AWS Resource Tagging *(only if PR defines or modifies AWS resources)*
- [PASS/SUGGESTION/BLOCKER] <finding — all 5 wg:* tags present; no empty or placeholder values>

#### AWS Encryption at Rest *(only if PR defines or modifies AWS resources)*
- [PASS/SUGGESTION/BLOCKER] <finding — CMK used; not an AWS-managed key>

#### Third-Party Library Versioning *(only if PR adds or changes dependencies)*
- [PASS/SUGGESTION/BLOCKER] <finding — exact pinned versions; no ranges, wildcards, or floating tags>

#### Open Source Use (WGSEC policy) *(only if PR adds or upgrades OSS / third-party components)*
- [PASS/SUGGESTION/BLOCKER] <finding — license and intake per WGSEC policy; notices if required>

#### Performance & Scalability *(only if PR affects hot paths, data access, infra capacity, or UI performance)*
- [PASS/SUGGESTION/BLOCKER] <finding — bounds, pagination, timeouts, concurrency, load assumptions>

#### Container/ECS & Utils *(only if PR is a container or ECS app)*
- [PASS/SUGGESTION/BLOCKER] <finding — uses wg_dotnet_utils; no logic duplicated from utils>

#### Lambda & Shared Layer *(only if PR is a Lambda app)*
- [PASS/SUGGESTION/BLOCKER] <finding — attaches wgc-dotnet-lambda-layer; no logic duplicated from the layer>

---
### Verdict
**[ Approve | Request Changes | Needs Discussion ]**
> <One sentence justification for the verdict.>

---
### Blockers (if any)
1. <file>:<line> — <description>
```

---
## Verdict rules

| Condition | Verdict |
|-----------|---------|
| Zero BLOCKERs | Approve |
| One or more BLOCKERs | Request Changes |
| Ambiguous scope, missing context, or architectural concerns | Needs Discussion |

---
## Pairing with other kit artifacts

| When | Action |
|------|--------|
| AC coverage is uncertain | Run `@.cursor/agents/doc_review_assistant.md` to map PR changes to acceptance criteria |
| SDD traceability is a BLOCKER | Ensure `REQ-…` IDs are in the spec and stories; update the PR description before re-reviewing |
| If Category 3 (Code Quality) or Category 7 (Naming & Style) produces a BLOCKER or SUGGESTION finding. Do not suggest it if both categories are PASS. | Suggest the author runs `@.cursor/skills/remove-ai-code-slop/SKILL.md` locally to fix the issues before re-running the readiness check |
| Architectural concerns arise | Run `@.cursor/agents/technical-devils-advocate.md` before the PR is merged |
| After merge | Use `@.cursor/agents/doc_review_assistant.md` for release notes, sprint update, and demo script |

---
## Additional resources
- For detailed per-category criteria, see [CHECKLIST.md](CHECKLIST.md)
- Angular SPA: `.cursor/rules/angular-patterns.mdc`
- ASP.NET Core / C# / EF Core: `.cursor/rules/dotnet-api.mdc`, `dotnet-backend-patterns.mdc`, `dotnet-data-access.mdc`, `dotnet-standards.mdc`
- Security guardrails: `.cursor/rules/security.mdc`, `web-security.mdc`
- SDD workflow: `.cursor/rules/specs-driven-design.mdc`
