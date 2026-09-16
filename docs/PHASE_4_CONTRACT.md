# Phase 4 — Controlled recall automation

Scope: synthetic administrative recall drafts only. A deterministic template generator is used, not an LLM or autonomous clinical agent. No paid provider, external network delivery, diagnosis, prescription, or insurance decision.

## Authority and states

- Administrators record synthetic messaging consent with optimistic consent versions and history. Receptionists cannot grant consent. This demonstrates a control, not legal consent evidence.
- Administrators/receptionists generate immutable drafts from pending recalls. Generation never authorizes delivery. Optometrists are read-only.
- Draft -> approved or rejected; approved -> simulated or failed; failed -> simulated or failed on explicit retry. Rejection and simulated receipt are terminal. Maximum three attempts. Every action is versioned and audited.
- Approval is explicit but need not come from a different employee in this reference. No automatic approval, scheduling or retries.
- Approval and execution lock and recheck patient consent/version, contact address, recall version/status and source identity. Revocation followed by regrant does not revive an old draft. Changed sources require a new draft.
- Draft request UUID is unique per clinic; replay with a different recall is a conflict. One draft exists per recall version and consent version, including after rejection. Change the source deliberately to start a new revision; no silent redrafting of rejected content.
- One database mock receipt per draft. Receipt, status and audit commit together. Repeated/concurrent execute requests return the existing receipt without another attempt. No exactly-once guarantee is claimed for real external providers.
- Failure simulation is injected into the server-side mock in tests only; it is not an API option. A failed attempt commits sanitized failure metadata and is retryable up to the attempt limit. Unexpected infrastructure errors roll back.

## Presentation and gates

Dashboard: administrator consent toggle with explicit confirmation; pending recall draft action; automation inbox showing exact immutable content, status, attempts, approval/rejection and simulated execution/retry. Synthetic-only and no-real-message labels remain visible. Collections retain the first-100 limitation.

Acceptance: real PostgreSQL tests for consent, roles/tenant boundaries, stale approval/source, duplicate requests, concurrent execution, retry exhaustion and audit rollback; browser workflow for consent -> draft -> approval -> simulation. Existing tests and Docker smoke checks must still pass. Merge only after owner instruction.

External providers, actual consent collection, model integration, background workers, message editing, delivery analytics, and production credentials remain outside this phase.
