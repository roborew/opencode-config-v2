<!-- oc-github template — config only (D33), never copied into an app repo.
     Fill every {{...}} placeholder from the slice branch's work, delete this
     comment, then open the PR:
     gh pr create --body-file <filled.md> --title "<slice title>" -->

Closes #{{slice_issue}}
Part of #{{prd_issue}}

## What changed

{{what_changed}}
<!-- summary of the vertical slice through every applicable layer, for example
     migration → API → generated client → web → E2E; skip absent layers -->

## Contract change and regenerated artifacts

{{contract_change}}
<!-- no/not applicable, or: yes — regenerated through the declared generator
     service and committed (never hand-edited) -->

## Red/green evidence

{{red_green_evidence}}
<!-- per acceptance criterion: the RED test-only commit (sha, failed through
     sandbox_test) followed by the GREEN commit (sha, passed), as
     redgreen_check verified -->

## sandbox_gate result

{{sandbox_gate}}
<!-- passed/failed, plus applicable steps: every declared static check,
     every test service in the contract, any generation drift check and the
     production-image smoke check -->

## Review summary

{{review_summary}}
<!-- findings from code-reviewer (and security-auditor when risk:security):
     each fixed, or answered with "Won't fix, because …" -->

## Flag state

{{flag_state}}
<!-- the flag this slice introduces or keeps: name, default state, what is
     still hidden behind it, and the flag-removal slice if one exists -->

## Deploy notes

- [ ] Any migration is expand/contract safe (or no migration is present).
- [ ] Any new env value has been added to the secrets manager for staging **and** production.
- [ ] Docs are updated.
