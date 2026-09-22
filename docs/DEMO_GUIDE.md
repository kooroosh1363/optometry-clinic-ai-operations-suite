# Local demo and recording guide

Use synthetic data only. This guide uses a historical fixture to make an ended-appointment report reproducible; it is not actual clinic performance.

## Setup and private sign-in

1. Install Docker with Compose v2. From the repository root copy `.env.example` to `.env`, then run `docker compose up --build --wait`.
2. Check `curl --fail http://127.0.0.1:4000/health/ready`.
3. Run `docker compose exec -T api node src/operator.js demo America/Vancouver`. Save the returned clinic and administrator IDs privately.
4. Run `docker compose exec -T api node src/operator.js issue CLINIC_ID ADMINISTRATOR_ID`, replacing both placeholders. The output includes the secret credential and a non-secret token ID; do not record the terminal.
5. Open http://127.0.0.1:4000/dashboard, paste the credential and connect. Begin screen recording only after sign-in. Close terminals/devtools and use a clean browser profile.
6. Each demo provisioning creates a new clinic rather than resetting old data. Its original Synthetic Patient has no contact email; create the patient below for automation.

## Reproduce the acceptance walkthrough

| Step | Action | Expected result |
| --- | --- | --- |
| 1 | Patients → Add patient: Avery Synthetic; avery@example.invalid | New administrative card |
| 2 | Record demo consent on Avery's card, confirm | Messaging consent recorded |
| 3 | Appointments → Book appointment: Avery, Demo Optometrist; start 2020-01-02T10:00:00-08:00, end 2020-01-02T10:30:00-08:00 | One scheduled booking |
| 4 | Change status to checked in, then completed | Completed historical fixture |
| 5 | Recall queue → Add recall: Avery, due 2020-01-03 | Pending follow-up |
| 6 | Generate draft; open Automation | Exact template/recipient visible; no execute control yet |
| 7 | Approve exact draft, confirm, then Simulate delivery | Mock receipt recorded; no real message sent |
| 8 | Reports: 2020-01-02 through 2020-01-03 | 0 of 1 ended completed/no-show bookings; 0 of 1 due recalls closed |
| 9 | Reports: today's clinic-local date through the same date | One simulated delivery for this newly created draft, assuming no other drafts in this fresh clinic |
| 10 | Sign out | Rendered records and in-memory credential cleared |

The historical report shows zero automation drafts because their creation date is today. Appointment, recall and automation cohorts use different date fields. Explain this instead of changing timestamps to make a nicer figure.

After recording, revoke the credential with `docker compose exec -T api node src/operator.js revoke TOKEN_ID`. Stop with `docker compose down`; data persists. `docker compose down --volumes` deletes this Compose project's database volume: use only if you intentionally want to destroy disposable data.

## 90–120 second recording script

| Time | Show | Narration |
| --- | --- | --- |
| 0–15 s | Connected dashboard | “This is a synthetic optometry operations reference I built, using a fictional clinic.” |
| 15–35 s | Patient, completed booking and pending recall | “Administrative records share one clinic-scoped PostgreSQL backend.” |
| 35–65 s | Draft, approval, simulated receipt | “A fixed template creates this draft. A person reviews it. Execution rechecks consent and source versions. This receipt is a database simulation; no message was sent.” |
| 65–90 s | Historical report, then today's report | “Each metric states its denominator and date cohort. Closing a recall does not prove attendance, and simulation is not delivery.” |
| 90–120 s | Repo README and architecture | “The repo includes UI, API, migrations, automation, reports and tests. Production identity and real provider integration remain future work.” |

Never include tokens, HTTP authorization headers or terminal output with credentials. Do not describe this as a paid client engagement, deployed clinic system, measured no-show reduction, AI model evaluation or autonomous agent.

## Automated preview

With Node 24, dependencies installed and an isolated disposable PostgreSQL 16 database:

```sh
npx playwright install chromium
TEST_DATABASE_URL='postgres://USER:PASSWORD@localhost:5432/DISPOSABLE_TEST_DB' npm run test:e2e -- --grep 'release walkthrough'
```

This starts its own real API on port 4173, uses fresh synthetic fixtures and removes its clinic records afterward. Stop any other process on that port first. Five screenshots appear under `test-results/demo-preview/`: appointments, human review, mock receipt, desktop reports and mobile reports. It is an acceptance test, not a long-lived preview server or recorded video. For interactive recording use Compose above.

## Troubleshooting

- Unhealthy startup: inspect `docker compose ps` and `docker compose logs migrate api db`; keep credentials private.
- 401: check the token's expiry/revocation, issue a replacement if needed.
- Draft rejected: verify Avery has email, current consent and a pending recall. Changing consent/recall revisions invalidates old drafts.
- 409 booking conflict: select a non-overlapping slot or use a newly provisioned clinic.
- Empty reports: verify the cohort date field; N/A is expected for an empty denominator.
- Do not bypass failing checks to record a successful-looking demo.

