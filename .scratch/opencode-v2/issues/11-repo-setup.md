# 11 — repo-setup: scaffold or upgrade an app repo to the standard layout and test contract

**What to build:** Following blueprint §8–§9: the `repo-setup` skill and `templates/repo/`. Pointed at an app repo (new, or existing such as a Rails or FastAPI project), it compares it with the layout and architecture in `templates/project/TEMPLATE.md`, and with the isolated Compose test contract. It proposes the changes (zones, per-app Dockerfiles with production and test stages, generated client, Compose test contract, PR workflow with `ci-ok`, `docs/spec|decisions|deployment`, per-app `.agents/skills/`, flow additions) and applies them after approval. Internals are chosen per stack.

**Blocked by:** 03

**Status:** ready-for-agent

- [ ] Every change is shown, and nothing is applied without approval
- [ ] On a non-FastAPI stack, the test contract runs with only Docker installed
- [ ] Branch protection requires `ci-ok`, 1 approval and resolved conversations
- [ ] Every label from `labels.json` exists afterwards, with one `area:<app>` per app
