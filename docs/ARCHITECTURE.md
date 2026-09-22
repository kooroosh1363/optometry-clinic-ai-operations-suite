# Architecture decisions

## ADR 010: Snapshot reports and browser session isolation

`src/analytics.js` validates a bounded date range and executes one parameterized PostgreSQL statement. Clinic-local midnights form half-open instant bounds; calendar-day series avoid fixed 24-hour assumptions on DST days. Independent aggregates prevent appointment/recall/draft joins multiplying counts. Current-status cohort reporting is descriptive, not event-time history. Existing appointment/recall indexes support range access; this phase makes no schema change. Larger automation cohorts may require another measured index or reporting store later.

The browser cancels outstanding requests on sign-out and also checks a session epoch before consuming results. Logout clears rendered records and forms. Latest-load sequence numbers protect overlapping collection/report refreshes. Aborting a request does not undo an already committed mutation. Booking inputs use explicit offsets; the operator must choose the correct offset for the booking date. Phase 3 device-local conversion is superseded.

## ADR 009: Controlled recall automation with a transactional mock

`src/automation.js` owns consent, immutable template drafts, approval, source revalidation and execution. `src/api.js` supplies the authenticated actor and transaction. Migration 003 preserves 001/002 and adds consent history, drafts and receipts. Request-key advisory locks serialize retries; source-version uniqueness prevents different keys from creating duplicate drafts. Draft row locks serialize approval/execution. Recall/patient shared locks order execution against updates and consent revocation.

The generator is a fixed administrative template, not an LLM. No arbitrary prompt, clinical content or model authority enters the workflow. The mock adapter writes a unique receipt inside the same transaction as state/audit. A savepoint removes partial writes on a recognized adapter failure; unexpected errors roll back everything. This is not a network-provider interface: real delivery needs an outbox, provider keys and reconciliation. Separate author/approver, legal consent collection and production readiness are not claimed.

## ADR 001: Small modular monolith

Use Node.js 24 with its HTTP and test libraries and the PostgreSQL driver. Configuration, HTTP routing, database access, and migrations have separate modules. This keeps the foundation inspectable; a larger API framework can be evaluated when authenticated business routes arrive. No UI framework decision is implied here.

`src/server.js` owns startup/shutdown. `src/app.js` owns headers/health and dispatches business requests to `src/api.js`. `src/auth.js` verifies/creates credentials, `src/validation.js` validates inputs, and `src/operator.js` provisions synthetic clinics and credentials. `src/db.js` owns connections/readiness; `src/migrate.js` owns migrations.

## ADR 002: PostgreSQL enforces core integrity

Composite references prevent foreign-clinic appointment references. Exclusion constraints prevent active overlaps without relying on read-then-write availability checks. Phase 2 adds application authorization, practitioner validation, timezone checks and lifecycle rules. Trusted direct SQL can bypass the application rules.

## ADR 003: Controlled, transactional migrations

Migrations are checksum tracked and serialized with transaction-level advisory locks. Schema work and version recording commit together for each version. Applied migrations must never be edited. The runner supports 001 through 003 in order, before API startup.

## ADR 004: Health is not authorization

Liveness is independent of PostgreSQL; readiness requires versions 001 through 003. Business routes under /v1 require authentication and clinic scope. Database reference constraints do not prevent unauthorized reads; tests verify application query isolation separately.

## ADR 005: AI assists administration only

Future agents may prepare administrative drafts with human approval before external effects. They will not diagnose, prescribe or decide clinical urgency. No model provider is invoked in Phases 1/2; no AI accuracy or financial improvement is claimed.

## ADR 006: Operator-issued reference credentials

Use random, hashed-at-rest bearer tokens with bounded expiry and revocation to avoid paid services and password/account recovery complexity for the API demonstration. This is not a full staff login system. Trusted operators use a CLI; Phase 3 must design browser credential handling explicitly. No automatic password/SSO migration is assumed.

## ADR 007: Transactional authorization and updates

Authenticated requests use database transactions. Shared token/staff locks keep authorization stable during a request; revocation takes effect after preceding authorized requests finish. Update routes lock their tenant-scoped record, check the supplied version and lifecycle rules, then update and append audit metadata atomically. Overlap violations map to HTTP 409. Deadlock/serialization failures return retry_request; clients must read current state before deciding to retry. Business mutations are not automatically retried.

## ADR 008: Same-origin framework-free dashboard

Serve small HTML, CSS, JavaScript and SVG assets from the API process. The dashboard has no runtime CDN, analytics, build step or third-party browser dependency. This keeps the demonstration reproducible and removes cross-origin credential handling. The server uses an explicit file map rather than arbitrary filesystem paths. Browser text from API records is assigned through DOM text properties.

The operator credential exists only in module memory. Refresh and sign-out clear it. This deliberately trades persistence for a smaller demonstration attack surface. A production identity/browser session design remains separate work. The dashboard reads up to 100 records per collection because the Phase 2 API has bounded offset pagination but no filters/cursors; larger-clinic navigation remains a documented product gap.
