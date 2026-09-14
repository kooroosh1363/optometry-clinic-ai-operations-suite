# Verification strategy

`npm run check` performs JavaScript syntax validation and checks roadmap headings. It is not a linter or a type checker.

`npm test` runs unit/HTTP contract tests using Node's built-in runner: valid/invalid configuration, dependency-independent liveness, readiness success/failure, error sanitization, unavailable business routes, unsupported methods, and headers. HTTP tests use real local sockets with a substituted readiness function, not a real database.

`npm run test:integration` requires TEST_DATABASE_URL for disposable PostgreSQL 16. Foundation tests execute real SQL for migration checksum/rollback and database scheduling/reference constraints. Phase 2 tests additionally use real HTTP sockets and PostgreSQL for token hash/expiry/revocation/deactivation, roles, tenant isolation, validation, scheduling/recalls, upgrade from populated 001, version races, concurrent booking, transactional audit counts and malformed/oversized bodies. Missing database configuration fails instead of skipping. Each API fixture creates two synthetic clinics and deletes only its own records during cleanup.

CI runs both suites, syntax checks, and dependency audit, plus a separate Docker Compose smoke job that starts the stack, checks readiness, stops PostgreSQL, and checks readiness 503 versus liveness 200. Container smoke checks are not included in the Node test count.

Concurrent HTTP tests race overlapping bookings and same-version updates through separate database connections. These are targeted concurrency checks, not load/stress testing. No browser tests, penetration tests, full coverage target or AI evaluations are claimed. Container CI also checks unauthenticated access rejection and synthetic operator provisioning. A green run is evidence for tested behavior, not proof of no bugs. Inspect checks for the latest PR commit before merging.
