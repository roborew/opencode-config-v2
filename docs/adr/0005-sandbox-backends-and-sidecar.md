# 0005 — Sandbox backends and the socket sidecar

Status: accepted (2026-11-14)

`oc-sandbox` picks a backend: the sidecar is reachable → sysbox (a Sysbox container per slice, with the Compose test contract inside); otherwise local Docker → docker (`docker compose -p <slice>`); otherwise BLOCKED. `OC_SANDBOX_BACKEND` overrides this. On the server, only the sidecar mounts the Docker socket, because mounting it into the OpenCode container would give root-equivalent host access to any agent shell. The sidecar's API is fixed (blueprint §10). Sysbox suits trusted code on Robin's own server, but it isn't a multi-tenant boundary.
