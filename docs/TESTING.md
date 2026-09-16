# Verification strategy

`npm run check` performs JavaScript syntax validation and checks roadmap headings. It is not a linter or a type checker.

`npm test` runs unit/HTTP contract tests using Node's built-in runner: valid/invalid configuration, dependency-independent liveness, readiness success/failure, error sanitization, unavailable business routes, unsupported methods, and headers. HTTP tests use real local sockets with a substituted readiness function, not a real database.

`npm run test:integration` requires TEST_DATABASE_URL for disposable PostgreSQL 16. Foundation tests execute real SQL for migration checksum/rollback and database scheduling/reference constraints. Phase 2 tests additionally use real HTTP sockets and PostgreSQL for token hash/expiry/revocation/deactivation, roles, tenant isolation, validation, scheduling/recalls, upgrade from populated 001, version races, concurrent booking, transactional audit counts and malformed/oversized bodies. Missing database configuration fails instead of skipping. Each API fixture creates two synthetic clinics and deletes only its own records during cleanup.

CI runs both suites, syntax checks, and dependency audit, plus a separate Docker Compose smoke job that starts the stack, checks readiness, stops PostgreSQL, and checks readiness 503 versus liveness 200. Container smoke checks are not included in the Node test count.

Concurrent HTTP tests race overlapping bookings and same-version updates through separate database connections. These are targeted concurrency checks, not load/stress testing.

`npm run test:e2e` uses Chromium against the real Node service and disposable PostgreSQL. It covers receptionist creation/transition flows, real API rendering, read-only role behavior, invalid credential, sign-out and absence of persistent token storage, serious/critical automated accessibility findings, and navigation at a 390-pixel viewport. Automated accessibility scanning and keyboard-focused implementation do not replace assistive-technology user testing. Visual review covers the connection screen and populated dashboard at desktop/mobile widths.

No cross-browser matrix, visual-regression baseline, load test, penetration test, full coverage target or AI evaluation is claimed. Container CI also checks dashboard assets, API rejection, operator provisioning and dependency outage behavior. A green run is evidence for tested behavior, not proof of no bugs. Inspect checks for the latest PR commit before merging.
