---
name: jira-epic-story-task-automation
description: >-
  Structures Jira work as Epics, Stories, Tasks, and Sub-tasks with consistent
  naming, labels, parent links, and SDD traceability (REQ-…). Use when creating
  or breaking down Jira work for Angular + ASP.NET Core delivery, importing backlog
  YAML/JSON, automating Epic→Story→Task hierarchies, or when the user mentions
  epics, stories, tasks, sub-tasks, or manager tracking stories.
---

# Jira Epic / Story / Task / Sub-task Automation

Apply this workflow whenever creating or restructuring Jira issues from features, initiatives, or structured input (including YAML/JSON). Align issue text with **Specs-Driven Design (SDD)**: same **`REQ-…`** IDs and story language as `.cursor/templates/story_template.md` and `agents/backlog_architect.md`.

## Execution order (mandatory)

1. **Epics** — Create all Epics first (one per major feature or initiative).
2. **Stories and Tasks** — Create user-facing Stories and technical Tasks; link each to its parent Epic (or Story for Tasks that roll up under a story when your process requires it).
3. **Sub-tasks** — Create under the parent **Story** or **Task** only after the parent exists.

Never create Sub-tasks before their parent Story or Task exists.

## 1. Epic

**When:** One Epic per major feature or initiative.

| Field | Rule |
|-------|------|
| **Name** | `[Feature/Initiative Name] – [Target Release/Sprint or Date]` (use en dash `–` or hyphen `-` consistently per project) |
| **Summary** | Brief overall goal (can mirror or expand the name) |
| **Labels** | e.g. `BigRock`, `PM_Backlog`, `Maintenance` — pick what the project uses |
| **Custom fields** | Populate `Dev Sprint Estimate`, `Teams`, `Parent`, etc. when the project requires them |

**Example**

- **Name:** Merge Account Feature – Q2 2026  
- **Summary:** Enable users to merge multiple accounts into a single profile for improved support experience.

## 2. Story (under Epic)

**When:** Each user-facing requirement.

| Field | Rule |
|-------|------|
| **Summary** | `As a <user>, I want <goal> so that <reason>` |
| **Epic link** | The Epic created above |
| **Acceptance criteria** | Numbered or bulleted; each item testable and unambiguous; link **Gherkin** or **REQ-…** IDs when the team uses SDD |
| **Labels** | Optional: `UI`, `Backend`, etc. |

**Example**

- **Summary:** As a support agent, I want to merge user accounts so that customers have a unified profile.  
- **Epic link:** Merge Account Feature – Q2 2026  
- **Acceptance criteria:**  
  - Agent can search and select accounts to merge  
  - System validates merge eligibility  
  - Merged account retains all history  

## 3. Task (under Epic or Story)

**When:** Technical or non-user-facing work (APIs, EF Core migrations, infra, refactors without a user story).

| Field | Rule |
|-------|------|
| **Summary** | Describe the technical work clearly |
| **Parent** | Epic **or** Story (match team convention) |
| **Labels** | e.g. `Backend`, `Infrastructure` |

**Example**

- **Summary:** Implement ASP.NET Core API endpoint for account merge  
- **Parent:** Merge Account Feature – Q2 2026  

## 4. Sub-task (under Story or Task)

**When:** Granular execution units for dev/QA.

| Field | Rule |
|-------|------|
| **Summary** | Specific work unit; prefix with `DEV:`, `QA:`, etc. if the team standardizes that |
| **Parent** | Story or Task (never an Epic directly unless your Jira config allows and the team agrees) |
| **Assignee** | Developer / QA / other as known |

**Example pattern**

- DEV: Add EF Core entity and migration for merged account table  
- DEV: Implement merge logic in AccountService  
- DEV: Integration testing with WebApplicationFactory (list use cases)  
- QA: Create test plan  
- QA: Execute test plan  

## 5. Manager tracking Story (optional, per Epic)

**When:** Oversight, coordination, time logging for prioritization and QA.

| Field | Rule |
|-------|------|
| **Summary** | `Manager tracking for [Epic Name]` |
| **Epic link** | Same Epic |
| **Description** | Log hours and activities for coordination, prioritization, and QA oversight |

## Linking rules (reporting)

- Every **Story** and **Task** created in this flow must link to its **Epic** (directly or via parent hierarchy your board expects).
- Every **Sub-task** must link to its **Story** or **Task** parent.
- Use **clear, consistent naming** across Epics so `epic_link` in YAML matches the Epic **summary or key** your automation uses.

## YAML / JSON input (pseudo-schema)

Use this shape to plan or drive creation. Resolve `epic_link` to the actual Epic issue key after Epics are created.

```yaml
epics:
  - name: "Merge Account Feature – Q2 2026"
    summary: "Enable users to merge multiple accounts into a single profile for improved support experience."
    labels: ["BigRock"]
    custom_fields:
      dev_sprint_estimate: 8
      teams: ["Support", "Backend"]

stories:
  - summary: "As a support agent, I want to merge user accounts so that customers have a unified profile."
    epic_link: "Merge Account Feature – Q2 2026"
    acceptance_criteria:
      - "Agent can search and select accounts to merge"
      - "System validates merge eligibility"
      - "Merged account retains all history"
    sub_tasks:
      - summary: "DEV: Add EF Core entity and migration for merged account table"
        assignee: "dev1"
      - summary: "DEV: Implement merge logic in AccountService"
        assignee: "dev2"
      - summary: "DEV: Integration testing with WebApplicationFactory"
        assignee: "dev3"
      - summary: "QA: Create test plan"
        assignee: "qa1"
      - summary: "QA: Execute test plan"
        assignee: "qa2"

tasks:
  - summary: "Implement ASP.NET Core API endpoint for account merge"
    epic_link: "Merge Account Feature – Q2 2026"
    labels: ["Backend"]
```

Optional top-level key:

```yaml
manager_tracking_stories:
  - epic_link: "Merge Account Feature – Q2 2026"
```

## Jira / MCP checklist

When creating issues in Jira (API or Atlassian MCP):

1. Resolve **cloudId** and **projectKey** for the target site/project.  
2. Use the correct **issue type** per item: Epic, Story, Task, Sub-task (names vary by project — confirm with project metadata).  
3. Set **Epic Link** or parent fields as required by the project's Jira configuration.  
4. Apply **labels** and **custom fields** for reporting.  
5. Create in order: Epics → Stories/Tasks → Sub-tasks; store returned keys to wire parents.

## Quality bar

- Acceptance criteria are **testable** (given/when/then or observable outcomes).  
- No duplicate Epics for the same initiative unless intentionally split by release.  
- Sub-tasks are **small enough** to track in a sprint but not so granular that overhead dominates.
