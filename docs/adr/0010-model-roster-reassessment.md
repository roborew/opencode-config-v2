# 0010 — Model roster reassessment: GLM 5.3 plans, flash tiers explore and review

Status: accepted (2026-11-16)

## Context

D16 sent `plan` to Claude Opus 5.5 (Zen, $4/$20 per 1M) — the most expensive
line item in the flow, and planning sessions have the longest, most
cache-friendly prefixes of anything we run. All prices below are from the
[Go docs](https://opencode.ai/docs/go/), checked 2026-11-16. Robin is on the
**Go Plus** plan, so the Go monthly usage limits are the Plus ones.

## Decision

| Agent            | Was                                    | Now                                                    | Why                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan             | `opencode/claude-opus-5-5` ($4/$20)    | `opencode-go/glm-5.3` ($1.40/$4.40, $0.26 cached read) | Roughly 70% cheaper per spec. The two Robin approval checkpoints (spec sign-off, slice-breakdown sign-off) contain the quality risk: weak planning costs rework and Robin's attention, not shipped badness. Supersedes the Opus half of D16.                                                              |
| explore, general | `opencode-go/glm-5.3`                  | `opencode-go/glm-5.3-flash` ($0.15/$0.50)              | The highest-volume, lowest-stakes work in the flow — read-only research whose output is re-synthesized by `plan`. ~10x cheaper; also moves its spend onto Flash's own $180 monthly limit.                                                                                                                 |
| code-reviewer    | `opencode-go/minimax-m3` ($0.30/$1.20) | `opencode-go/minimax-m3.1-flash` ($0.15/$0.60)         | Same family as M3, next generation, half the price, faster — it shortens the per-slice review loop. Keeps family diversity against both the builder (DeepSeek) and the planner (GLM). CodeRabbit and CI remain the backstop, so a weaker local review shifts cost into PR rounds rather than into `main`. |
| security-auditor | `opencode-go/qwen3.8-max`              | unchanged                                              | Runs only when risky paths change (auth, secrets, migrations, dependency manifests, infra — D15, spec story 30), so the spend is already small while the stakes are the highest in the flow. This is the one gate that keeps paying for expertise.                                                        |

`build` (DeepSeek V4.1 Flash) and `title` (GPT 6 Luna) were already at the
price floor and are unchanged.

`plan` uses the **Go** provider (`opencode-go/glm-5.3`), not Zen: ADR 0009 only
ever verified `glm-5.3` on Go, and an earlier uncommitted edit had pointed at
`opencode/glm-5.3`, whose existence on Zen was never verified. The provider
lock (D27) is unchanged.

## Consequences

- D16's "planning pays for expertise" no longer means Opus; the expertise
  budget now concentrates on the security gate instead.
- GLM 5.3's Go Plus monthly limit ($120) is now drawn by `plan` alone, since
  explore/general moved to Flash ($180 limit).
- Ticket 12's runbook measurements should record per-agent spend per slice, so
  the flash-tier choices can be re-checked against real data.
- The spec's model-roster references and user stories 2, 3 and 29 were updated
  to match; intent is unchanged.
