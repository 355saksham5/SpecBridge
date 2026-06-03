# PR Review Checklist
Evaluate each item against the PR diff and metadata. Assign `BLOCKER`, `SUGGESTION`, or `PASS`.

---
## 1. PR Description
- [ ] Title is concise and describes the change (not "fix", "update", or "WIP")
- [ ] Body explains **what** changed and **why** (not just how)
- [ ] A linked issue or ticket is referenced (e.g. `Closes #123`, `Resolves JIRA-456`)
- [ ] Breaking changes or special deployment steps are called out explicitly
- [ ] Screenshots or recordings included for UI changes
**BLOCKER if:** Title is missing, body is empty, or the change is non-trivial with no explanation.

---
## 2. SDD Traceability
Applies when the repo follows **Spec-Driven Development (SDD)** with `REQ-…` requirement IDs.
- [ ] PR description references at least one `REQ-…` requirement ID from the feature spec (e.g. `REQ-PORTAL-001`)
- [ ] PR description references the corresponding Jira story key (e.g. `JIRA-123`) or Jira ticket link
- [ ] The code changes fall within the scope of the linked story — no silent scope creep beyond what the story authorises
- [ ] If new scope was introduced, the feature spec and story were updated first (spec-first discipline)
- [ ] Commit messages in the branch include `REQ-…` and/or the Jira key per team convention
**BLOCKER if:** The PR introduces non-trivial changes in a repo using SDD with no `REQ-…` or Jira traceability in the PR description.
**SUGGESTION if:** The repo does not enforce SDD but the PR would benefit from a linked ticket for future auditability.
**PASS if:** `REQ-…` IDs and the Jira key are present, and scope matches the linked story.

---
## 3. Code Quality
- [ ] Logic is correct and handles edge/boundary cases
- [ ] No obvious off-by-one errors, null dereferences, or race conditions
- [ ] No duplicated logic that should be extracted (DRY)
- [ ] No dead code, commented-out blocks, or debug statements (e.g. `Debug.WriteLine`, `Console.WriteLine`, `Debugger.Break()` left in production paths)
- [ ] Methods are focused and not excessively long (>50 lines is a smell)
- [ ] Error handling is present and meaningful — errors are not silently swallowed
- [ ] Complex or non-obvious logic has an explanatory comment
- [ ] No hard-coded environment-specific values (URLs, ports, credentials)
**BLOCKER if:** Logic is clearly incorrect, errors are silently ignored, or hard-coded secrets are present.

---
## 4. Security
- [ ] No secrets, API keys, tokens, passwords, or credentials in the diff
- [ ] All user-supplied input is validated and sanitised before use
- [ ] No SQL/NoSQL injection vectors (raw query concatenation, unsafe interpolated SQL)
- [ ] No XSS vectors (unencoded or untrusted content in Angular templates or API responses that render HTML)
- [ ] Authentication and authorisation checks are present where required
- [ ] No insecure cryptographic algorithms (MD5, SHA1 for security purposes, DES)
- [ ] No new dependencies with known CVEs introduced
- [ ] Sensitive data is not logged or exposed in error messages
- [ ] File paths and shell commands do not accept unvalidated user input (path traversal, command injection)
**BLOCKER if:** Any secret is committed, injection vulnerability is present, or auth checks are missing on protected routes.

---
## 5. Snyk / Dependency Vulnerability Scanning
When the PR adds or changes dependencies (e.g. `*.csproj`, `Directory.Packages.props`, `packages.lock.json`, `global.json`, `nuget.config`, `package.json`, `Dockerfile`, `go.mod`, `pom.xml`) or container images, verify that dependency and container vulnerability scanning is in place and that the PR does not introduce or leave unaddressed high/critical issues.
**What to check:**
- [ ] Snyk (or an equivalent tool, e.g. Dependabot, Trivy, OWASP Dependency-Check, `dotnet list package --vulnerable` in CI) runs in CI for the repo — e.g. `gh pr checks` shows a Snyk (or similar) check, or the diff includes a workflow/step that runs dependency/container scanning
- [ ] If the PR adds or updates dependencies or a Dockerfile, the corresponding Snyk (or equivalent) check is present and **passing** for this PR (or any failure is documented and accepted with a ticket)
- [ ] No new **high** or **critical** vulnerabilities are introduced by the PR; if Snyk (or equivalent) reports such issues, they are either fixed in this PR or explicitly deferred with a linked ticket and risk acceptance
- [ ] For container/Dockerfile changes: container/image scanning (e.g. Snyk Container, Trivy image scan) is run and passes, or any findings are documented and accepted
**BLOCKER if:** The PR adds or changes dependencies or a container image and (1) there is no evidence of Snyk or equivalent dependency/container scanning in CI for this repo, or (2) a Snyk (or equivalent) check is failing due to new high/critical vulnerabilities with no fix or documented exception.
**SUGGESTION if:** Snyk (or equivalent) is not configured; recommend adding dependency and/or container scanning to CI.
**PASS if:** Scanning is in place and passing, or the PR does not touch dependencies or container build.

---
## 6. Tests
- [ ] New behaviour introduced by the PR has corresponding unit or integration tests (xUnit, NUnit, MSTest, etc.)
- [ ] Existing tests are not deleted without a documented reason
- [ ] Tests cover happy path, error path, and relevant edge cases
- [ ] Test assertions are meaningful — not just checking that code runs without error
- [ ] Mocks/fakes are appropriate and do not mask real behaviour
- [ ] CI checks are passing (or failures are explained)
**BLOCKER if:** A non-trivial feature has zero test coverage, or CI is failing without explanation.

---
## 7. Naming & Style
- [ ] Types, methods, and members are descriptive and follow project conventions (PascalCase / camelCase per `.editorconfig`)
- [ ] No single-letter names except for well-understood short-scope variables (loop indices, coordinates)
- [ ] Boolean members are named with `Is`, `Has`, `Can`, `Should` prefixes where appropriate
- [ ] No magic numbers or strings — constants are named and documented
- [ ] File names follow the project's casing convention
- [ ] `using` directives and file-scoped namespaces are ordered and grouped consistently with the rest of the codebase
- [ ] No trailing whitespace, inconsistent indentation, or mixed line endings
**BLOCKER if:** Naming is systematically inconsistent with the codebase conventions in a way that will confuse future readers.

---
## 8. Documentation
- [ ] Public types and members have **XML documentation comments** (`///`) where the project expects them
- [ ] README is updated if the PR changes setup steps, environment variables, or CLI usage
- [ ] Architecture Decision Records (ADRs) or design docs are updated/created if the PR involves a significant design decision
- [ ] Changelog or release notes are updated if the project maintains one
- [ ] API contracts (OpenAPI/Swashbuckle, protobuf, GraphQL schema) are updated alongside implementation changes
**BLOCKER if:** A public API surface changed with no corresponding documentation update.

---
## 9. Breaking Changes
- [ ] No existing public API endpoints are removed or have their contracts changed without a deprecation notice
- [ ] No database schema changes that lack an EF Core migration (or equivalent) and deployment plan
- [ ] No configuration key renames or removals without backward compatibility or migration guidance
- [ ] Consumers of shared libraries are not silently broken by the change
- [ ] If the change is intentionally breaking, a major version bump or migration guide is present
**BLOCKER if:** A breaking change is introduced with no migration path or prior deprecation notice.

---
## 10. AWS Resource Tagging
Every AWS resource defined or modified in the PR (CloudFormation, CDK, Terraform, SAM, etc.) must have all of the following mandatory tags present:

| Tag Key | Purpose |
|---------|---------|
| `wg:purpose:product` | Identifies the product this resource belongs to |
| `wg:purpose:serviceid` | Identifies the specific service/component |
| `wg:purpose:environment` | Identifies the deployment environment (e.g. `prod`, `staging`, `dev`) |
| `wg:automation:expiry` | Expiry date or policy for automated cleanup |
| `wg:info:taggingversion` | Version of the tagging schema applied to this resource |
**What to check in the diff:**
- [ ] Every new AWS resource block includes all 5 tags listed above
- [ ] Every modified AWS resource block retains all 5 tags (none removed)
- [ ] Tag values are non-empty strings — not placeholders like `TODO`, `TBD`, or `""`
- [ ] `wg:purpose:environment` value matches the target deployment environment for the PR
- [ ] `wg:automation:expiry` is a valid date or a recognised policy value (not left as default)
**BLOCKER if:** Any AWS resource is missing one or more of the required tags, or any tag value is empty/placeholder.

---
## 11. AWS Encryption at Rest (CMK)
Every AWS resource in the PR that supports encryption at rest must be encrypted using a **Customer Managed Key (CMK)** via AWS KMS — not an AWS-managed default key.
**Resources that support encryption at rest (non-exhaustive):**

| Service | Resource Type | Required Property |
|---------|--------------|-------------------|
| S3 | Bucket | `BucketEncryption` → `SSEAlgorithm: aws:kms` + `KMSMasterKeyID: <CMK ARN>` |
| RDS / Aurora | DB Instance / Cluster | `StorageEncrypted: true` + `KmsKeyId: <CMK ARN>` |
| DynamoDB | Table | `SSESpecification` → `SSEType: KMS` + `KMSMasterKeyId: <CMK ARN>` |
| EBS | Volume / Launch Template | `Encrypted: true` + `KmsKeyId: <CMK ARN>` |
| EFS | File System | `KmsKeyId: <CMK ARN>` + `Encrypted: true` |
| Secrets Manager | Secret | `KmsKeyId: <CMK ARN>` (not `alias/aws/secretsmanager`) |
| SSM Parameter Store | SecureString Parameter | `KeyId: <CMK ARN>` (not `alias/aws/ssm`) |
| SQS | Queue | `KmsMasterKeyId: <CMK ARN>` (not `alias/aws/sqs`) |
| SNS | Topic | `KmsMasterKeyId: <CMK ARN>` |
| Kinesis | Stream | `StreamEncryption` → `EncryptionType: KMS` + `KeyId: <CMK ARN>` |
| OpenSearch / Elasticsearch | Domain | `EncryptionAtRestOptions` → `Enabled: true` + `KmsKeyId: <CMK ARN>` |
| Redshift | Cluster | `Encrypted: true` + `KmsKeyId: <CMK ARN>` |
| Lambda | Function (env vars) | `KMSKeyArn: <CMK ARN>` |
| ECR | Repository | `EncryptionConfiguration` → `EncryptionType: KMS` + `KmsKey: <CMK ARN>` |
**What to check in the diff:**
- [ ] Every new resource from the table above has encryption at rest explicitly enabled — not relying on an unset default
- [ ] The KMS key referenced is a CMK ARN or a CMK alias — **not** an AWS-managed alias such as `alias/aws/s3`, `alias/aws/rds`, `alias/aws/secretsmanager`, etc.
- [ ] The CMK ARN/alias is not hard-coded — it should be passed as a parameter, SSM reference, or imported value
- [ ] Modified resources have not had their `KmsKeyId` / `KMSMasterKeyID` removed or replaced with an AWS-managed key
- [ ] If a resource type is not listed above, confirm whether it supports encryption at rest before marking as PASS
**BLOCKER if:** Any resource that supports encryption at rest is using an AWS-managed key, has encryption disabled, or has no KMS key specified.

---
## 12. Third-Party Library Versioning
Every third-party dependency added or changed in the PR must be pinned to an **exact version**. Range specifiers, wildcard versions, or "greater than" constraints are not permitted.
**What counts as a violation — examples across ecosystems:**

| Ecosystem | File | Violation | Required |
|-----------|------|-----------|----------|
| .NET | `*.csproj` | `<PackageReference Include="Foo" Version="*" />`, `Version="$(Floating)"`, or missing `Version` where policy requires pins | `<PackageReference Include="Foo" Version="1.2.3" />` |
| .NET | `Directory.Packages.props` / CPVM | Wildcard or unbounded central versions | One explicit version per package |
| Node.js | `package.json` | `"^1.2.3"`, `"~1.2.3"`, `">=1.2.3"`, `"*"`, `"latest"` | `"1.2.3"` |
| Java | `pom.xml` | Version ranges `[1.0,2.0)`, `[1.5,)` | `<version>1.0.0</version>` (exact) |
| Java | `build.gradle` | `implementation 'com.google.guava:guava:+'` | `'com.google.guava:guava:32.1.2-jre'` |
| Ruby | `Gemfile` | `gem 'rails', '>= 7.0'`, `gem 'nokogiri', '~> 1.15'` | `gem 'rails', '7.1.2'` |
| Go | `go.mod` | Indirect upgrades via `>=` in `require` block | exact pseudo-version or tagged version |
| Docker | `Dockerfile` | `FROM mcr.microsoft.com/dotnet/sdk:latest` | digest or full patch tag (e.g. `8.0.101-bookworm-slim`) |
| GitHub Actions | `*.yml` workflows | `uses: actions/checkout@v4`, `uses: actions/setup-dotnet@main` | full commit SHA for `uses:` |
**What to check in the diff:**
- [ ] Every newly added dependency in any manifest file uses an exact, pinned version
- [ ] No range operators are used: `^`, `~`, `>=`, `>`, `~>`, `+`, `*`, `latest`, `lts`, or an untagged branch name (where applicable to that ecosystem)
- [ ] Existing dependencies that were updated in the PR are also pinned to the new exact version — not widened to a range
- [ ] Docker base images and GitHub Actions references use a full digest or exact tag, not a floating tag like `latest` or a major-version alias like `v4`
- [ ] Lock files (`packages.lock.json`, `package-lock.json`, `Gemfile.lock`, etc.) are committed alongside any manifest changes when the repo uses them
**BLOCKER if:** Any new or updated third-party dependency uses a range, wildcard, or "greater than" version specifier instead of an exact pinned version.

---
## 13. Container / ECS Applications — .NET shared utils
**When this applies:** The PR touches a **container application** or **ECS** (Elastic Container Service) service — e.g. Dockerfile, ECS task definitions, container entrypoints, or .NET code that runs in containers.
**Shared .NET utils repo:**
[https://github.infra.int.daas-watchguard.com/DaaS-Common/wg_dotnet_utils](https://github.infra.int.daas-watchguard.com/DaaS-Common/wg_dotnet_utils)
**Before evaluating:** Follow the Step 2 instructions in `SKILL.md` to actively fetch and read the `wg_dotnet_utils` layout and source. For each new service, helper, or utility type added in the PR, look up whether an equivalent exists in the utils repo.
**What to check in the diff:**
- [ ] The application references `wg_dotnet_utils` (or the equivalent shared NuGet / project reference) where appropriate — e.g. logging, configuration, health checks, common AWS/data-access helpers
- [ ] For each new service or helper added in the PR, confirm it is not already provided by `wg_dotnet_utils` — check the actual types, not just the namespace name
- [ ] Where the PR re-implements something that exists in utils, verify there is a clear justification (e.g. utils lacks a required capability); document the justification in the review
- [ ] Where the utils version has capabilities the PR's re-implementation is missing (e.g. Polly retries, resilience), flag this — the PR's version may be strictly worse than using utils
- [ ] No code has been added in this repo that **duplicates** functionality already provided by `wg_dotnet_utils`
- [ ] Package references use a pinned version (see Section 12)
**BLOCKER if:** The app is container/ECS and either (1) duplicates significant logic that exists in `wg_dotnet_utils` without using the shared package, or (2) the PR's re-implementation is missing capabilities (e.g. retries, backoff) that the utils version already provides.
**SUGGESTION if:** Utils could be used for common patterns but the PR uses local implementations with equivalent capability; recommend switching to utils where feasible.

---
## 14. Lambda Applications — Shared .NET Lambda Layer
**When this applies:** The PR touches an **AWS Lambda function** hosting **.NET** — e.g. Lambda handler, SAM/CDK/CloudFormation Lambda resources, or any C# deployed as a Lambda.
**Shared Lambda layer repo:**
[https://github.infra.int.daas-watchguard.com/wgc-common/wgc-dotnet-lambda-layer](https://github.infra.int.daas-watchguard.com/wgc-common/wgc-dotnet-lambda-layer)
**Layer package root (convention):** `application/src/dotnet/LambdaHelpers/`  
Adjust subfolder names to match the live repo; key areas often mirror AWS SDK concerns (DynamoDB, Secrets Manager, SQS, etc.).
**Before evaluating:** Follow the Step 2 instructions in `SKILL.md` to actively fetch and read the layer's module list and source. For each new service or helper added in the PR, look up whether an equivalent exists in `LambdaHelpers`.
**What to check in the diff:**
- [ ] The Lambda function references the shared `wgc-dotnet-lambda-layer` as a layer — e.g. via a layer ARN in CloudFormation/SAM/CDK
- [ ] For each new service or helper added in the PR, confirm it is not already provided by the shared layer — check the actual source, not just names
- [ ] Where the PR re-implements something that exists in the layer, verify there is a clear justification; document it explicitly in the review
- [ ] Where the layer version has capabilities the PR's re-implementation is missing (e.g. retry on throttle, backoff), flag this as a BLOCKER when the layer is strictly better
- [ ] No code inside the Lambda deployment package duplicates functionality already provided by the shared layer
- [ ] The layer version/ARN referenced is pinned — not using `$LATEST` or a floating alias — for reproducible deployments
- [ ] The Lambda's `*.csproj` does not re-vendor packages already supplied by the shared layer
**BLOCKER if:** The Lambda function (1) duplicates significant logic that exists in the shared layer without using the layer, or (2) the PR's re-implementation is missing capabilities that the layer already provides.
**SUGGESTION if:** The layer could cover common patterns used in the function but the PR uses local implementations with equivalent capability; recommend migrating to the layer or contributing upstream.

---
## 15. Open Source Use (WatchGuard policy)
**When this applies:** The PR **adds or upgrades** third-party or open-source dependencies (any manifest: `*.csproj`, `Directory.Packages.props`, `package.json`, `go.mod`, `pom.xml`, `Dockerfile` base images, GitHub Actions references, vendored code, or copied OSS snippets).
**Source of truth:** [Open Source Use at WatchGuard — Policy & Processes](https://watchguard.atlassian.net/wiki/spaces/WGSEC/pages/32440352/Open+Source+Use+at+WatchGuard+-+Policy+Processes) (WGSEC Confluence). Reviewers and authors should confirm checklist items against that page; internal process names may change over time.
**Relationship to other sections:** Use **Section 5 (Snyk)** and **Section 12 (pinning)** for vulnerability scanning and exact versions. This section covers **policy and process compliance** for introducing or changing OSS, not duplicate scanning mechanics.
**What to check:**
- [ ] New or upgraded OSS components are **justified** for the change (no unnecessary dependencies)
- [ ] **License** is acceptable for WatchGuard’s use and distribution model (e.g. copyleft vs permissive implications) per WGSEC policy
- [ ] **Approval / intake** steps defined in WGSEC policy are followed for new components (e.g. security, legal, or registry/catalog requirements as applicable)
- [ ] **Maintenance posture:** upstream is actively maintained; version choice is reasonable and documented where policy expects it
- [ ] **CVE / risk posture:** no unacceptable known-vulnerable versions without a documented exception path (per policy and in addition to Section 5)
- [ ] **Attribution / notices:** LICENSE, NOTICE, or other notice requirements are satisfied when shipping or redistributing, if applicable per policy and the component’s license
- [ ] PR description or linked ticket notes **where policy requires evidence** of OSS review (so reviewers can verify compliance)
**BLOCKER if:** The PR introduces new or materially changed OSS without evidence of WGSEC policy compliance, or uses a license or distribution model that is incompatible with WatchGuard policy, or omits required notices.
**SUGGESTION if:** Compliance is plausible but documentation is thin — ask for explicit reference to the completed intake/review per policy.
**PASS if:** The PR does not add or upgrade OSS, or evidence and license posture clearly align with WGSEC policy.

---
## 16. Performance & Scalability
**When this applies:** The PR affects **latency, throughput, capacity, concurrency, or resource usage** — e.g. hot paths, data access patterns, APIs, batch jobs, caches, queues, **Angular** UI lists or heavy modules, infrastructure that scales (Lambda timeouts/memory, ECS tasks, connection pools, DynamoDB/GSIs, etc.).
**What to check:**
- [ ] **Hot paths & complexity:** algorithmic behaviour is appropriate for expected data sizes; no obvious accidental quadratic or worse patterns in loops, joins, or nested queries
- [ ] **Data access:** N+1 patterns avoided; list/search endpoints use **pagination, limits, or cursors** where result sets can grow unbounded; bulk operations are batched where appropriate
- [ ] **Database & indexes:** schema or query changes that need new indexes or query plans are addressed (or documented as follow-up with ticket)
- [ ] **Caching:** caching used where it materially helps; **invalidation** boundaries and stale-data risk are acceptable for the use case
- [ ] **Concurrency & backpressure:** async/`ConfigureAwait`, channels, and parallelism are used safely; bounded pools; **timeouts and retries** on external calls are sensible (see also `.cursor/rules/dotnet-api.mdc` and `dotnet-data-access.mdc`)
- [ ] **Resource bounds:** large payloads handled via streaming/chunking where needed; no unbounded in-memory accumulation of rows or messages
- [ ] **Angular (if applicable):** change detection and RxJS subscription lifecycle; lazy loading / bundle impact for new heavy modules — align with `.cursor/rules/angular-patterns.mdc`
- [ ] **Operational scale:** quotas, rate limits, autoscaling behaviour, and noisy-neighbour impact on shared dependencies (DB, queues, downstream APIs) are considered
**BLOCKER if:** The change introduces clearly **unbounded** work (unbounded queries, unbounded parallelism, no timeouts on critical external paths) without mitigation or ticket.
**SUGGESTION if:** Performance or scale risks exist but are mitigated or acceptable — document limits, load assumptions, or follow-up work.
**PASS if:** No material hot-path or capacity impact, or the PR demonstrates appropriate limits and patterns for expected load.
