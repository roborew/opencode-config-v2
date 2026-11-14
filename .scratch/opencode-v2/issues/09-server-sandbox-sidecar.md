# 09 — opencode-server: box image, sandbox sidecar and the sysbox backend

**What to build:** In opencode-server: a pinned minimal box image (Docker engine and Compose only) and a sidecar implementing the API in blueprint §10, which is the only container mounting the Docker socket. In this repo: the sysbox backend in `oc-sandbox`. Because OpenCode runs in Docker on the server, every slice's test contract runs inside its own Sysbox container and gives the same `sandbox_gate` result as on the Mac.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] The OpenCode container has no Docker socket mounted
- [ ] The sidecar rejects other runtimes, images, privileged flags, mounts outside the worktree root, and any argv off the allow-list
- [ ] Nothing app-specific is installed on the server or in the box image
- [ ] Auth is a bearer token that Robin enters himself
- [ ] An app repo's `sandbox_gate` passes inside a Sysbox container
