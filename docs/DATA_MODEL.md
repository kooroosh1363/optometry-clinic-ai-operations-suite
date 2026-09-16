# Administrative data model

| Table | Key | Purpose |
| --- | --- | --- |
| clinics | id | Clinic name and timezone label |
| staff | clinic_id, id | Administrative role and display name |
| patients | clinic_id, id | Minimal synthetic administrative record and opt-in flag |
| appointments | clinic_id, id | Patient, practitioner, interval, status, version |
| schema_migrations | version | Applied SQL checksum and timestamp |
| access_tokens | id | Token hash, staff/clinic reference, expiry and revocation |
| recalls | clinic_id, id | Patient, due date, manual contact status and version |
| audit_events | id | Actor, entity ID/type, action, resulting version and timestamp |

All identifiers are UUIDs supplied by the caller. Appointment foreign keys include clinic_id. Intervals use `timestamptz` and half-open ranges `[start, end)`, so adjacent bookings are allowed. Ends must be later than starts. Scheduled and checked-in appointments block both practitioner and patient overlap; cancelled, completed and no-show records do not reserve a slot.

Migration 002 adds the three new tables and staff.active (existing staff default to true). Migration 003 adds patient consent_version, consent_events, automation_drafts and mock_delivery_receipts, and expands the audit vocabulary. Migrations 001/002 remain unchanged. The runner applies all three versions in order and rejects checksum changes. Readiness requires exactly 001, 002 and 003.

Drafts snapshot source/consent versions and recipient; unique clinic/request-key and clinic/recall/version/consent-version constraints prevent duplicate creation. Mock receipts have a primary key on clinic/draft. Transactions lock the draft and source while approving/executing and commit the receipt, attempt count and audit together. Consent history records the actor, boolean decision, version and timestamp. These ordinary tables are not immutable compliance records.

Consent defaults to false and cannot be granted through this API; source, time, scope and withdrawal handling must be added before delivery. Email syntax is checked but ownership/deliverability is not. Phase 2 validates supported IANA-style clinic timezone labels and requires an active in-clinic optometrist for bookings. These checks are application rules; trusted direct SQL can bypass them.

No clinical notes, prescriptions, insurance identifiers or payment details are stored. The API locks records and checks the caller's version before state transitions/updates. Successful changes append minimal audit metadata in the same transaction. All business reads/writes use the authenticated clinic. This is application query isolation, not database RLS; the local schema owner can bypass authorization and alter audit rows. Audit data is not tamper-proof. See API.md for exact lifecycle and date/time rules.
