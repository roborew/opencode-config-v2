# 00 — Bootstrap the empty repo

**What to build:** A new private repo `roborew/opencode-config-v2`, created from `git init` on `main`, holding: the plan pack (`docs/plan/`, `docs/CONTEXT.md`, `docs/adr/`, these tickets), Robin's Project Template verbatim at `templates/project/TEMPLATE.md`, README, LICENSE, `.gitignore`, LF line-ending settings, an `AGENTS.md` explaining how agents work on this repo, `package.json` for plugin development, and a first CI workflow (gitleaks, zizmor, line endings, pinned action SHAs). Nothing is copied from any other config repo.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [ ] The repo exists, private, with one initial commit containing only the files listed above
- [ ] `main` is protected: CI required, no force push
- [ ] CI passes on the initial commit
- [ ] The README explains what the repo is (the user-level OpenCode config directory) and that `templates/project/TEMPLATE.md` is the example monorepo layout and architecture for app repos
