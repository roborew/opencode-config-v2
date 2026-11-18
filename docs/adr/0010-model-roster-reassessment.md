# 0010 — Model roster reassessment: Kimi K3.1 Pro plans, flash tiers explore and review

Status: accepted (2026-11-16)

## Context

D16 sent `plan` to Claude Opus 5.5 (Zen, $4/$20 per 1M) — the most expensive
line item in the flow, and planning sessions have the longest, most
cache-friendly prefixes of anything we run. All prices below are from the
[Go docs](https://opencode.ai/docs/go/), checked 2026-11-16. Robin is on the
**Go Plus** plan, so the Go monthly usage limits are the Plus ones.

## Decision

| Agent            | Was                                    | Now                                                     | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------- | -------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| plan             | `opencode/claude-opus-5-5` ($4/$20)    | `opencode-go/kimi-k3.1-pro` ($2/$10, $0.20 cached read) | Half Opus's price per token, chosen over GLM 5.3 ($1.40/$4.40, the same-day intermediate choice, replaced before commit) on Robin's research into planning performance, since corroborated by independent benchmarks (Artificial Analysis Intelligence Index v5.0.1, checked 2026-11-16): Kimi K3.1 Pro scores 46 — #1 in its open-weights class — vs GLM-5.3 at 32 (max effort) and Opus 5.5 at 48–59 by effort tier (59 at its default max). That closes roughly half the GLM→Opus gap and beats Opus's lower effort tiers. Caveats: a general composite, not a spec-writing benchmark, and Kimi is slower per turn (159 s to first answer token, 30 tok/s at its own API, vs GLM 59 s / 87 tok/s) — though still ahead of Opus at max effort (380 s). The two Robin approval checkpoints (spec sign-off, slice-breakdown sign-off) contain the quality risk: weak planning costs rework and Robin's attention, not shipped badness. Supersedes the Opus half of D16. Zero data retention, no training, 1M context and 1M output on Go. |
| explore, general | `opencode-go/glm-5.3`                  | `opencode-go/glm-5.3-flash` ($0.15/$0.50)               | The highest-volume, lowest-stakes work in the flow — read-only research whose output is re-synthesized by `plan`. ~10x cheaper; also moves its spend onto Flash's own $180 monthly limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| code-reviewer    | `opencode-go/minimax-m3` ($0.30/$1.20) | `opencode-go/minimax-m3.1-flash` ($0.15/$0.60)          | Same family as M3, next generation, half the price, faster — it shortens the per-slice review loop. Keeps family diversity against both the builder (DeepSeek) and the planner (Kimi). Automated PR review and CI remain the backstop, so a weaker local review shifts cost into PR rounds rather than into `main`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| security-auditor | `opencode-go/qwen3.8-max`              | unchanged                                               | Runs only when risky paths change (auth, secrets, migrations, dependency manifests, infra — D15, spec story 30), so the spend is already small while the stakes are the highest in the flow. This is the one gate that keeps paying for expertise.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |

`build` stays on DeepSeek V4.1 Flash deliberately; `title` (GPT 6 Luna) was
already at the price floor. The builder is the highest-volume role in the
flow — every slice session plus the PR-monitor fix rounds — and the design
front-loads the thinking into planning: D23 keeps a single agent running
RED → GREEN itself with no coding sub-agents (its only subagents are the
read-only reviewers and `explore`), and review is a separate model family.
Swapping the builder to Kimi K3.1 Pro ($2/$10 vs $0.15/$0.60 off-peak) would
multiply the largest token line item by an order of magnitude for execution
work whose thinking was already paid for, and its $60 monthly limit would
bind with three slices running in parallel. If ticket 12 shows slices
stalling (BLOCKED rates, long review round-trips), DeepSeek V4 Pro or
Kimi K2.7 Code are the middle steps — decided on data, not upfront.

`plan` uses the **Go** provider (`opencode-go/kimi-k3.1-pro`): the model ID
is verified on Go (endpoint table, checked 2026-11-16), and Zen was never
verified for any of the models considered here. The provider lock (D27) is
unchanged.

## Consequences

- D16's "planning pays for expertise" no longer means Opus; the expertise
  budget now concentrates on the security gate instead.
- Kimi K3.1 Pro's Go Plus monthly limit is $60, drawn by `plan` alone — ample
  for planning-only volume. Its $2/1M cached-write charge (GLM has none) is
  worth watching on long, evolving interview contexts.
- Kimi K3.1 Pro's per-turn latency (159 s to first answer token at its own
  API vs GLM-5.3's 59 s) will be felt in interactive `/spec` interviews; the
  Go endpoint's real-world latency should be measured in ticket 12 before
  the planner choice is reconsidered.
- The code-reviewer alternative of Kimi K2.7 Code now shares a family with
  the planner; prefer keeping MiniMax M3.1 Flash as the reviewer.
- Ticket 12's runbook measurements should record per-agent spend per slice
  and BLOCKED rates, so both the planner swap and the flash-tier choices can
  be re-checked against real data.
- The spec's model-roster references and user stories 2, 3 and 29 were
  updated to match; intent is unchanged.
