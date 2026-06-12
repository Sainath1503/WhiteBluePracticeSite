# QA Artifacts Guide

This folder contains QA artifacts created for the WhiteBlue Hardware SaaS test strategy.

## Files

- `test-report.html`
  Interactive QA report with Unit, Integration, Contract, E2E, Coverage, and Load test evidence.

- `coverage/`
  Vitest HTML and JSON summary for the 90%+ critical logic coverage gate.

- `ci-status/`
  CI status summaries used by `npm run test:report` to mark skipped or failed checks after fail-fast execution.

## Test Report

Generate the test report with:

```bash
npm run test:report
```

Open:

```text
qa-artifacts/test-report.html
```

The report includes:

- dashboard totals for checks, passed, failed, skipped, and duration
- 90%+ critical logic coverage gate results for lines, statements, functions, and branches
- section-level views for Unit, Integration, Contract, E2E, and Load tests
- Testcontainers PostgreSQL evidence under Integration tests
- Pact contract evidence under Contract tests
- k6 thresholds, configured VUs, endpoint hit counts, and total API requests under Load tests
- Visual regression evidence from Playwright screenshot snapshots for menu visible, cart ready, and gateway ready states.
