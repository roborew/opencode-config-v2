# 11 — repo-setup: scaffold or upgrade an app repo to the standard layout and test contract

**What to build:** Following blueprint §8–§9: the `repo-setup` skill and `templates/repo/`. Pointed at an app repo (new, or existing such as a Rails or FastAPI project), it compares it with the layout and architecture in `templates/project/TEMPLATE.md`, and with the isolated Compose test contract. It proposes the changes (zones, per-app Dockerfiles with production and test stages, generated client, Compose test contract, PR workflow with `ci-ok`, `docs/spec|decisions|deployment`, per-app `.agents/skills/`, `AGENTS.md` front matter) and applies them after approval. Internals are chosen per stack.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] Every change is shown, and nothing is applied without approval
- [ ] On a non-FastAPI stack, the test contract runs with only Docker installed
- [ ] Branch protection requires `ci-ok`, 1 approval and resolved conversations
- [ ] No issue templates, PR template, `labels.json` or flow skills are written into the app repo
- [ ] On an existing repo (for example Blocshed), it proposes removing `.github/ISSUE_TEMPLATE/*`, `pull_request_template.md` and `labels.yml`, and removes them only after approval. `ci.yml`, `deploy.yml` and `dependabot.yml` are kept.
