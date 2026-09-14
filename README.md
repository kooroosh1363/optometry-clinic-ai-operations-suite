# Optometry Clinic AI Operations Suite

Human-controlled optometry operations reference project, built in six reviewable phases.

**Status: Phase 1 foundation. Not a deployed clinic product, medical device, or real client engagement. Use synthetic data only.**

## Available now

Node.js health service, PostgreSQL schema and transactional migration runner, database-level appointment overlap constraints, tests, and Docker Compose development setup. No patient-facing or clinical APIs, dashboard, AI agent, messaging integration, or authentication is implemented yet.

## Run the foundation

Install Docker with Compose v2. Copy `.env.example` to `.env`, then run:

```sh
docker compose up --build --wait
curl --fail http://127.0.0.1:4000/health/live
curl --fail http://127.0.0.1:4000/health/ready
docker compose down
```

Compose runs the migration before starting the API. The database uses a persistent named volume and is not published to the host. `docker compose down` preserves that data. Never use real patient records. The example password is for local development only; use a URL-safe value for this Compose template.

For Node.js 24 development with a separately available PostgreSQL 16 database:

```sh
npm ci --ignore-scripts
export DATABASE_URL='postgres://optometry:local-demo-only@localhost:5432/optometry'
npm run migrate
npm start
```

The Node process does not automatically load `.env`; Compose does. Migrations require permission to create `btree_gist` and schema objects. Runtime and migration roles are shared only in this local reference setup.

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
