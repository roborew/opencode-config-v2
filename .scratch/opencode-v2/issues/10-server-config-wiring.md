# 10 — opencode-server: clone opencode-config-v2 and clean up

**What to build:** In opencode-server, following blueprint §11: the image clones `opencode-config-v2` at `CONFIG_REF`, the overrides are in the 2.x shape and keep the gitdir rewrite, delete guard and localhost rewrite plugins, the CodeRabbit CLI and preview/tunnel settings are removed, and the `OC_SANDBOX_*` variables are wired up.

**Blocked by:** 02, 09

**Status:** ready-for-agent

- [ ] The server starts healthy on 2.3.0 with the merged config
- [ ] A slice worktree created on the server opens in a Git client on the host
- [ ] The delete guard still protects the main checkout
- [ ] No CodeRabbit CLI or preview/tunnel variables remain
