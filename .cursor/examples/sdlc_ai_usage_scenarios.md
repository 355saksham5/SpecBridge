# SDLC team — AI usage scenarios (prompt patterns)

Supplement the starter kit agents and **`/council`**. Use **@**-mentions so the model loads the right role (see [`AGENTS.md`](../../AGENTS.md)).

Each block gives **when to use it**, **which kit artifact to lean on**, and **starter prompts** you can paste and customize.

---

## 1. Understanding something *(extends `/council`)*

**When:** Onboarding, spiking unknown tech, reading a long spec or incident write-up.

| Pattern | Starter prompt |
| --- | --- |
| Beginner vs expert | Explain {topic} twice: once for someone new to the repo, once for a senior owner of {area}. Where do the two explanations disagree? What should we resolve first? |
| So-what chain | For {decision or feature}: who is affected first, what breaks if we skip it, and what depends on it in our Angular/ASP.NET Core stack (say TBD if unknown). |
| Course outline | Act as an instructor: outline 4–6 modules to learn {topic} for this codebase, with glossary and common misconceptions. |

**Kit:** [`commands/council.md`](../commands/council.md) for parallel exploration; optional [`technical_analyst.md`](../agents/technical_analyst.md) once scope is known.

---

## 2. Deciding something *(extends `technical-devils-advocate`)*

**When:** RFCs, dependency upgrades, two implementation options, go/no-go on scope.

| Pattern | Starter prompt |
| --- | --- |
| A vs B | Compare {option A} vs {option B} for our context: best case, worst case, most likely. End with a single recommendation and what would flip it. |
| Pre-mortem | We chose {decision}. It is one year later and it failed. List the three most plausible failure modes for *our* team and how to mitigate them now. |
| Future self | If we ship {slice} as designed: what will we thank ourselves for, what will we regret, what did we underestimate? |
| Panel | Simulate four voices—strategist, risk analyst, optimist, skeptic—on {question}. Synthesize one paragraph + open questions for Product. |

**Kit:** [`technical-devils-advocate.md`](../agents/technical-devils-advocate.md); pair with [`technical_analyst.md`](../agents/technical_analyst.md) for impact and test/ops depth.

---

## 3. Documenting something *(extends `doc_review_assistant`)*

**When:** READMEs, runbooks, internal design notes, customer-facing blurbs.

| Pattern | Starter prompt |
| --- | --- |
| Tough editor | Act as a tough but fair editor on {paste or path}: clarity, structure, tone, redundancy. List three cuts and three rewrites with rationale. |
| Reader assumptions | List assumptions this doc makes about the reader. Which are unsafe for {audience}? Add a short "Before you read" paragraph. |
| Weakest line | For audience {X}, identify the single weakest sentence or claim and propose a concrete rewrite. |

**Kit:** [`doc_review_assistant.md`](../agents/doc_review_assistant.md).

---

## 4. Shaping backlog & traceability *(extends `backlog_architect`)*

**When:** Spec is fuzzy; stories are too big; `REQ-…` coverage is unclear.

| Pattern | Starter prompt |
| --- | --- |
| Slice pressure-test | Given this spec excerpt {…}: propose the **smallest** shippable slice (SVS). What is explicitly **not** in this slice? List REQ candidates. |
| AC stress-test | For each Gherkin scenario: is it observable by QA without implementation detail? If not, rewrite or flag. |
| Traceability gap | List every `REQ-…` in the spec and map to story titles or mark **orphan** / **duplicate**. |

**Kit:** [`backlog_architect.md`](../agents/backlog_architect.md) + [`templates/story_template.md`](../templates/story_template.md).

---

## 5a. Developer testing while coding *(extends `developer_testing_agent`)*

**When:** Implementing a slice; you want **unit tests**, **use cases beyond AC**, and edge coverage tied to the **current diff**.

| Pattern | Starter prompt |
| --- | --- |
| Diff-first | I'm changing {files/API}. @developer_testing_agent: use cases, `UT-xx` unit plan, mocks, and where AC `{paste}` still applies. |
| Beyond AC | What failure modes does this code **imply** that Gherkin does not mention? Propose `UT-xx` tests only. |
| Pair with risk | Given Technical Analyst "hotspots" {paste}: unit tests that stress those hotspots in {module}. |

**Kit:** [`developer_testing_agent.md`](../agents/developer_testing_agent.md).

---

## 5b. QA test design after AC *(extends `qa_test_design_agent`)*

**When:** Gherkin is signed off; you need a **formal** AC → `TC-xx` map, environments, and DoD(test) before QA execution.

| Pattern | Starter prompt |
| --- | --- |
| AC → TC audit | @qa_test_design_agent: for each AC in {story}, assign `TC-xx` or mark untestable with fix suggestion. |
| P0 gate | Minimum `TC-xx` set to accept release of {slice}; what must never ship broken? |
| Merge dev + QA | Here are Developer testing notes `{paste}`: ensure every AC still has owning `TC-xx`; note gaps. |

**Kit:** [`qa_test_design_agent.md`](../agents/qa_test_design_agent.md).

---

## 6. Implementation support *(lightweight — not a full "dev agent")*

**When:** Dev wants a second pair of eyes on approach without rewriting the feature spec.

| Pattern | Starter prompt |
| --- | --- |
| Change list | For this PR/diff intent {…}: list files likely touched in Angular and ASP.NET Core, ordered by dependency. Flag **order-sensitive** steps (EF Core migrations, flags). |
| Migration order | We need {schema change}. Order EF Core migration / backfill / dual-write steps and list rollback gotchas. |
| Flag plan | Define flag name(s), default, who flips when, and what telemetry proves success. |

**Kit:** Rules under [`.cursor/rules/`](../rules/); [`technical_analyst.md`](../agents/technical_analyst.md) for prerequisites; implementation still follows team standards.

---

## 7. Release & rollout narrative *(extends `doc_review_assistant` + spec)*

**When:** Pre-release comms, internal "what shipped," rollback talking points.

| Pattern | Starter prompt |
| --- | --- |
| Three audiences | Same change: 5 bullets for engineers, 5 for support, 3 for exec. Align `REQ-…` / story keys. |
| Rollback script | If we must roll back {feature}: user-visible symptoms, steps, data implications (EF Core migration rollback), who to page. |
| Demo script | 3-minute demo: setup, happy path, one failure recovery, closing line tied to business outcome. |

**Kit:** [`doc_review_assistant.md`](../agents/doc_review_assistant.md).

---

## 8. Incident / defect learning *(post-ship)*

**When:** Sev review, bug bash themes, "why did this escape?"

| Pattern | Starter prompt |
| --- | --- |
| Five whys (light) | For {incident summary}: chain up to five whys stopping at a **process** or **test** lever we can change next sprint. |
| Test gap | Which `TC-…` or AC would have caught this? If none, propose a new AC or monitoring check. |
| Blameless summary | Draft timeline + impact + contributing factors + actions (no individual blame). |

**Kit:** Optional link to stories and [`developer_testing_agent.md`](../agents/developer_testing_agent.md) / [`qa_test_design_agent.md`](../agents/qa_test_design_agent.md) outputs.

---

## 9. Security & privacy sanity pass *(lightweight)*

**When:** Story touches auth, PII, uploads, cross-tenant data.

| Pattern | Starter prompt |
| --- | --- |
| STRIDE-lite | For {feature}: list plausible spoofing/tampering/repudiation/information disclosure/DoS/EoP angles; mark N/A with reason. |
| Data inventory | List data classes touched (PII, credentials, audit). Where stored, who can read, retention. |

**Kit:** [`web-security.mdc`](../rules/web-security.mdc), [`technical_analyst.md`](../agents/technical_analyst.md) security bullets.

---

## 10. Initiative → Confluence *(existing flow)*

**When:** PM/engineering need a one-pager or initiative page from structured input.

| Pattern | Starter prompt |
| --- | --- |
| Skeleton fill | Using our initiative template, draft sections {…} from {bullets}; leave TBD where data is missing. |

**Kit:** [`epic_initiative_confluence.md`](../agents/epic_initiative_confluence.md), [`templates/initiative_confluence_skeleton.md`](../templates/initiative_confluence_skeleton.md).

---

## 11. Jira hygiene *(extends Jira skill)*

**When:** Creating or cleaning Epic → Story → Task → Sub-task hierarchy.

| Pattern | Starter prompt |
| --- | --- |
| YAML draft | From this SVS/story list {…}, emit YAML matching our Jira skill schema; use `REQ-…` in summaries where possible. |
| Description sync | Take this markdown story and produce a Jira **Description** block per our skill (Traceability, story, AC, NFRs). |

**Kit:** [`skills/jira-epic-story-task-automation/SKILL.md`](../skills/jira-epic-story-task-automation/SKILL.md).

---

## Quick map: scenario → first @-mention

| Your goal | Start with |
| --- | --- |
| Explore / learn | `@.cursor/commands/council.md` |
| Challenge a decision | `@.cursor/agents/technical-devils-advocate.md` |
| Polish docs / PR narrative | `@.cursor/agents/doc_review_assistant.md` |
| Stories & AC | `@.cursor/agents/backlog_architect.md` |
| Unit tests & use cases while coding | `@.cursor/agents/developer_testing_agent.md` |
| Formal test design vs AC (after AC stable) | `@.cursor/agents/qa_test_design_agent.md` |
| Feasibility & risk | `@.cursor/agents/technical_analyst.md` |
| Confluence initiative | `@.cursor/agents/epic_initiative_confluence.md` |

Add new rows here as your team discovers patterns that work.
