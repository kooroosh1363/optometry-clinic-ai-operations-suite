# Optometry Clinic AI Operations Suite

Human-controlled optometry operations reference project, built in six reviewable phases.

**Status: Phase 6 reference-release review. Not a deployed clinic product, medical device, or real client engagement. Use synthetic data only.**

Start with the [demo and recording guide](docs/DEMO_GUIDE.md), [release scope and limitations](docs/RELEASE.md), [technical review Q&A](docs/TECHNICAL_REVIEW_GUIDE.md), and [honest LinkedIn case study](docs/LINKEDIN_CASE_STUDY.md). CI generates five synthetic dashboard screenshots in the `synthetic-demo-preview` artifact. This is not a hosted application. The final Persian manual follows the owner's final authorized merge.

The repository name includes AI, but the current implementation uses fixed-template automation, not an LLM agent. No open-source license has been granted in this repository; obtain the owner's permission before redistribution or reuse beyond permissions provided by the hosting platform.

## Available now

Reports calculate clinic-local date cohorts directly from PostgreSQL, including records beyond the 100-row operational views. They show ended-outcome no-show rate, recall closure/overdue counts, mock automation status and daily appointment counts. Empty denominators display N/A. Read the [metric definitions](docs/PHASE_5_CONTRACT.md) before interpreting results: closed recalls are not proof of attendance, and simulated delivery is not a sent message.

Select Reports, choose inclusive From/To dates (maximum 366 days), and run the report. Any clinic staff role can read it. Booking fields require ISO timestamps with seconds and an explicit offset, such as `2030-01-02T10:00:00-08:00`; device-local time is no longer silently converted. Sign-out clears rendered data and cancels/invalidates responses belonging to the old session.

Responsive operations dashboard plus the authenticated Node.js administrative API, PostgreSQL migrations, clinic-scoped records, patient creation, appointment booking/rescheduling/status transitions, recall tracking, version-checked updates, audit metadata, browser tests and Docker Compose setup.

Authentication uses short-lived opaque bearer tokens issued/revoked by a trusted operator CLI. The dashboard keeps the credential in memory and clears it on refresh/sign-out. No password login, SSO, MFA, AI agent, clinical API or message delivery is implemented. See the [dashboard contract](docs/PHASE_3_CONTRACT.md) and [API guide](docs/API.md).

## Run locally

Install Docker with Compose v2. Copy `.env.example` to `.env`, then run:

```sh
docker compose up --build --wait
curl --fail http://127.0.0.1:4000/health/live
curl --fail http://127.0.0.1:4000/health/ready
docker compose down
```

Compose applies migrations 001 through 003 before starting the API, including when upgrading an existing volume. The database uses a persistent named volume and is not published to the host. `docker compose down` preserves that data. Never use real patient records. The example password is for local development only; use a URL-safe value for this Compose template.

## Controlled recall automation (Phase 4)

Use an administrator credential and a synthetic patient with a contact email. In Patients, record demo consent; in Recall queue, create a pending recall and select Generate draft. Open Automation, review the exact recipient and immutable template text, explicitly approve it, then choose Simulate delivery. A database mock receipt is recorded; **no email/SMS is sent**. Rejection blocks execution. Consent revocation or a changed source blocks an old approval. Receptionists may draft/approve/execute but cannot record consent; optometrists remain read-only.

This is deterministic template automation, not an implemented LLM agent. No external provider or paid service is required. See [Phase 4 contract](docs/PHASE_4_CONTRACT.md), [API](docs/API.md) and [security boundaries](docs/SECURITY.md). Collections currently show the first 100 records; synthetic consent is not legal consent collection.

For Node.js 24 development with a separately available PostgreSQL 16 database:

```sh
npm ci --ignore-scripts
export DATABASE_URL='postgres://optometry:local-demo-only@localhost:5432/optometry'
npm run migrate
npm start
```

The Node process does not automatically load `.env`; Compose does. Migrations require permission to create `btree_gist` and schema objects. Runtime and migration roles are shared only in this local reference setup.

## Provision demo access

```sh
docker compose exec -T api node src/operator.js demo America/Vancouver
docker compose exec -T api node src/operator.js issue CLINIC_ID ADMINISTRATOR_ID
```

Replace the IDs using the first command's output. The second command displays a secret token once and its non-secret token ID. Keep the token private; do not record it in videos, logs, commits or screenshots. Default expiry is 8 hours. Revoke it with:

```sh
docker compose exec -T api node src/operator.js revoke TOKEN_ID
```

Use `Authorization: Bearer TOKEN` in an API client to call `GET /v1/me`. Full request examples and role rules are in [API.md](docs/API.md). Each `demo` command creates a new isolated synthetic clinic; it does not reset existing data.

Open `http://127.0.0.1:4000/dashboard`, paste the issued secret credential, and connect. The dashboard shows only records returned by the API. Refresh/sign-out clears the credential, so issue another only if the original has expired or been revoked. Optometrists receive a read-only workspace; administrators and receptionists receive the Phase 2 write controls.

## Verify

```sh
npm run check
npm test
TEST_DATABASE_URL='postgres://USER:PASSWORD@localhost:5432/DISPOSABLE_TEST_DB' npm run test:integration
npx playwright install chromium
TEST_DATABASE_URL='postgres://USER:PASSWORD@localhost:5432/DISPOSABLE_TEST_DB' npm run test:e2e
npm audit --audit-level=high
```

Integration tests require a disposable PostgreSQL database and fail when unconfigured. CI also builds the containers and checks behavior during a database outage. See [testing](docs/TESTING.md).

## Project contracts

- [Scope and acceptance](docs/FOUNDATION_SCOPE.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security boundaries](docs/SECURITY.md)
- [Six-phase roadmap](docs/ROADMAP.md)
- [Dashboard acceptance contract](docs/PHASE_3_CONTRACT.md)
- [Continuation checkpoint](docs/HANDOFF.md)

Each phase is delivered through a separate pull request. Merge requires the repository owner's explicit instruction. Production readiness is a future assessment, not a claim made by this repository.
