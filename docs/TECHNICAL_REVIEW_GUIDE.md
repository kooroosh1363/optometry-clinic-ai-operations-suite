# Technical review and final-manual source

This is the English repository source for review preparation. The separate Persian RTL PDF is prepared after final authorized merge, tied to that commit, with code excerpts checked against the merged source.

## Code navigation

| Location | Responsibility | Review question |
| --- | --- | --- |
| src/server.js, config.js | Process startup, validated configuration | What fails fast and what remains live on DB outage? |
| src/app.js, static.js | HTTP routing, headers, fixed asset mapping | Why no arbitrary filesystem path serving? |
| src/auth.js, operator.js | Opaque token lifecycle and synthetic provisioning | Where is identity trusted, and how are tokens revoked? |
| src/api.js, validation.js | Transactional administrative handlers and input rules | How are cross-clinic access and invalid transitions rejected? |
| src/automation.js | Consent, immutable drafts, approval, mock receipt and retries | What changes invalidate an approval? |
| src/analytics.js | Date-range validation and single-statement cohort aggregates | What is the denominator and why clinic-local midnight? |
| src/db.js, src/migrate.js, db/migrations/ | Pool, readiness, transactional checksum migrations | What prevents concurrent migrations and overlapping bookings? |
| public/app.js | In-memory session, rendering, forms, late-response guards | Can an old response overwrite a newer session or form? |
| public/index.html, app.css | Semantic views and responsive presentation | What does automated accessibility testing not prove? |
| test/unit, test/integration, test/e2e | Dependency-free contracts, real DB rules, browser flows | Which evidence runs against a real database? |
| compose.yaml, Dockerfile, .github/workflows/ci.yml | Local packaging and acceptance jobs | How close is this to production operations? |

## Questions a strict reviewer should ask

**Where is the AI?** There is no LLM inference or implemented autonomous agent. The current generator is recall-template-v1. The project demonstrates controlled workflow infrastructure that could later host a model. Adding one requires its own grounding, prompt-injection, evaluation, privacy, cost and provider-error design; it is not a configuration switch currently supplied.

**Why a deterministic template?** It makes the implemented scope testable without external cost or nondeterministic text. It is suitable for this narrowly defined administrative reminder, not proof of intelligent reasoning.

**What prevents double booking?** PostgreSQL exclusion constraints for active patient and practitioner time ranges, plus clinic-scoped references. Application checks alone would race. Integration tests exercise concurrent requests. Adjacent half-open intervals are allowed.

**How is tenant isolation enforced?** Authentication derives clinic identity from the token/staff relationship; handlers scope SQL to that clinic and composite foreign keys keep references consistent. There is no DB row-level security, so a query bug or privileged DB access remains a risk.

**What happens if two users update the same record?** Version-checked writes reject stale revisions. The UI refreshes after conflicts. This is optimistic concurrency, not collaborative real-time editing.

**What does human approval mean?** An authorized writer approves an immutable draft and recipient. Execution checks source and consent revisions again. Author and approver can be the same person; there is no four-eyes separation guarantee.

**Is this exactly-once delivery?** Only the mock receipt's unique DB key and transaction prevent duplicate receipts in the documented scope. No external side effect is implemented. A real provider needs an outbox/reconciliation/idempotency design matched to that provider.

**What happens when consent is revoked then granted again?** The consent version changes. Old drafts remain stale rather than becoming valid again automatically.

**What if execution fails halfway?** The mock delivery savepoint rolls back partial receipt work. Expected mock failures record a failed attempt; explicit retries are capped at three. Unexpected errors roll back the transaction.

**Why not infer attendance from a closed recall?** Closing is an administrative state, not clinical attendance evidence. The report keeps it separate.

**How is no-show rate calculated?** Ended no-show appointments divided by ended completed plus ended no-show appointments in the appointment-start cohort. Cancelled, unresolved and not-yet-ended appointments do not enter that denominator. Zero denominator is null/N/A.

**Why one report SQL statement?** Aggregates share a committed statement snapshot. Clinic-local date boundaries converted to instants handle daylight-saving days. Current status counts do not reconstruct historical status as of the period end.

**Why can today's simulated delivery disappear in a historical report?** Automation is grouped by draft creation date; recalls by due date and appointments by start date. The cohorts answer different questions.

**Are secrets stored in the browser?** The application keeps the credential in memory, not local/session storage or cookies, and clears it on sign-out/refresh. XSS could still steal in-memory credentials; this is not a substitute for production identity/security controls.

**Does cancelling a browser request cancel the write?** No. A server transaction may already have committed. Session guards prevent stale rendering; modal guards preserve a later form. Inspect records before retrying non-idempotent creates.

**Are audit records tamper-proof?** No. They are transactionally recorded metadata, but a privileged database owner can alter them.

**What is the test evidence?** Consult the exact PR head's CI. Unit/HTTP tests, real PostgreSQL integration, Chromium workflows, Compose smoke and production dependency audit have distinct coverage. A count alone is not a correctness proof.

**What is missing for a real clinic?** Identity/SSO, operational monitoring, restore drills, data governance, legal consent handling, least privilege, provider integration, fuller UI navigation and independent security/accessibility review. No compliance certification is claimed.

**Was this ordered by a real client?** No. It is a synthetic portfolio reference modeling an administrative business workflow. No client revenue, adoption or ROI is asserted.

## Final Persian PDF checklist (after merge)

Record final commit and CI evidence; explain business scope, architecture, setup, schema, every source module, endpoint/role map, automation state transitions, metric formulae, security boundaries and tests. Include representative annotated code excerpts and navigation references rather than an unreviewed code dump. Translate this Q&A and state remaining gaps honestly. Embed a Persian-capable font; verify RTL shaping, mixed English/code direction, tables, page breaks, text extraction and rendered pages before delivery.
