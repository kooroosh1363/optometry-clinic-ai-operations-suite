# Foundation data model

| Table | Key | Purpose |
| --- | --- | --- |
| clinics | id | Clinic name and timezone label |
| staff | clinic_id, id | Administrative role and display name |
| patients | clinic_id, id | Minimal synthetic administrative record and opt-in flag |
| appointments | clinic_id, id | Patient, practitioner, interval, status, version |
| schema_migrations | version | Applied SQL checksum and timestamp |

All identifiers are UUIDs supplied by the caller. Appointment foreign keys include clinic_id. Intervals use `timestamptz` and half-open ranges `[start, end)`, so adjacent bookings are allowed. Ends must be later than starts. Scheduled and checked-in appointments block both practitioner and patient overlap; cancelled, completed and no-show records do not reserve a slot.

Messaging consent defaults to false. A boolean alone is not a complete consent audit: source, time, scope, and withdrawal handling must be added before messaging. Contact email is optional and is not yet validated for delivery. Timezone labels are not yet validated against IANA names. Staff role membership does not yet ensure a booking references an optometrist. These are explicit future API validation gates.

No clinical notes, prescriptions, insurance identifiers, or payment details are stored. Version is positive but optimistic concurrency is not implemented until the write API exists. Allowed status values are constrained; transition rules are not yet implemented. Tenant-safe references are not row-level security or tenant-scoped read authorization.
