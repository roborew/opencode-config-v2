# 0004 — Tests run fully isolated in Docker; the Project Template sets layout only

Status: accepted (2026-11-14)

Tests always run in a fully isolated Docker setup, built only from the repo's own Dockerfiles and the repo's single `compose.yml`. They assume nothing from the machine running OpenCode: no toolchains, env or services. On the Ubuntu server, OpenCode itself runs in Docker, so each slice gets its own Sysbox container with an inner Docker engine. On the Mac, Docker Compose runs directly with a per-slice project, isolated from the Mac. GitHub Actions runs the same contract as the PR gate, and deploys each app's image separately.

The Project Template (`templates/project/TEMPLATE.md`) provides **repository-shape and architecture guidance** for both single-app and multi-app repos. It does not require a monorepo or any particular stack, and its testing section doesn't govern the flow. (Generalised 2026-11-16.)

Each repo has exactly one `compose.yml`, which holds everything needed for testing (applicable test databases and other services included). Compose is used only for development and testing, never in production: GitHub Actions packages and deploys each app's image separately.
