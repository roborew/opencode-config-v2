# 0002 — Trunk-based slices

Status: accepted (2026-11-14)

One slice = one issue = one worktree off `origin/main` = one PR to `main`. There are no long-lived feature branches. Incomplete behaviour hides behind flags or branch-by-abstraction, and each flag has a removal slice. Schema changes use expand/contract. At most 3 slices run in parallel, and open slices merge `main` after every merge. Rejected: feature → ticket branch hierarchies, because their sync gates cost time and caused drift.
