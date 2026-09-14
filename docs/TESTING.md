# Verification strategy

`npm run check` performs JavaScript syntax validation and checks roadmap headings. It is not a linter or a type checker.

`npm test` runs unit/HTTP contract tests using Node's built-in runner: valid/invalid configuration, dependency-independent liveness, readiness success/failure, error sanitization, unavailable business routes, unsupported methods, and headers. HTTP tests use real local sockets with a substituted readiness function, not a real database.

`npm run test:integration` requires TEST_DATABASE_URL for a disposable PostgreSQL 16 database. It executes real SQL: migration repeatability/checksum rejection, failed-migration rollback, valid inserts, consent default, cross-clinic references, invalid intervals/status, practitioner/patient overlaps, adjacent slots, cancelled slot reuse, checked-in blocking, and timezone-equivalent conflicts. It fails rather than silently skipping when the database is missing.

CI runs both suites, syntax checks, and dependency audit, plus a separate Docker Compose smoke job that starts the stack, checks readiness, stops PostgreSQL, and checks readiness 503 versus liveness 200. Container smoke checks are not included in the Node test count.

No browser tests, load tests, security penetration tests, full coverage target, AI evaluations, or multi-connection race tests are claimed in this phase. Add tests with the features they protect. A green run is evidence for tested behavior, not proof of no bugs. Inspect PR checks for the latest commit before merging.
