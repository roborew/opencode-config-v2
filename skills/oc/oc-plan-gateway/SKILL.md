---
name: oc-plan-gateway
description: Always-on Plan gateway for the OpenCode delivery flow. Starts every new Define/spec phase with a read-only project health check, routes new work through Addy's interview/spec workflows when no approved spec exists, posts the approval requests and watches each gate, and completes spec PR, PRD, and issue handoffs without switching to Build.
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

At the start of this phase, load `interview-me` and `spec-driven-development` (already attached by `/plan` and `/spec`). Follow the specification workflow. Before drafting, use the interview workflow until objective, users, acceptance criteria, constraints, and boundaries are clear. `plugins/shared/lifecycle-policy.ts` owns every Addy trigger and evidence rule, including the Plan approval-gate formats; use `using-agent-skills` to load the applicable contextual workflows rather than maintaining a second trigger table here.

Before drafting the spec, run the **quick project health check** — read-only, never an edit:

1. Confirm the app repo has a closed `AGENTS.md` front-matter block whose `apps:` entries match the repo's real components and scoped skills.
2. Confirm the test contract is usable: one root `compose.yml`, `test`/`full` profiles, declared commands and services, and `test_globs` that match the repo's test paths.
3. Confirm `test.checks` declares the repo's real lint/typecheck services, derived from the repo's actual tooling and Compose services; do not invent checks the stack does not have.
4. Record any missing or stale instruction as an explicit remediation item in the spec. Remediation goes through the normal spec → slice approval flow, or through `repo-setup` when Robin explicitly asks for a repo upgrade. Plan never edits the app repo directly.

Then:

1. After the interview/clarification phase, write the spec to `docs/spec/<slug>.md` (delta specs remain separate and reference the shipped spec) and record decisions under `docs/decisions/**` when needed.
2. **The file must exist before requesting approval.** Commit the spec on `spec/<slug>` and open its PR. **The spec PR is the review surface and may be opened before approval; agents never merge it.** Present its path, a faithful summary, and any open questions in chat as the review invitation. Do not represent a chat-only draft as a written spec.
3. Post the approval-request record yourself on the spec PR: a labelled, agent-authored comment naming the spec path and full commit SHA, for example `SPEC-APPROVAL-REQUEST: docs/spec/<slug>.md @ <full commit SHA>`. Use the `SPEC-APPROVAL-REQUEST` label and never include the approval keyword in the request body. This record is never approval evidence.
4. Start the read-only background **Gate watcher** on that PR immediately after posting the request.
5. When the watcher reports `GATE APPROVAL PRESENT`, read the approval back with read-only GitHub access. It must be an owner-authored comment on that PR containing the gate keyword and the matching current spec commit SHA. The canonical record is:

   `SPEC-APPROVED: <spec path> @ <full commit SHA> — Robin`

   Accept any owner-authored comment that contains `SPEC-APPROVED` and the matching full SHA (for example "approved 9fe8d21f"). GitHub's `created_at` on that comment is the authoritative timestamp; the record carries no self-typed timestamp. Reject a missing, stale, superseded, bot-authored, or SHA-mismatched record. Never write, edit, or manufacture this record; a bot/shared-account record is audit evidence only, not proof of human authorship. A chat reply or hedged answer is not approval.

6. After the read-back, create the PRD through `oc-github` immediately, linking the approved spec. **The PRD is not a gate** and needs no separate approval to exist. Request any shell approval required by the permission rules. Never hand these steps to Build.

**The spec gate is one approval only:** the single `SPEC-APPROVED` comment on that PR. No chat approval round-trip remains: the spec is committed and its PR opened as the review surface before approval, and only the durable comment lets planning continue.

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

1. Show the numbered breakdown and canonical SHA-256 digest in chat. Compute the digest from the displayed ordered lines (`number | title | blockers | labels`), not from a later edited summary.
2. Post the approval-request record yourself on the PRD: the canonical ordered lines and their SHA-256 digest, labelled `BREAKDOWN-APPROVAL-REQUEST` and agent-authored. Never include the approval keyword in the request body. This record is never approval evidence.
3. Start the read-only background **Gate watcher** on the PRD immediately after posting the request.
4. When the watcher reports `GATE APPROVAL PRESENT`, read the approval back before creating anything. It must be an owner-authored PRD comment containing the gate keyword, the matching digest, and the full spec commit SHA. The canonical record is:

   `BREAKDOWN-APPROVED: <sha256> @ <full spec commit SHA> — Robin`

   Accept any owner-authored comment containing `BREAKDOWN-APPROVED` and the matching digest. GitHub's `created_at` is the authoritative timestamp; the record carries no self-typed timestamp. Reject a missing, stale, superseded, bot-authored, or digest-mismatched record. Never write or edit this record.

5. Use `oc-github` to create issues in dependency order as sub-issues of the PRD with blocking relationships and `status:ready` **immediately after the read-back**. The PRD is the approval surface, not a gate of its own.
6. Record any architecture decision with `documentation-and-adrs`.
7. Only now report that Plan is complete and Build can coordinate execution. Create no worktree, sandbox, implementation branch, or code.

A standalone maintenance slice needs only its complete issue and does not acquire a manufactured spec, PRD, or numbered-breakdown approval.

## Gate watcher

Start this read-only watcher the moment a gate approval is requested, on the spec PR or the PRD. Run it through the background shell facility and proceed automatically when it completes:

```sh
deadline=$((SECONDS + 7200))
while [ $SECONDS -lt $deadline ]; do
  match=$(gh api "repos/<owner>/<repo>/issues/<N>/comments" \
    --jq '[.[] | select(.body | test("SPEC-APPROVED|BREAKDOWN-APPROVED"))] | length')
  [ "$match" -gt 0 ] && { echo "GATE APPROVAL PRESENT"; exit 0; }
  sleep 30
done
echo "WATCHER EXPIRED"
```

Rules:

- **Read-only:** the watcher only reads comments. It never posts, edits, labels, or closes anything.
- **Bounded:** it stops after two hours and prints `WATCHER EXPIRED`; never run it unbounded.
- **Never a substitute for verification:** `GATE APPROVAL PRESENT` only means a matching keyword exists. Always perform the mandatory read-back (commit/digest match, human author, `created_at`) before acting; the watcher never replaces the mandatory read-back verification.
- **Agent requests do not wake it:** request bodies use the `APPROVAL-REQUEST` label and never contain the approval keyword, so the watcher cannot complete on its own request.
- **Session-lifetime limitation:** the watcher lives inside the current session. If it expires or the session ends before approval arrives, any later in-chat message re-triggers the read-back; never proceed on an old unverified observation. A server-side webhook is the eventual permanent fix and is out of scope here.

## Non-negotiable gates

- **Two mandatory human approvals, each exactly one owner-authored GitHub comment:** the written spec on its PR, then the numbered slice breakdown on the PRD. **Exactly two one-line comments from Robin per feature, total.**
- **The spec gate is collapsed to one approval.** The spec PR is the review surface and may be opened before approval; the single `SPEC-APPROVED` comment on that PR is the approval. No chat approval round-trip remains. The PRD is created immediately after the spec read-back and is not a gate.
- **The breakdown gate is one approval.** Present the canonical ordered lines and digest, post the labelled request, watch, read back, then create the slice issues immediately in dependency order.
- **The agent posts every approval request and presentation record.** Robin only adds the one-line approval comment, so Robin never copies a template.
- **Agents never author or edit approval records.** They post only labelled, agent-authored approval-request records, which are never approval evidence.
- **Read-back verification is mandatory.** Reject a missing, stale, superseded, bot-authored, or digest-mismatched record. Never assume a watcher hit is valid.
- **No GitHub issues before the relevant approval; no merges, no force-push, and no push to `main`.** The spec branch and its PR are the review surface.
- Every activation/deployment deferral has a named target issue and acceptance criterion before its source slice can close.
- Do not skip Addy's applicable interviews, clarification, verification, or contextual workflows merely because `/plan` was used.
- Git, PR, or other shell operations that require approval should be requested, not avoided.
