---
name: skills-sync
description: Previews and applies stable-release updates for vendored Addy and Matt skills, with one combined approval and a lifecycle-compatibility gate. Use only from /sync-skills or when the user explicitly asks to synchronize both upstreams.
---

# skills-sync — combined upstream synchronization

This is the canonical procedure behind `/sync-skills`. It coordinates the two
source-specific adapters:

- `addy-sync` owns `skills/addy/`.
- `matt-sync` owns `skills/matt/`.

Neither adapter may write before the combined approval below. A single adapter
may still be run directly as a preview; direct application follows the same
safety rules.

## 1. Preflight

1. Verify the checkout is `opencode-config-v2`, not an app repo.
2. Require a clean working copy. Stop rather than mixing an update with local
   changes.
3. Read the current pins from `skills/addy/UPSTREAM.md` and
   `skills/matt/UPSTREAM.md`.
4. Read the lifecycle integration before judging impact:
   - `plugins/shared/lifecycle-policy.ts`
   - Plan and Build permissions in `opencode.jsonc`
   - `plugins/oc-skills/`
   - `skills/oc/oc-plan-gateway/` and `skills/oc/oc-build-gateway/`
   - `agents/matt.md`
   - command templates, `AGENTS.md`, tests, and CI
5. Parse optional `addy=<tag-or-sha>` and `matt=<tag-or-sha>` arguments.
   Reject unknown arguments.

## 2. Resolve production releases

For each upstream with no explicit ref:

1. Resolve the latest **non-draft, non-prerelease** GitHub release.
2. Resolve its tag to the full commit SHA, dereferencing an annotated tag when
   necessary.
3. Record both the release tag and commit SHA.
4. Never fall back to `main`.

An explicitly requested full SHA is allowed for reproducibility. An explicitly
requested `main` or branch is a preview only and must be labelled as
non-production in every report. Never apply a preview without saying so in the
approval request.

## 3. Stage and validate before writing

Clone each selected ref into a throwaway directory outside the repository.
Validate both snapshots completely before presenting them.

For Addy:

- Enumerate the complete released `skills/` set and upstream `references/`.
- Confirm all skill-local or shared references required by the release are
  present.
- Preserve executable modes.
- Use the release's plugin/manifest metadata when available to distinguish
  published content from repository-only material.

For Matt:

- Read `.claude-plugin/plugin.json`; it is the production allowlist.
- Include exactly the promoted `engineering/` and `productivity/` directories.
- Copy every file in each promoted skill, including `agents/openai.yaml`,
  companion Markdown, templates, scripts, and executable modes.
- Exclude `skills/in-progress/`, `skills/misc/`, `skills/deprecated/`,
  `.out-of-scope/`, READMEs outside skill folders, documentation site, CI,
  Changesets, and development tooling.

Across both:

- Reject duplicate skill IDs between Addy, Matt, and `skills/oc`.
- Resolve operative cross-skill references or report any external runtime
  dependency; do not silently vendor a new helper outside the production
  manifest.
- Detect added, renamed, removed, or newly required skills.
- Check that no upstream file requires edits to operate in OpenCode. If it
  does, stop: compatibility belongs in OC-owned files, not vendored content.

## 4. Compatibility analysis

Present the exact impact on the internal lifecycle.

### Addy

Every Addy skill requires an explicit owner and activation in
`plugins/shared/lifecycle-policy.ts`, matching permission access for that owner.
A content-only update of existing skills should not change routing.

For a new Addy skill, propose its `owner`, activation phase(s), trigger,
evidence kind, permission additions, and any affected gateway, command, template
or test text. Do not activate it until the user approves that mapping.

For a removed or renamed skill still referenced by the lifecycle, block with the
exact broken references and propose a mapping or removal. Never silently map it
to the nearest-sounding replacement.

### Matt

Matt must stay outside the delivery lifecycle:

- Plan and Build keep no Matt skill allow rules.
- `oc-skills` gains no Matt attachment or overlay.
- OC gateways and lifecycle commands gain no Matt references.
- `agents/matt.md` remains the only agent allowed to load Matt workflow skills.
- The production manifest change may require adding/removing skill permissions
  in `agents/matt.md` and updating the menu/isolation tests.

Run the current tests before proposing the diff when practical, so the report can
distinguish pre-existing failures from sync impact.

## 5. One approval gate

Show one compact report containing:

- The old and new release tag/full SHA for each upstream.
- A file-level diff summary for both trees.
- Added, changed, and removed skills.
- New or changed dependencies and supporting files.
- Proposed Addy lifecycle/permission reconciliation.
- Proposed `agents/matt.md` permission/menu reconciliation.
- Confirmation that Matt and Plan/Build isolation is unchanged or the exact
  approved exception.
- Any preview ref and its risks.
- The verification commands that will run after applying.

Wait for explicit approval. Approval of the upstream diff does **not** imply
approval of an unlisted routing change; those changes must be in the report.
Hedged answers are not approval.

## 6. Apply

After approval, call the relevant adapter procedure in apply mode:

- `addy-sync` copies the approved Addy release and updates its provenance.
- `matt-sync` copies the approved Matt production set and updates its
  provenance.

Then apply only the approved compatibility edits. Do not edit vendored files,
Plan/Build Matt isolation, or unrelated lifecycle behavior.

Never commit, push, publish, open issues or PRs, merge, or deploy unless the user
separately asks. If the user asks for a commit that touches both trees, it must
carry both trailers:

```text
Addy-Sync: <full-addy-sha>
Matt-Sync: <full-matt-sha>
```

Separate commits need only their own adapter's trailer.

## 7. Verify and report

Run:

```text
npm ci
npm test
npm run typecheck
```

Also run the repository's config-verification workflow or equivalent checks.
Treat any failure as an incomplete sync. Report the affected files and do not
claim success or prepare a commit.

Final report:

- release tag and commit for both trees;
- approved lifecycle changes and Matt permission changes;
- verification results;
- any unapplied preview or follow-up.
