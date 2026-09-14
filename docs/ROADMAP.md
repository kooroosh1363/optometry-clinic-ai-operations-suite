# Six-session roadmap

Sessions are milestones, not guaranteed calendar-day durations or credit estimates. Stop at each reviewed PR. No automatic merge.

## Phase 1 — Foundation

Scope contract, real PostgreSQL schema/migrations, health service, container setup, test suite, CI, and continuation notes. No finished UI or AI.

## Phase 2 — Authorized administrative API

Authentication/roles, tenant-scoped reads and writes, validated booking/recall records, practitioner validation, timezone rules, state transitions, optimistic concurrency, and negative authorization tests. Agree on identity-provider boundaries before implementation.

## Phase 3 — Usable operations dashboard

Reception workflow, booking calendar, patient administrative views, recall queue, loading/error/empty states, accessibility checks, and browser end-to-end tests against the real API.

## Phase 4 — Controlled automation and agents

Administrative draft generation, explicit human approval, consent checks, idempotent delivery adapters, failure/retry handling, and audit records. Use mock delivery by default; actual providers require authorization and configuration. No clinical decision automation.

## Phase 5 — Analytics and hardening

Defined no-show/recall metrics, synthetic analytical fixtures, dashboard reporting, security and integration review, concurrency/failure tests, and scoped performance checks. No invented ROI or model performance claims.

## Phase 6 — Release and presentation

End-to-end acceptance, verified setup, demo preview and recording script, honest LinkedIn case study, release limitations, and a visually checked RTL Persian PDF covering architecture, code navigation, and tough technical questions. PDF follows final authorized merge.
