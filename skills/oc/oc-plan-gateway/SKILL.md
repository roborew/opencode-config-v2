---
name: oc-plan-gateway
description: Always-on Plan gateway for the OpenCode delivery flow. Starts every new Define/spec phase with a read-only project health check, routes new work through Addy's interview/spec workflows when no approved spec exists, resumes vertical-slice planning for approved specs, and completes spec PR, PRD, and issue handoffs without switching to Build.
---

# Plan gateway — Define + Plan

Only `using-agent-skills` and this slim gateway are attached on every prompt. This prevents unconditional context bloat while preserving the gateway in command-free sessions. Apply the meta-skill when work starts and whenever context changes; load each full core workflow when its phase begins, using the permitted skill tool or the corresponding command's attachments.

## Route the request first

Use read-only `explore`/`general` research to locate the current spec, PRD, decisions, and relevant code.

- **No approved spec for a new project, feature, significant change, or delta:** start **Define**, even when the user invoked `/plan` or merely selected Plan. Never ask the user to invoke `/spec` separately.
- **Approved spec, or PRD verifiably linked to an approved spec, without an approved slice breakdown:** resume at **Plan slices**. If an existing PRD cannot prove that its spec was approved, stay in Define and establish the spec/approval before any slicing.
- **Approved slice breakdown:** report the ready handoff; dismantling or replanning it needs an explicit request.
- **Small planning question:** answer directly without manufacturing a lifecycle. When uncertain whether a change is significant, ask rather than silently skipping the spec.

Never write app code or require a switch to Build for spec files, decisions, spec PRs, PRDs, or slice issues.

## 1. Define when no approved spec exists

At the start of this phase, load `interview-me` and `spec-driven-development` (already attached by `/plan` and `/spec`). Follow the specification workflow. Before drafting, use the interview workflow until objective, users, acceptance criteria, constraints, and boundaries are clear. `plugins/shared/lifecycle-policy.ts` owns every Addy trigger and evidence rule; use `using-agent-skills` to load the applicable contextual workflows rather than maintaining a second trigger table here.

Before drafting the spec, run the **quick project health check** — read-only, never an edit:

1. Confirm the app repo has a closed `AGENTS.md` front-matter block whose `apps:` entries match the repo's real components and scoped skills.
2. Confirm the test contract is usable: one root `compose.yml`, `test`/`full` profiles, declared commands and services, and `test_globs` that match the repo's test paths.
3. Confirm `test.checks` declares the repo's real lint/typecheck services, derived from the repo's actual tooling and Compose services; do not invent checks the stack does not have.
4. Record any missing or stale instruction as an explicit remediation item in the spec. Remediation goes through the normal spec → slice approval flow, or through `repo-setup` when Robin explicitly asks for a repo upgrade. Plan never edits the app repo directly.

Then:

1. Write the spec to `docs/spec/<slug>.md` (delta specs remain separate and reference the shipped spec) and record decisions under `docs/decisions/**` when needed.
2. **The file must exist before requesting approval.** Show its path and contents or a faithful summary and any open questions. Do not represent a chat-only draft as a written spec.
3. Stop and wait for explicit approval. Hedged answers are not approval; do not start planning in the turn that first presents the spec.
4. After explicit approval, commit the spec on `spec/<slug>` and open its PR. Robin—not the agent—must then post this durable approval on that PR, outside agent tools:

   `SPEC-APPROVED: <spec path> @ <full commit SHA> — Robin — <ISO-8601 timestamp>`

5. Read the approval back with read-only GitHub access. It must name the current spec commit, a real human, and a timestamp before planning. Never write, edit, or manufacture this record; a bot/shared-account record is audit evidence only, not proof of human authorship. Stale or superseded records are invalid.
6. Create the PRD through `oc-github`, linking the approved spec. Request any shell approval required by the permission rules. Never hand these steps to Build.

Then continue to vertical slicing in this later, post-approval turn. Do not create the slice issues until the separate breakdown gate below passes.

## 2. Plan vertical slices

Before slicing, load `planning-and-task-breakdown` and `oc-github` (already attached by `/plan`). Follow the planning workflow, with these OC output conventions replacing the generic file defaults:

- The plan record is the approved spec, PRD, and linked GitHub slice issues. **Do not create `tasks/plan.md` or `tasks/todo.md`.**
- Drafting is read-only: do not edit app files or create issues before the breakdown is approved. This does not prohibit the Define outputs above or the post-approval issue creation below.

Each independently mergeable slice fits one fresh context and crosses every applicable layer in one PR. Skip layers and generated artifacts the repo does not have; never split behavior into tier-only PRs. Record dependencies; use expand/contract for schema changes; hide incomplete behavior behind a flag and plan its `flag-removal` slice.

For every slice provide:

- title, implementation scope, and testable acceptance criteria;
- blockers and dependency order;
- `area:<app>` for every logical component touched, plus applicable `area:db` / `area:infra`;
- contract-change status, `risk:security` where applicable, and the flag plan;
- a compact **Lifecycle workflows** declaration: additional contextual Addy workflows and reasons, with declared judgment triggers explicitly considered. Do not list the standard core or add a 25-item checklist;
- **Deferred requirements** with a named target issue and target acceptance criterion for each activation/deployment prerequisite.

1. Show the numbered breakdown and canonical SHA-256 digest, then stop for explicit approval. Compute the digest from the displayed ordered lines (`number | title | blockers | labels`), not from a later edited summary.
2. After approval, Robin—not the agent—must add this durable PRD comment outside agent tools:

   `BREAKDOWN-APPROVED: <sha256> @ <full spec commit SHA> — Robin — <ISO-8601 timestamp>`

3. Read it back before creating anything. Reject a missing, stale, superseded, bot-authored, or digest-mismatched record. Never write or edit this record.
4. Use `oc-github` to create issues in dependency order as sub-issues of the PRD with blocking relationships and `status:ready`.
5. Record any architecture decision with `documentation-and-adrs`.
6. Only now report that Plan is complete and Build can coordinate execution. Create no worktree, sandbox, implementation branch, or code.

A standalone maintenance slice needs only its complete issue and does not acquire a manufactured spec, PRD, or numbered-breakdown approval.

## Non-negotiable gates

- Two separate explicit approvals: the written spec, then the numbered slice breakdown, each persisted with its exact revision in the formats above.
- Agents never author approval records. No GitHub issues before the relevant approval; no assumption that a PRD exists when the request needs a spec.
- Every activation/deployment deferral has a named target issue and acceptance criterion before its source slice can close.
- Do not skip Addy's applicable interviews, clarification, verification, or contextual workflows merely because `/plan` was used.
- Git, PR, or other shell operations that require approval should be requested, not avoided.
