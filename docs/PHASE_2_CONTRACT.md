# Phase 2 implementation contract

Build the administrative API only. Use synthetic records; no UI, clinical reasoning, delivery integration, or production deployment in this milestone.

## Identity decision

Use operator-provisioned opaque bearer credentials for this local reference API. Generate 256 random bits; store only SHA-256 hashes, expiry and revocation state. Default lifetime is 8 hours, maximum 24 hours. Credentials are issued/revoked through a trusted operator CLI, never through an unauthenticated HTTP endpoint. No paid identity service is required. This is not password login, SSO, MFA, identity proofing or account recovery; browser session design must be addressed in Phase 3 before adding login screens. Never put tokens in URLs or persistent browser storage.

## Access contract

Derive clinic and role from the authenticated staff record, never caller headers or body. All three staff roles may read administrative records in their clinic. Administrator and receptionist may create patients, appointments and recalls, reschedule appointments and perform documented status transitions. Optometrist is read-only in this administrative API. Account/clinic creation and role management are operator tasks, not HTTP routes in this phase.

## Acceptance gates

- Missing, malformed, expired, revoked and disabled-staff credentials fail closed.
- Cross-clinic reads return no foreign rows; foreign record detail/update returns 404; foreign booking references fail without revealing record existence.
- Unknown JSON fields, malformed IDs/timestamps, excessive request sizes, invalid statuses and invalid timezone configuration are rejected.
- Appointment overlap constraints survive concurrent requests. Updates require the current positive version; racing updates allow at most one success.
- Rescheduling applies only to scheduled bookings; lifecycle transitions are explicit and terminal records cannot reopen.
- Recall updates are tenant scoped and version checked. No messages are sent.
- Successful writes and audit metadata commit together; rejected writes leave no audit event.
- Migration 001 stays byte-for-byte unchanged. Version 002 upgrades the foundation and is repeatable.
- Real PostgreSQL HTTP integration tests and existing checks pass before review. Open a PR; do not merge without the owner's instruction.
