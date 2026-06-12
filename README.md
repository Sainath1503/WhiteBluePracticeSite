# WhiteBlue Hardware SaaS

A small, testable hardware SaaS system built with Node.js, TypeScript, Express, Vitest, Supertest, Playwright, and GitHub Actions.

## Scope

Core flows under test:

- View menu
- Create order
- Calculate total
- Process a fake payment through WhiteBlue Payment Gateway
- Handle invalid items and payment failures

Main risks covered:

- Incorrect totals
- Invalid menu items
- Payment failures
- API contract regressions

## Recommendation Logic

The checkout includes a deterministic recommendation endpoint. It uses menu and cart signals to suggest add-ons without calling an external AI provider, keeping tests fast and reliable.

Payment is handled by a separate fake service named **WhiteBlue Payment Gateway** on port `4174`. The main app launches the gateway with the selected masked card, the user enters a fake card user name and CVV, and the order is created only after the gateway returns an approved payment result.

On Vercel, the fake payment gateway UI is served from the same deployment at `/payment` because Vercel does not run the separate local gateway process on port `4174`. Local development can still run the app on `4173` and the gateway on `4174`.

The order API treats the browser as untrusted. It calculates prices from the server-side menu, rejects unknown or unavailable menu items, rejects decimal, zero, negative, and above-limit quantities, rejects payment tokens that do not match the submitted card ID, and rejects replayed fake payment tokens for the lifetime of the running fake gateway instance. This is a demo payment gateway, not production payment security.

## Commands

```bash
npm install
npm run dev
npm run test
npm run test:contract
npm run test:coverage
npm run test:e2e
npm run test:load:smoke
npm run test:load
npm run test:load:docker:smoke
npm run test:load:docker
npm run test:all
npm run test:report
```

`npm run test:all` runs the local test groups in parallel with fail-fast behavior. After the first failure, active/pending checks are stopped or skipped, resources are released, and `qa-artifacts/test-report.html` marks skipped checks with the failure reason.

The app runs on `http://127.0.0.1:4173`. The payment gateway runs on `http://127.0.0.1:4174`.

Swagger/OpenAPI documentation is available at:

- WhiteBlue app: `http://127.0.0.1:4173/api-docs`
- Payment gateway: `http://127.0.0.1:4174/api-docs`
- Raw OpenAPI JSON: `http://127.0.0.1:4173/openapi.json`

On Vercel, use the deployed origin instead of the local host names. The main app is `/`, the fake payment gateway page is `/payment`, Swagger UI is `/api-docs`, and raw OpenAPI JSON is `/openapi.json`.

The HTML test report is generated at `qa-artifacts/test-report.html`.
The Playwright E2E report is generated at `playwright-report/index.html` and includes UI screenshots attached from the E2E checks.

## Test Automation Strategy

- Unit tests provide fast service-level feedback with Vitest.
- Integration tests validate API contracts, request/response behavior, and error handling with Supertest.
- E2E tests validate critical business journeys through the UI and WhiteBlue Payment Gateway with Playwright.
- Critical business logic coverage is enforced at 90%+ for statements, branches, functions, and lines with `npm run test:coverage`.
- Contract tests validate the consumer/provider agreement between WhiteBlue Web and WhiteBlue API with Pact.
- Load tests exercise `/health`, `/menu`, and `/order` with k6 thresholds for request failures, p95 latency, and paid-order failures.
- Testcontainers integration tests start a real PostgreSQL database and verify paid orders can be persisted and read back.
- Visual regression uses Playwright screenshot snapshots for key UI states: menu visible, cart ready, and gateway ready.
- The GitHub Actions PR gate runs unit, integration, contract, coverage, E2E, and k6 load checks as parallel jobs whenever a pull request targets `main`.
- To block merges when tests fail, enable branch protection or a repository ruleset for `main` and require the PR gate status checks before merging.

## Load Testing With k6

The k6 load test is in `tests/load/whiteblue-api.k6.js`.
It requires the k6 CLI to be installed and available on your `PATH`.

Start the API first:

```bash
npm run dev:app
```

Then run a short smoke load test:

```bash
npm run test:load:smoke
```

Or run the default load profile:

```bash
npm run test:load
```

You can also run k6 through Docker. This is useful for CI or machines where you do not want to install the k6 CLI directly:

```bash
npm run test:load:docker:smoke
npm run test:load:docker
```

The Docker runner targets `http://host.docker.internal:4173` by default so the container can reach the API running on your host machine.
Start the API with `HOST=0.0.0.0` when running Docker-based load tests so the container can reach it.

The default target is `http://127.0.0.1:4173`. You can override it in PowerShell:

```powershell
$env:BASE_URL="http://127.0.0.1:4173"; $env:VUS="10"; npm run test:load
```

Or in bash:

```bash
BASE_URL=http://127.0.0.1:4173 VUS=10 npm run test:load
```

The test writes a JSON summary to `qa-artifacts/load-test-summary.json`.

## Test Data Strategy

- Tests use order factories in `tests/fixtures/orderFactory.ts` instead of repeating raw payloads.
- Builders such as `createOrder`, `createInvalidOrder`, `createEmptyOrder`, `createDeclinedPaymentOrder`, `createDuplicateItemOrder`, `createBoundaryQuantityOrder`, and `createRandomOrder` keep test data isolated and readable.
- Each test creates its own request payload, so cases do not share mutable order state.

# WhiteBluePracticeSite
