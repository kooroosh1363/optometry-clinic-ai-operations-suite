# Security boundaries

Use synthetic data only. This reference API is not approved for production, internet-facing patient workflows, or regulated information. No HIPAA, PIPEDA, certification, or penetration-test claim is made.

Current controls: 256-bit random opaque credentials with SHA-256 hashes, expiry and revocation; active staff/role checks; clinic-scoped SQL; version checks; strict JSON fields and 16 KiB body limit; transactional write audit metadata; loopback Compose port; database not host-published; non-root API container; bounded DB timeouts; generic errors; response security headers; parameterized values; migration checksums; lockfile and CI audit.

Authentication is an operator-provisioned API credential mechanism, not identity proofing or full account management. Default lifetime 8 hours, maximum 24. The trusted CLI displays the secret once; never store it in URLs, commits, screenshots, recordings or browser persistent storage. Requests already holding a shared token/staff lock may finish before a concurrent revocation/deactivation commits; subsequent requests fail.

Not implemented: password login, SSO/MFA, browser session/CSRF design, RLS, rate limiting, read-access audit, credential-management audit, immutable audit storage, production TLS/key management, backup/restore verification, consent history, retention/deletion, external delivery and monitoring. No CORS policy allows cross-origin browser clients. Keep HTTP access on loopback. A local schema-owner API role is not least-privilege production configuration. CI credentials are disposable test values.

Do not commit `.env`, credentials, real patient exports, or sensitive logs. Check staged diffs before publication. The integration suite creates schema objects and rolls back fixtures; run it only against a disposable database. Report vulnerabilities privately to the repository owner without patient data or exploitable credentials.
