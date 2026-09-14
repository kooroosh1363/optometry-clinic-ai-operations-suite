# Contributor instructions

- Read docs/HANDOFF.md and docs/ROADMAP.md before work. Preserve user changes.
- Keep implementation and documentation in English; communicate with the owner in Persian.
- Work on a phase branch and open a PR. Never merge without explicit owner authorization.
- Stay within the requested milestone. Do not label planned functionality as implemented.
- Use synthetic data only. No clinical diagnosis, prescription, or autonomous clinical decisions.
- Do not claim a real client deployment, compliance certification, measured ROI, or tests that were not run.
- Run npm run check and npm test. Real database tests require an isolated disposable PostgreSQL database; CI checks must be reviewed before merge.
- Never edit an applied migration; add a new version and update migration support.
- Record known gaps and continuation instructions. Production credentials and patient data must never enter the repository.
