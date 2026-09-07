# Working-tree review, 2026-09-06

Baseline: c89ca8ac022470c4619566e7892656bdebdbcd51. No new commits.
Scope: tracked diff plus new core skills, desktop IPC/UI and tests. Original unrelated lockfile
additions remain user-owned. Spec: the approved first cut in spec.md.

## Standards

The reviewer checked CLAUDE.md, DESIGN.md, CONTEXT.md, the domain reference and ADR-0003,
plus the code-review skill's Fowler heuristics. Four actionable findings were corrected:
Claude projection moved from the neutral catalogue into its adapter; the www.skills.sh
hostname is normalized; pending copy uses the design system's punctuation; and returning
from the editor refreshes both metadata and selected file content. The final inspection
reported no additional findings. Provider dispatch remains at the existing composition root.

## Spec

The reviewer identified incomplete preview inspection, lost provenance on restore, incomplete
imports without a draft route, and publication before process exit was confirmed. All were
corrected and covered. A follow-up caught the risk of signalling a reused process group on
repeated close; completed cleanup is now cached, while failed cleanup remains retryable.
The final Spec review reported no pending findings.

Final finding counts: Standards 0 pending; Spec 0 pending. Broader guest/platform acceptance
limits are recorded separately in build.md rather than presented as passed tests.
