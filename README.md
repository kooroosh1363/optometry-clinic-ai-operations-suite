# Optometry Clinic AI Operations Suite

Human-controlled optometry operations reference project, built in six reviewable phases.

**Status: Phase 2 administrative API. Not a deployed clinic product, medical device, or real client engagement. Use synthetic data only.**

## Available now

Node.js health service and authenticated administrative API, PostgreSQL migrations, clinic-scoped records, patient creation, appointment booking/rescheduling/status transitions, recall tracking, version-checked updates, audit metadata, tests and Docker Compose setup.

Authentication uses short-lived opaque bearer tokens issued/revoked by a trusted operator CLI. No password login, SSO, MFA, dashboard, AI agent, clinical API or message delivery is implemented. See the [Phase 2 contract](docs/PHASE_2_CONTRACT.md) and [API guide](docs/API.md).

## Run locally

Install Docker with Compose v2. Copy `.env.example` to `.env`, then run:

```sh
docker compose up --build --wait
curl --fail http://127.0.0.1:4000/health/live
curl --fail http://127.0.0.1:4000/health/ready
docker compose down
```

Compose applies migrations 001 and 002 before starting the API, including when upgrading an existing Phase 1 volume. The database uses a persistent named volume and is not published to the host. `docker compose down` preserves that data. Never use real patient records. The example password is for local development only; use a URL-safe value for this Compose template.

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

## Verify

```sh
npm run check
npm test
TEST_DATABASE_URL='postgres://USER:PASSWORD@localhost:5432/DISPOSABLE_TEST_DB' npm run test:integration
npm audit --omit=dev --audit-level=high
```

Integration tests require a disposable PostgreSQL database and fail when unconfigured. CI also builds the containers and checks behavior during a database outage. See [testing](docs/TESTING.md).

## Project contracts

- [Scope and acceptance](docs/FOUNDATION_SCOPE.md)
- [Architecture and decisions](docs/ARCHITECTURE.md)
- [Data model](docs/DATA_MODEL.md)
- [Security boundaries](docs/SECURITY.md)
- [Six-phase roadmap](docs/ROADMAP.md)
- [Continuation checkpoint](docs/HANDOFF.md)

Each phase is delivered through a separate pull request. Merge requires the repository owner's explicit instruction. Production readiness is a future assessment, not a claim made by this repository.
