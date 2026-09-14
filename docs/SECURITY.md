# Security boundaries

Use synthetic data only. This foundation is not approved for production, internet-facing patient workflows, or regulated information. No HIPAA, PIPEDA, certification, or penetration-test claim is made.

Current controls: no business data endpoints; host-loopback port binding in Compose; database not host-published; non-root API container; bounded database timeouts; generic readiness errors; basic response security headers; SQL parameters for values; versioned transactional migrations; dependency lockfile and CI audit.

Not implemented: authentication, authorization, row-level security, rate limiting, business audit events, encryption/key management policy, backup/restore verification, consent history, retention/deletion workflows, external message authorization, and monitoring. These must be assessed before real use. A local schema owner is not an acceptable least-privilege production API role. PostgreSQL service credentials in CI are disposable test values, not production secrets.

Do not commit `.env`, credentials, real patient exports, or sensitive logs. Check staged diffs before publication. The integration suite creates schema objects and rolls back fixtures; run it only against a disposable database. Report vulnerabilities privately to the repository owner without patient data or exploitable credentials.
