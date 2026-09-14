# Phase 1 scope and acceptance

Business scenario: an independent optometry clinic needs administrative appointment management, recall follow-up, and operational reporting. This is a simulated client brief, not a claim of paid work.

This phase establishes the storage and execution foundation only. It includes configuration validation, liveness/readiness endpoints, PostgreSQL migrations, tenant-consistent references, scheduling exclusion constraints, automated tests, and reproducible local containers.

Acceptance gates:

1. Clean dependency installation and JavaScript syntax checks succeed.
2. Health endpoints return stable JSON; database failure causes readiness 503 without leaking error details.
3. PostgreSQL tests prove migration idempotency, checksum protection, rollback, reference integrity, and scheduling constraints.
4. Compose starts from an empty development database and its outage smoke test passes in CI.
5. Documentation distinguishes implemented features from planned capabilities.
6. Changes are submitted through a PR; no merge without explicit owner authorization.

Excluded: clinical diagnosis, triage, prescriptions, insurance adjudication, payments, actual messages, real patient data, a finished dashboard, and autonomous business actions. Later phases require their own acceptance criteria. Passing tests does not establish zero defects or regulatory compliance.
