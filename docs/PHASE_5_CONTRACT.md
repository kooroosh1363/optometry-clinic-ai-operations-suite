# Phase 5 — Analytics and hardening

## Metric contract

GET /v1/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD is available to authenticated clinic staff. Both inclusive clinic-local dates are required, within 2000..2099, with at most 366 calendar days. PostgreSQL converts each local midnight to an instant using the authenticated clinic timezone; the upper bound is next-day midnight, exclusive. A report is one SQL statement and one database snapshot. It never uses dashboard list pagination and returns no patient identity or contact data.

Appointments belong to the cohort by starts_at. Counts describe current statuses, not historical status at the selected period end. No-show rate = ended no_show / (ended completed + ended no_show), evaluated at report time. Zero denominator returns null (displayed as N/A). Cancelled, scheduled, checked-in and future-ending appointments do not enter this denominator. Daily counts use the same clinic timezone and fill empty dates. No inference of no-show from an overdue scheduled booking.

Recalls belong by due_date. Show pending, contacted and closed separately. Closure rate = closed / all recalls in the cohort, null for an empty cohort. Overdue open = pending/contacted with due_date before the clinic-local report date. A closed recall does not prove contact, attendance or revenue.

Automation drafts belong by created_at; report current draft/approved/rejected/failed/simulated counts and accumulated attempts. Simulated means a database mock receipt, never external delivery or patient response. No ROI, predictive/model performance or causal improvement claim.

## Hardening scope

Session epoch plus request cancellation prevents late responses/errors/mutations from updating a signed-out or newly connected workspace. Logout clears rendered record/form/report data and credentials. Overlapping loads use latest-request wins. Existing list limit remains 100 per collection and is explicitly labelled; analytical totals are independent of it.

Booking inputs require an explicit ISO offset instead of ambiguous device-local wall time. Clinic timezone is a display/report boundary, not an inferred input offset. No new identity provider, paid service, LLM, real patient data or external delivery.

## Acceptance

Verify mixed/empty cohorts, zero denominator, timezone/DST boundaries, date validation, all-clinic role access, tenant isolation, more than 100 records, dependency failure, SQL snapshot consistency and bounded synthetic performance. Browser tests verify reports and sign-out during delayed requests; existing approval/concurrency tests remain gates. Security review records residual gaps. Phase 6 and merge require separate owner requests.
