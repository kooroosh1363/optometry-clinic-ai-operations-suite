# LinkedIn case study draft

## Post

A recall reminder is not finished when a draft appears on screen.

It still needs a valid recipient, current consent, a human decision and a traceable result.

I built a synthetic optometry operations reference to connect that workflow end to end:

• A clinic-scoped dashboard for patients, appointments and recall tasks.
• Immutable template drafts with explicit approval or rejection.
• Consent and source-version checks before simulated execution.
• PostgreSQL-backed reports with clear date cohorts and denominators.
• Tests for tenant boundaries, conflicting bookings, retries and stale browser responses.

The implementation uses Node.js, PostgreSQL and a lightweight browser UI.

An important boundary: the current generator is deterministic, not an LLM agent. Delivery is a database mock; no email or SMS is sent.

The demo uses fictional clinic data. It is a portfolio implementation, not a claim of a live customer deployment or measured business improvement.

The repository includes the code, migrations, setup instructions, test suite and documented limitations so other engineers can inspect and adapt it.

Repository:
https://github.com/kooroosh1363/optometry-clinic-ai-operations-suite

If you run a clinic, which administrative handoff creates the most follow-up work for your team?

#WorkflowAutomation #SoftwareEngineering #PostgreSQL #HealthcareOperations

## Publishing notes

Publish only after the final PR is merged and the demo is checked. Add your actual screen recording; do not use a generated mockup as evidence of working software. Describe a future LLM/provider integration as planned work. The repo name alone does not establish implemented AI capability. Verify licensing before encouraging redistribution; no license grant is implied by this post.

