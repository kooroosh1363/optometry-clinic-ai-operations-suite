# Architecture decisions

## ADR 001: Small modular monolith

Use Node.js 24 with its HTTP and test libraries and the PostgreSQL driver. Configuration, HTTP routing, database access, and migrations have separate modules. This keeps the foundation inspectable; a larger API framework can be evaluated when authenticated business routes arrive. No UI framework decision is implied here.

`src/server.js` owns process startup and shutdown. `src/app.js` owns only health responses. `src/config.js` validates startup inputs. `src/db.js` configures bounded database connections and schema readiness. `src/migrate.js` applies the versioned SQL migration.

## ADR 002: PostgreSQL enforces core integrity

Composite references prevent an appointment from pointing to another clinic's patient or practitioner. Exclusion constraints prevent active overlapping slots for a patient or practitioner. This avoids depending on a vulnerable read-then-write availability check. Application authorization, valid practitioner roles, clinic timezone validation, and lifecycle transition rules remain Phase 2 work.

## ADR 003: Controlled, transactional migrations

Migration 001 is checksum tracked and serialized with a transaction-level advisory lock. Schema work and version recording commit together. An applied migration must never be edited; future schema changes use a new migration after extending the runner. The current runner supports only version 001. Deployment runs migration separately before API startup.

## ADR 004: Health is not authorization

Liveness is independent of PostgreSQL; readiness requires schema version 001. Unknown paths return 404. No patient APIs are exposed before authorization and tenant-isolation tests exist. Database constraints do not prevent unauthorized reads.

## ADR 005: AI assists administration only

Future agents may prepare administrative drafts, with human approval before external effects. They will not diagnose, prescribe, or decide clinical urgency. No model provider is invoked in Phase 1; no AI accuracy or financial improvement is claimed.
