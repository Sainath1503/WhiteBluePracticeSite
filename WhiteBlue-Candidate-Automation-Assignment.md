# WhiteBlue Candidate Automation Assignment

## Objective

Build a compact automation framework for the WhiteBlue Practice Site within 2 days. The assignment covers API automation, Playwright UI automation, visual regression, and CI/CD execution.

Candidates are free to use AI-assisted solutioning, code generation, test design support, and debugging help. They must understand and be able to explain the final implementation.

## Application Under Test

- App URL: `http://127.0.0.1:4173`
- Swagger docs: `http://127.0.0.1:4173/api-docs/`
- Payment Gateway: `http://127.0.0.1:4174`
- Default tenant key used by UI: `whiteblue`

The site supports customer registration, login, hardware catalog browsing, cart checkout, fake payment gateway approval/decline, and invoice display.

## Required Framework

Use the following baseline stack:

- Language: TypeScript or JavaScript
- UI automation: Playwright
- API automation: Playwright APIRequestContext, Supertest, Axios, or Fetch-based client
- Test runner: Playwright Test is preferred for UI and visual tests
- Assertions: Playwright `expect` or a comparable assertion library
- Reporting: Playwright HTML report plus one machine-readable report such as JUnit, JSON, or Allure
- CI/CD: GitHub Actions or an equivalent YAML-based pipeline

Optional additions:

- Allure reporting
- Test data builder pattern
- Page Object Model or Screenplay-style abstraction
- Environment configuration through `.env`
- AI-generated test data or failure analysis summaries

## Scope

Automate a small but production-minded suite. Prioritize clean design, maintainability, and reliable assertions over raw test count.

Required test groups:

- API registration and login tests
- API customer lookup/session validation tests
- API catalog/order validation tests
- Playwright login/register UI tests
- Playwright hardware ordering happy path
- Playwright payment declined path
- Visual regression checks for key pages/states
- CI/CD workflow to install, build, run, and publish reports/artifacts

## API Test Cases

| ID | Area | Scenario | Endpoint | Expected Result | Priority |
| --- | --- | --- | --- | --- | --- |
| API-001 | Auth | Register a new customer for tenant `whiteblue` | `POST /api/register` | `201`, session token returned, customer object returned without password/hash | High |
| API-002 | Auth | Duplicate registration for same tenant and username | `POST /api/register` | `400`, clear duplicate-user error | High |
| API-003 | Auth | Login with valid credentials | `POST /api/login` | `200`, session token returned | High |
| API-004 | Auth | Login with invalid password | `POST /api/login` | `400`, login rejected | High |
| API-005 | Session | Read current customer with valid session token | `GET /api/me` | `200`, current customer returned | High |
| API-006 | Session | Read current customer without session token | `GET /api/me` | `401`, unauthorized response | High |
| API-007 | Customer | Lookup existing customer by tenant and username | `GET /api/customers/{tenantKey}/{username}` | `200`, profile returned without password/hash | Medium |
| API-008 | Customer | Lookup missing customer | `GET /api/customers/{tenantKey}/{username}` | `404` | Medium |
| API-009 | Catalog | Get hardware catalog | `GET /menu` | `200`, catalog contains available and unavailable items | High |
| API-010 | Order | Create paid order with valid gateway token | `POST /order` | `201`, total calculated server-side | High |
| API-011 | Order | Create order with unknown catalog item | `POST /order` | `400`, invalid order | High |
| API-012 | Order | Create order with unavailable item | `POST /order` | `400`, unavailable item message | High |
| API-013 | Order | Create order with decimal/zero/negative quantity | `POST /order` | `400`, validation failure | Medium |
| API-014 | Order | Replay same payment token | `POST /order` | `402`, replay rejected | Medium |
| API-015 | Order | Submit manipulated client-side price | `POST /order` | `201`, server ignores client price and calculates trusted total | High |

## Playwright UI Test Cases

| ID | Area | Scenario | Expected Result | Priority |
| --- | --- | --- | --- | --- |
| UI-001 | Auth | Login page is default landing page | Login form is visible, register form hidden behind link | High |
| UI-002 | Auth | Click Register link | Register page appears and login form is hidden | High |
| UI-003 | Auth | Register a new customer | User is taken to hardware ordering page | High |
| UI-004 | Auth | Login with registered customer | User is taken to hardware ordering page | High |
| UI-005 | Auth | Invalid login | Error message displayed, order page remains hidden | High |
| UI-006 | Catalog | Catalog loads after login | Hardware Catalog heading and products are visible | High |
| UI-007 | Cart | Add first available product to cart | Cart line and total update | High |
| UI-008 | Payment | Approved payment flow | Gateway opens, CVV accepted, user returns to app, invoice link appears | High |
| UI-009 | Payment | Declined card flow | Gateway stays on page and displays declined message | High |
| UI-010 | Payment | Add fake payment card | Card is saved and available in payment dropdown | Medium |
| UI-011 | Session | Logout | User returns to login page and order page is hidden | Medium |
| UI-012 | Responsive | Login and order pages on mobile viewport | No overlapping text, controls remain usable | Medium |

## Visual Regression Test Cases

Use Playwright screenshots with stable data. Store baselines in source control or publish them as CI artifacts.

| ID | Page/State | Snapshot Name | Expected Coverage |
| --- | --- | --- | --- |
| VR-001 | Default login page | `login-default.png` | Login panel, WhiteBlue branding, Practice Site heading |
| VR-002 | Register form visible | `register-visible.png` | Register panel after clicking Register link |
| VR-003 | Hardware catalog after login | `catalog-visible.png` | Catalog layout and checkout panel |
| VR-004 | Cart with one item | `cart-ready.png` | Cart line, total, payment controls |
| VR-005 | Payment gateway ready | `gateway-ready.png` | WhiteBlue payment gateway form |
| VR-006 | Declined payment message | `gateway-declined.png` | Error state on gateway |
| VR-007 | Paid invoice preview | `invoice-preview.png` | Invoice details after approved payment |
| VR-008 | Mobile login viewport | `mobile-login.png` | Responsive login layout |

Recommended Playwright settings:

```ts
await expect(page).toHaveScreenshot("login-default.png", {
  animations: "disabled",
  fullPage: true,
  maxDiffPixelRatio: 0.05
});
```

## CI/CD Requirements

Create a workflow that runs on pull request and manual dispatch.

Minimum pipeline stages:

1. Checkout repository
2. Setup Node.js
3. Install dependencies with `npm ci`
4. Install Playwright browsers with `npx playwright install --with-deps`
5. Build or type-check the project
6. Start app services or use Playwright `webServer`
7. Run API tests
8. Run Playwright UI tests
9. Run visual regression tests
10. Upload Playwright HTML report, screenshots, traces, and API report artifacts

Suggested commands:

```bash
npm ci
npm run build:ci
npx playwright install --with-deps
npx playwright test
```

For visual snapshot updates, use a separate manual workflow or local-only command:

```bash
npx playwright test --update-snapshots
```

## Deliverables

Submit:

- Automation framework source code
- README with setup and execution instructions
- API test suite
- Playwright UI test suite
- Visual regression baseline images
- CI/CD workflow YAML
- Test report output or screenshots of report
- Short notes on AI usage, design choices, and known limitations

## Evaluation Criteria

| Category | Weight |
| --- | --- |
| Test coverage and scenario selection | 25% |
| Framework structure and maintainability | 20% |
| Reliable Playwright usage and selectors | 15% |
| API test quality and data handling | 15% |
| Visual regression implementation | 10% |
| CI/CD completeness | 10% |
| Documentation and explanation | 5% |

## Time Guidance

Suggested 2-day split:

- Day 1: framework setup, API tests, auth UI tests, test data utilities
- Day 2: checkout/payment UI tests, visual regression, CI/CD, reports, cleanup

## Notes For Candidates

- Keep test data unique to avoid duplicate registration conflicts.
- Do not assert passwords, password hashes, or salts in API responses.
- Prefer accessible selectors such as roles, labels, and headings.
- Keep screenshots deterministic: register unique users, disable animations, and use stable viewport sizes.
- Explain any AI-generated code or test ideas during review.
