# Reference release acceptance

Phase 6 packages the six-phase portfolio reference. It is not a production deployment or a real customer delivery. Northstar is a fictional demo label. The repository name includes AI; the implemented generator is a fixed template, not an LLM or autonomous agent.

## Delivered surface

| Layer | Implemented | Boundary |
| --- | --- | --- |
| Dashboard | Patient creation, appointments/statuses, recalls, consent, approval, mock execution, reports | First 100 records per operational collection; no UI pagination or rescheduling editor |
| API | Clinic-scoped reads/writes, roles, rescheduling, version checks, audit metadata | Operator-issued bearer tokens; no production identity service |
| Database | PostgreSQL constraints, 3 checksum-verified migrations, transactions | Shared development DB owner; no DB row-level security or tamper-proof audit |
| Automation | Immutable template, consent/source checks, approval/rejection, bounded mock retries | Database receipt only; no email/SMS, LLM, background worker or external integrations |
| Analytics | Clinic-local cohorts, daily counts, explicit null denominators | Descriptive current statuses, not historical snapshots, predictions or causal ROI |
| Packaging | Docker Compose, CI, reproducible walkthrough, recording guide, technical review guide | Local reference; no public hosting, backups/restore drill, monitoring or clinical certification |

## Acceptance gates

- Latest PR head must pass syntax, unit/HTTP, PostgreSQL integration, Chromium and container jobs.
- Release walkthrough must create its patient, consent, appointment and recall through the real UI/API, require approval before simulation, find exactly one persisted receipt, and report the same appointment/recall.
- Read-only, tenant isolation, conflicts, retries, consent invalidation, DST reports and late-response regressions remain covered in earlier suites.
- Five synthetic screenshots are produced by the walkthrough. Artifact generation is not itself manual visual approval.
- Setup is checked by the Compose CI job; manual operating instructions are in DEMO_GUIDE.md.
- No schema migration or new paid dependency in this phase.
- Owner approves the PR before merge. No automatic release tag or deployment.
- The final Persian RTL manual follows authorized final merge. Render and visually inspect the PDF, record the final commit, and explain all limitations. Do not call the PDF delivered while this gate is pending.

## Remaining limitations

Do not use patient data or expose this demo to the public internet. Production use needs its own identity, HTTPS, least-privilege DB credentials, authorization review, retention/consent policy, operational recovery and security review. These are missing engineering capabilities, not certifications supplied by this repo.

Booking uses explicit-offset ISO strings; operators must choose the correct date-specific offset. The UI lacks pagination, patient editing, deletion, search and a complete appointment management calendar. Refresh clears credentials. Aborting a request or closing a form cannot roll back a server mutation already committed. General create endpoints lack idempotency keys; a lost response needs record inspection before retry. Automation request keys and receipt uniqueness cover their documented database scope only.

A single user may author and approve a draft. There is no independent approver policy. A database administrator can alter audit records. Consent is a synthetic application flag, not legal consent collection. Mock retries are explicit and capped at three attempts; no provider failure recovery or exactly-once external delivery is claimed.

Testing covers Chromium and automated accessibility checks, not all browsers, assistive technology users, penetration tests, production load or zero defects. Dependency audit covers the installed production dependency set at run time only.

## Evidence location

Use the Phase 6 PR description for the exact head and CI run. Download the successful run's `synthetic-demo-preview` artifact (14-day retention), or rerun the browser suite locally to regenerate it. CI artifacts are review aids, not a permanently hosted app. The final handoff must distinguish automated verification, actual image inspection and any unavailable live preview.

