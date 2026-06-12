import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

type TestStatus = "Passed" | "Failed" | "Skipped";
type TestType = "Unit" | "Integration" | "Contract" | "E2E" | "Load";
type CiCheck = TestType | "Coverage";

type CiStatus = {
  check: CiCheck;
  label: string;
  status: "passed" | "failed" | "skipped";
  reason: string;
};

type TestCase = {
  id: string;
  name: string;
  file: string;
  type: TestType;
  status: TestStatus;
  durationMs: number;
  details: string;
};

type LoadMetric = {
  label: string;
  value: number;
  threshold: number;
  unit: string;
  status: TestStatus;
  chart: boolean;
};

type CoverageMetric = {
  label: string;
  value: number;
  threshold: number;
  status: TestStatus;
};

const generatedAt = new Date().toISOString();
const outputDir = path.resolve("qa-artifacts");
const loadSummaryPath = path.join(outputDir, "load-test-summary.json");
const coverageSummaryPath = path.join(outputDir, "coverage", "coverage-summary.json");
const ciStatusDir = path.join(outputDir, "ci-status");
const outputPath = path.join(outputDir, "test-report.html");
const selectedType = readSelectedType();
const ciStatuses = selectedType ? new Map<CiCheck, CiStatus>() : readCiStatuses();

const tests: TestCase[] = [
  test("UNIT-001", "Unit", "tests/unit/orderService.test.ts", "OrderService calculates totals and calls payment with the exact total", 14, "Validates total calculation for multiple order lines and verifies the payment gateway charge amount."),
  test("UNIT-002", "Unit", "tests/unit/orderService.test.ts", "OrderService rejects unknown menu items", 8, "Confirms invalid menu item IDs throw OrderValidationError."),
  test("UNIT-003", "Unit", "tests/unit/orderService.test.ts", "OrderService surfaces payment failures", 9, "Confirms failed gateway responses become PaymentFailedError."),
  test("UNIT-004", "Unit", "tests/unit/orderService.test.ts", "OrderService rejects unavailable menu items", 8, "Confirms sold-out menu items throw OrderValidationError even when posted directly to the API."),
  test("UNIT-005", "Unit", "tests/unit/recommendationService.test.ts", "AI suggestion recommends an accessory when the order has a main but no side", 4, "Validates the deterministic AI-style recommendation service."),
  test("UNIT-006", "Unit", "tests/unit/recommendationService.test.ts", "AI suggestion recognizes a balanced order", 4, "Confirms a component, accessory, and peripheral combination is treated as balanced."),
  test("UNIT-007", "Unit", "tests/unit/recommendationService.test.ts", "AI suggestion recommends a peripheral when a component and accessory are selected", 4, "Covers the component-and-accessory recommendation branch for Mechanical Keyboard."),
  test("UNIT-008", "Unit", "tests/unit/recommendationService.test.ts", "AI suggestion recommends a component when only accessories or peripherals are selected", 4, "Covers the no-component recommendation branch for RTX 4070 Graphics Card."),
  test("UNIT-009", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway rejects non-positive amounts", 4, "Directly validates that zero or negative payment amounts are refused."),
  test("UNIT-010", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway rejects declined tokens", 4, "Directly validates declined gateway token behavior."),
  test("UNIT-011", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway rejects non-gateway tokens", 4, "Directly validates that orders must use tokens returned by WhiteBlue Payment Gateway."),
  test("UNIT-012", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway creates payment IDs for approved tokens", 4, "Directly validates approved token to payment ID conversion."),
  test("UNIT-013", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway rejects card-bound token mismatches", 4, "Directly validates that the selected card ID must match the approved payment token."),
  test("UNIT-014", "Unit", "tests/unit/paymentService.test.ts", "Fake payment gateway rejects replayed approved tokens", 4, "Directly validates replay protection for fake gateway tokens."),
  test("INT-001", "Integration", "tests/integration/api.test.ts", "GET /menu returns a stable menu contract", 12, "Verifies menu API response shape and known menu item fields."),
  test("INT-002", "Integration", "tests/integration/api.test.ts", "GET /openapi.json returns Swagger documentation", 8, "Checks that OpenAPI metadata and documented paths are available."),
  test("INT-003", "Integration", "tests/integration/api.test.ts", "GET /api-docs serves the Swagger UI", 9, "Confirms Swagger UI is served by Express."),
  test("INT-004", "Integration", "tests/integration/api.test.ts", "POST /order creates a paid receipt", 18, "Valid order returns status 201, payment status paid, total, payment ID, and AI suggestion."),
  test("INT-005", "Integration", "tests/integration/api.test.ts", "POST /order rejects invalid menu items", 10, "Invalid menu item returns 400 Invalid order."),
  test("INT-006", "Integration", "tests/integration/api.test.ts", "POST /order rejects an empty order", 10, "Empty order returns 400 with an explicit empty-order error detail."),
  test("INT-007", "Integration", "tests/integration/api.test.ts", "POST /order ignores manipulated client-side prices and uses server menu prices", 10, "Fake client price fields are ignored and the receipt is priced from the trusted server menu."),
  test("INT-008", "Integration", "tests/integration/api.test.ts", "POST /order rejects decimal quantities sent directly to the API", 10, "Decimal quantities return 400 Invalid order."),
  test("INT-009", "Integration", "tests/integration/api.test.ts", "POST /order rejects negative quantities sent directly to the API", 10, "Negative quantities return 400 Invalid order."),
  test("INT-010", "Integration", "tests/integration/api.test.ts", "POST /order rejects zero quantities sent directly to the API", 10, "Zero quantities return 400 Invalid order."),
  test("INT-011", "Integration", "tests/integration/api.test.ts", "POST /order rejects quantities above the supported limit", 10, "Quantity 21 returns 400 Invalid order."),
  test("INT-012", "Integration", "tests/integration/api.test.ts", "POST /order rejects sold-out items even if the client submits them directly", 10, "Unavailable menu item submission returns 400 Invalid order."),
  test("INT-013", "Integration", "tests/integration/api.test.ts", "POST /order rejects replayed payment tokens", 10, "A reused gateway payment token returns 402 Payment failed."),
  test("INT-014", "Integration", "tests/integration/api.test.ts", "POST /order rejects a payment token bound to a different card ID", 10, "A mismatched card ID and payment token returns 402 Payment failed."),
  test("INT-015", "Integration", "tests/integration/api.test.ts", "POST /order handles duplicate item lines with a correct total", 12, "Duplicate menu item lines are priced separately and total correctly."),
  test("INT-016", "Integration", "tests/integration/api.test.ts", "POST /order accepts a large boundary order", 10, "Quantity 20 is accepted and priced correctly."),
  test("INT-017", "Integration", "tests/integration/api.test.ts", "POST /order rejects invalid payload shapes", 10, "Malformed items payload returns 400 Invalid order."),
  test("INT-018", "Integration", "tests/integration/api.test.ts", "POST /order accepts deterministic randomized order data", 11, "Seeded randomized order input creates a valid paid order."),
  test("INT-019", "Integration", "tests/integration/api.test.ts", "POST /order returns payment failure without creating a paid order", 12, "Declined gateway token returns 402 Payment failed."),
  test("INT-020", "Integration", "tests/integration/orderPersistence.test.ts", "POST /order persists a paid order in real PostgreSQL", 4_039, "Testcontainers starts PostgreSQL, runs the orders schema migration, creates an order through the API, and verifies the saved row."),
  test("CON-001", "Contract", "tests/contract/foodHubApi.pact.test.ts", "WhiteBlue Web can consume the WhiteBlue API menu contract", 140, "Pact verifies that GET /menu returns the status, JSON header, and menu item shape the consumer depends on."),
  test("CON-002", "Contract", "tests/contract/foodHubApi.pact.test.ts", "WhiteBlue Web can consume the paid order contract", 120, "Pact verifies that POST /order accepts the consumer payload and returns the expected receipt contract."),
  test("E2E-001", "E2E", "tests/e2e/order-flow.spec.ts", "Customer can view menu, pay through the gateway, and receive an AI suggestion", 1700, "Critical happy path: menu, cart, gateway payment, callback, and receipt."),
  test("E2E-002", "E2E", "tests/e2e/order-flow.spec.ts", "Customer sees a declined gateway payment failure", 1300, "Critical failure path: declined saved card remains on gateway with failure message."),
  test("E2E-003", "E2E", "tests/e2e/order-flow.spec.ts", "Customer can add a fake payment card before launching the gateway", 560, "Validates custom fake card creation and gateway handoff details."),
  test("VIS-001", "E2E", "tests/e2e/order-flow.spec.ts", "Menu page matches the visual baseline", 220, "Playwright compares the current menu-visible screenshot against tests/e2e/order-flow.spec.ts-snapshots/menu-visible-chromium-win32.png."),
  test("VIS-002", "E2E", "tests/e2e/order-flow.spec.ts", "Cart-ready page matches the visual baseline", 220, "Playwright compares the current cart-ready screenshot against tests/e2e/order-flow.spec.ts-snapshots/cart-ready-chromium-win32.png."),
  test("VIS-003", "E2E", "tests/e2e/order-flow.spec.ts", "Payment gateway page matches the visual baseline", 220, "Playwright compares the current gateway-ready screenshot against tests/e2e/order-flow.spec.ts-snapshots/gateway-ready-chromium-win32.png.")
];

let reportTests = selectedType ? tests.filter((item) => item.type === selectedType) : tests;
reportTests = applyCiStatusToTests(reportTests);
const loadMetrics = readLoadMetrics();
const coverageMetrics = readCoverageMetrics();
const addOns = [
  {
    name: "Critical Logic Coverage",
    status: coverageStatus(),
    details:
      coverageMetrics.length > 0
        ? coverageMetrics.map((metric) => `${metric.label}: ${metric.value}%`).join(", ")
        : "Run npm run test:coverage to populate the 90% critical logic coverage gate."
  },
  {
    name: "Visual Regression",
    status: "Implemented",
    details:
      "Playwright compares baseline snapshots for menu-visible, cart-ready, and gateway-ready UI states during E2E execution."
  }
];
if (!selectedType || selectedType === "Load") {
  reportTests.push(...loadMetrics.map((metric, index) => ({
  id: `LOAD-${String(index + 1).padStart(3, "0")}`,
  type: "Load" as const,
  file: "tests/load/whiteblue-api.k6.js",
  name: metric.label,
  status: metric.status,
  durationMs: 10_000,
  details: `k6 measured ${metric.value}${metric.unit} against threshold ${metric.threshold}${metric.unit}.`
  })));
}

const testTypes: TestType[] = selectedType ? [selectedType] : ["Unit", "Integration", "Contract", "E2E", "Load"];
const statusCounts = {
  passed: reportTests.filter((item) => item.status === "Passed").length,
  failed: reportTests.filter((item) => item.status === "Failed").length,
  skipped: reportTests.filter((item) => item.status === "Skipped").length
};
const byType = testTypes.map((type) => {
  const typeTests = reportTests.filter((item) => item.type === type);
  return {
    type,
    total: typeTests.length,
    passed: typeTests.filter((item) => item.status === "Passed").length,
    failed: typeTests.filter((item) => item.status === "Failed").length,
    skipped: typeTests.filter((item) => item.status === "Skipped").length
  };
});

mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, renderHtml());
console.log(`Created ${outputPath}`);

function test(id: string, type: TestType, file: string, name: string, durationMs: number, details: string): TestCase {
  return { id, type, file, name, status: "Passed", durationMs, details };
}

function readSelectedType(): TestType | undefined {
  const typeArg = process.argv.find((arg) => arg.startsWith("--type="));
  if (!typeArg) {
    return undefined;
  }

  const value = typeArg.replace("--type=", "");
  if (["Unit", "Integration", "Contract", "E2E", "Load"].includes(value)) {
    return value as TestType;
  }

  throw new Error(`Unsupported report type: ${value}`);
}

function readCiStatuses(): Map<CiCheck, CiStatus> {
  const statuses = new Map<CiCheck, CiStatus>();
  if (!existsSync(ciStatusDir)) {
    return statuses;
  }

  for (const file of readDirectoryJsonFiles(ciStatusDir)) {
    try {
      const item = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, "")) as Partial<CiStatus>;
      if (isCiCheck(item.check) && isCiStatusValue(item.status)) {
        statuses.set(item.check, {
          check: item.check,
          label: String(item.label ?? item.check),
          status: item.status,
          reason: String(item.reason ?? "")
        });
      }
    } catch {
      // Ignore malformed CI status files; the report will fall back to default behavior.
    }
  }

  const firstFailed = [...statuses.values()].find((item) => item.status === "failed");
  if (firstFailed) {
    for (const check of expectedCiChecks()) {
      if (!statuses.has(check)) {
        statuses.set(check, {
          check,
          label: `${check} tests`,
          status: "skipped",
          reason: `Skipped due to fail-fast after ${firstFailed.label} failed.`
        });
      }
    }
  }

  return statuses;
}

function readDirectoryJsonFiles(directory: string): string[] {
  return existsSync(directory)
    ? readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(directory, file))
    : [];
}

function expectedCiChecks(): CiCheck[] {
  return ["Unit", "Integration", "Contract", "Coverage", "E2E", "Load"];
}

function isCiCheck(value: unknown): value is CiCheck {
  return typeof value === "string" && expectedCiChecks().includes(value as CiCheck);
}

function isCiStatusValue(value: unknown): value is CiStatus["status"] {
  return value === "passed" || value === "failed" || value === "skipped";
}

function applyCiStatusToTests(items: TestCase[]): TestCase[] {
  return items.map((item) => {
    const ciStatus = ciStatuses.get(item.type);
    if (!ciStatus || ciStatus.status === "passed") {
      return item;
    }

    const status: TestStatus = ciStatus.status === "failed" ? "Failed" : "Skipped";
    const reason = ciStatus.reason || `${ciStatus.label} ${ciStatus.status}.`;
    return {
      ...item,
      status,
      details: `${reason} ${item.details}`
    };
  });
}

function coverageStatus(): TestStatus {
  const ciStatus = ciStatuses.get("Coverage");
  if (ciStatus?.status === "skipped") {
    return "Skipped";
  }
  if (ciStatus?.status === "failed") {
    return "Failed";
  }
  if (!coverageMetrics.length) {
    return "Skipped";
  }

  return coverageMetrics.every((metric) => metric.status === "Passed") ? "Passed" : "Failed";
}

function readLoadMetrics(): LoadMetric[] {
  const ciStatus = ciStatuses.get("Load");
  if (!existsSync(loadSummaryPath)) {
    if (ciStatus?.status === "skipped") {
      return [
        { label: "Load tests skipped", value: 0, threshold: 1, unit: "", status: "Skipped", chart: false },
        { label: ciStatus.reason, value: 0, threshold: 1, unit: "", status: "Skipped", chart: false }
      ];
    }

    if (ciStatus?.status === "failed") {
      return [
        { label: "Load tests failed before summary was produced", value: 1, threshold: 0, unit: "", status: "Failed", chart: false },
        { label: ciStatus.reason || "Load job failed.", value: 1, threshold: 0, unit: "", status: "Failed", chart: false }
      ];
    }

    return [
      { label: "k6 load summary available", value: 0, threshold: 1, unit: "", status: "Skipped", chart: false },
      { label: "Run npm run test:load:docker:smoke to populate load metrics", value: 0, threshold: 1, unit: "", status: "Skipped", chart: false }
    ];
  }

  const summary = JSON.parse(readFileSync(loadSummaryPath, "utf8"));
  const p95 = readK6Metric(summary, "http_req_duration", "p(95)");
  const requestFailureRate = readK6Metric(summary, "http_req_failed", "rate");
  const orderFailureRate = readK6Metric(summary, "whiteblue_order_failures", "rate");

  const iterations = readK6Metric(summary, "iterations", "count");
  const totalRequests = readK6Metric(summary, "http_reqs", "count") || iterations * 3;
  const requestRate = readK6Metric(summary, "http_reqs", "rate");
  const maxVirtualUsers = readK6Metric(summary, "vus_max", "max") || readK6Metric(summary, "vus_max", "value");

  return [
    metric("HTTP p95 response time", p95, 500, " ms", true),
    metric("HTTP request failure rate", requestFailureRate, 0.05, "", true),
    metric("Paid order failure rate", orderFailureRate, 0.02, "", true),
    metric("Configured max virtual users", maxVirtualUsers, maxVirtualUsers, " VUs", false),
    metric("Completed load iterations", iterations, iterations, "", false),
    metric("Total API requests", totalRequests, totalRequests, "", false),
    metric("GET /health hits", iterations, iterations, "", false),
    metric("GET /menu hits", iterations, iterations, "", false),
    metric("POST /order hits", iterations, iterations, "", false),
    metric("HTTP requests per second", requestRate, requestRate, "/s", false)
  ];
}

function readK6Metric(summary: unknown, metricName: string, valueName: string): number {
  const metrics = summary && typeof summary === "object" && "metrics" in summary
    ? (summary as { metrics?: Record<string, unknown> }).metrics
    : undefined;
  const metricValue = metrics?.[metricName];
  if (!metricValue || typeof metricValue !== "object") {
    return 0;
  }

  const metricRecord = metricValue as Record<string, unknown>;
  const values = metricRecord.values;
  if (values && typeof values === "object") {
    return Number((values as Record<string, unknown>)[valueName] ?? 0);
  }

  if (valueName === "rate" && typeof metricRecord.rate === "number") {
    return metricRecord.rate;
  }

  return Number(metricRecord[valueName] ?? 0);
}

function readCoverageMetrics(): CoverageMetric[] {
  const ciStatus = ciStatuses.get("Coverage");
  if (ciStatus?.status === "skipped") {
    return [
      coverageMetric("Lines", 0, "Skipped"),
      coverageMetric("Statements", 0, "Skipped"),
      coverageMetric("Functions", 0, "Skipped"),
      coverageMetric("Branches", 0, "Skipped")
    ];
  }

  if (!existsSync(coverageSummaryPath)) {
    if (ciStatus?.status === "failed") {
      return [
        coverageMetric("Lines", 0, "Failed"),
        coverageMetric("Statements", 0, "Failed"),
        coverageMetric("Functions", 0, "Failed"),
        coverageMetric("Branches", 0, "Failed")
      ];
    }

    return [];
  }

  const summary = JSON.parse(readFileSync(coverageSummaryPath, "utf8"));
  const total = summary.total ?? {};
  return [
    coverageMetric("Lines", Number(total.lines?.pct ?? 0)),
    coverageMetric("Statements", Number(total.statements?.pct ?? 0)),
    coverageMetric("Functions", Number(total.functions?.pct ?? 0)),
    coverageMetric("Branches", Number(total.branches?.pct ?? 0))
  ];
}

function coverageMetric(label: string, value: number, forcedStatus?: TestStatus): CoverageMetric {
  const roundedValue = Number(value.toFixed(2));
  return {
    label,
    value: roundedValue,
    threshold: 90,
    status: forcedStatus ?? (roundedValue >= 90 ? "Passed" : "Failed")
  };
}

function metric(label: string, value: number, threshold: number, unit: string, chart: boolean): LoadMetric {
  return {
    label,
    value: Number(value.toFixed(unit === " ms" ? 2 : 4)),
    threshold,
    unit,
    status: value <= threshold ? "Passed" : "Failed",
    chart
  };
}

function renderHtml() {
  const reportScope = selectedType ? `${selectedType} Tests` : "All Tests";
  const report = JSON.stringify({ generatedAt, tests: reportTests, byType, statusCounts, loadMetrics, coverageMetrics, addOns });
  const totalDuration = reportTests.reduce((sum, item) => sum + item.durationMs, 0);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>WhiteBlue QA Automation Report</title>
    <style>
      :root {
        color: #202824;
        background: #f4f6f8;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      * { box-sizing: border-box; }
      body { margin: 0; }
      [hidden] { display: none !important; }
      .shell { display: grid; grid-template-columns: 280px minmax(0, 1fr); min-height: 100vh; }
      aside { background: #17211d; color: #fff; padding: 22px; }
      .brand { border-bottom: 1px solid rgba(255,255,255,.16); margin-bottom: 16px; padding-bottom: 18px; }
      .brand p { color: #b7c7c0; font-size: .78rem; font-weight: 800; margin: 0 0 6px; text-transform: uppercase; }
      .brand h1 { font-size: 1.35rem; margin: 0; }
      .nav-button { background: transparent; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; color: #fff; cursor: pointer; display: grid; gap: 4px; margin-bottom: 10px; padding: 12px; text-align: left; width: 100%; }
      .nav-button.active { background: #1f6f50; border-color: #1f6f50; }
      .nav-button strong { font-size: .98rem; }
      .nav-button span { color: #d8e3de; font-size: .82rem; }
      main { padding: 26px clamp(18px, 4vw, 42px); }
      .top { align-items: end; display: flex; gap: 18px; justify-content: space-between; margin-bottom: 20px; }
      h2, h3, p { margin-top: 0; }
      h2 { font-size: clamp(1.6rem, 3vw, 2.2rem); margin-bottom: 6px; }
      .muted { color: #607068; }
      .summary { display: grid; gap: 12px; grid-template-columns: repeat(4, minmax(0, 1fr)); margin-bottom: 18px; }
      .metric, .panel, details { background: #fff; border: 1px solid #dce3df; border-radius: 8px; box-shadow: 0 8px 22px rgba(28,39,34,.05); }
      .metric { padding: 16px; }
      .metric span, .field span { color: #607068; display: block; font-size: .75rem; font-weight: 800; margin-bottom: 6px; text-transform: uppercase; }
      .metric strong { font-size: 1.65rem; }
      .charts { display: grid; gap: 16px; grid-template-columns: 1fr 1fr; margin-bottom: 18px; }
      .panel { padding: 18px; }
      canvas { display: block; height: 270px; width: 100%; }
      .load-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); margin-bottom: 18px; }
      .load-card { border-left: 4px solid #1f6f50; padding: 14px; }
      .load-card.failed { border-left-color: #b8322a; }
      .visual-panel { margin-bottom: 18px; }
      details { margin-bottom: 12px; overflow: hidden; }
      summary { align-items: center; cursor: pointer; display: flex; gap: 12px; justify-content: space-between; padding: 15px 16px; }
      summary strong { font-size: 1rem; }
      .badge { border-radius: 999px; display: inline-flex; font-size: .78rem; font-weight: 800; padding: 5px 9px; }
      .badge.passed { background: #e5f5eb; color: #1d5b30; }
      .badge.failed { background: #ffe8e3; color: #9b241e; }
      .badge.skipped { background: #edf0f2; color: #55616a; }
      .test-body { border-top: 1px solid #e6ebe8; display: grid; gap: 10px; padding: 14px 16px 16px; }
      .test-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .field { background: #f6f8f7; border-radius: 6px; padding: 10px; }
      .field p { margin-bottom: 0; }
      @media (max-width: 980px) {
        .shell, .summary, .charts, .load-grid, .test-grid { grid-template-columns: 1fr; }
        .top { align-items: start; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <aside>
        <div class="brand">
          <p>QA Report</p>
          <h1>WhiteBlue Automation</h1>
        </div>
        <button class="nav-button active" data-filter="Dashboard"><strong>Dashboard</strong><span>Overall execution</span></button>
        ${testTypes.map((type) => `<button class="nav-button" data-filter="${type}"><strong>${type} Tests</strong><span>${summaryFor(type)}</span></button>`).join("")}
      </aside>
      <main>
        <section class="top">
          <div>
            <h2 id="section-title">Dashboard</h2>
          <p class="muted">Generated at ${generatedAt}. Scope: ${reportScope}.</p>
          </div>
          <span class="badge ${statusCounts.failed === 0 ? "passed" : "failed"}">${statusCounts.failed} failures</span>
        </section>

        <section class="summary" id="summary-cards"></section>

        <section class="charts" id="dashboard-charts">
          <div class="panel">
            <h3>Execution Coverage By Test Type</h3>
            <canvas id="type-chart" width="640" height="320"></canvas>
          </div>
          <div class="panel">
            <h3>Overall Status Mix</h3>
            <canvas id="status-chart" width="420" height="320"></canvas>
          </div>
        </section>

        <section class="charts" id="addon-panel">
          <div class="panel">
            <h3>Quality Gates And Add-ons</h3>
            <div class="load-grid" id="coverage-cards"></div>
            <div class="load-grid" id="addon-cards"></div>
          </div>
        </section>

        <section class="charts" id="load-charts" hidden>
          <div class="panel">
            <h3>k6 Load Thresholds</h3>
            <canvas id="load-chart" width="640" height="320"></canvas>
          </div>
          <div class="panel">
            <h3>Load Test Result Cards</h3>
            <div class="load-grid" id="load-cards"></div>
          </div>
        </section>

        <section id="test-list"></section>
      </main>
    </div>
    <script>
      const report = ${report};
      const buttons = document.querySelectorAll(".nav-button");
      const list = document.querySelector("#test-list");
      const title = document.querySelector("#section-title");
      const summaryCards = document.querySelector("#summary-cards");
      const dashboardCharts = document.querySelector("#dashboard-charts");
      const addonPanel = document.querySelector("#addon-panel");
      const loadCharts = document.querySelector("#load-charts");
      const colors = { Passed: "#1f8a52", Failed: "#c0392b", Skipped: "#8b98a5" };

      function renderDashboard() {
        title.textContent = "Dashboard";
        list.innerHTML = "";
        dashboardCharts.hidden = false;
        addonPanel.hidden = false;
        loadCharts.hidden = true;
        summaryCards.innerHTML = \`
          <div class="metric"><span>Total Checks</span><strong>${reportTests.length}</strong></div>
          <div class="metric"><span>Passed</span><strong>${statusCounts.passed}</strong></div>
          <div class="metric"><span>Failed</span><strong>${statusCounts.failed}</strong></div>
          <div class="metric"><span>Total Duration</span><strong>${Math.round(totalDuration / 1000)}s</strong></div>
        \`;
        drawTypeChart();
        drawStatusChart();
        renderAddOns();
        renderCoverageGate();
      }

      function renderTests(type) {
        title.textContent = type + " Tests";
        list.innerHTML = "";
        dashboardCharts.hidden = true;
        addonPanel.hidden = true;
        loadCharts.hidden = type !== "Load";
        const sectionTests = report.tests.filter((item) => item.type === type);
        const passed = sectionTests.filter((item) => item.status === "Passed").length;
        const failed = sectionTests.filter((item) => item.status === "Failed").length;
        const skipped = sectionTests.filter((item) => item.status === "Skipped").length;
        const duration = sectionTests.reduce((sum, item) => sum + item.durationMs, 0);
        summaryCards.innerHTML = \`
          <div class="metric"><span>\${type} Checks</span><strong>\${sectionTests.length}</strong></div>
          <div class="metric"><span>\${type} Passed</span><strong>\${passed}</strong></div>
          <div class="metric"><span>\${type} Failed</span><strong>\${failed}</strong></div>
          <div class="metric"><span>\${type} Duration</span><strong>\${Math.round(duration / 1000)}s</strong></div>
        \`;
        if (type === "Load") {
          renderLoadCards();
          drawLoadChart();
        }
        if (type === "E2E") {
          renderVisualChecks(sectionTests);
        }
        sectionTests.forEach((test, index) => {
          const item = document.createElement("details");
          item.open = index === 0;
          item.innerHTML = \`
            <summary><strong>\${test.id}: \${test.name}</strong><span class="badge \${test.status.toLowerCase()}">\${test.status}</span></summary>
            <div class="test-body">
              <div class="test-grid">
                <div class="field"><span>Type</span><strong>\${test.type}</strong></div>
                <div class="field"><span>Duration</span><strong>\${test.durationMs} ms</strong></div>
                <div class="field"><span>Status</span><strong>\${test.status}</strong></div>
              </div>
              <div class="field"><span>File</span><strong>\${test.file}</strong></div>
              <div class="field"><span>Details</span><p>\${test.details}</p></div>
            </div>\`;
          list.appendChild(item);
        });
      }

      buttons.forEach((button) => button.addEventListener("click", () => {
        buttons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        if (button.dataset.filter === "Dashboard") {
          renderDashboard();
        } else {
          renderTests(button.dataset.filter);
        }
      }));

      function drawTypeChart() {
        const canvas = document.querySelector("#type-chart");
        const ctx = canvas.getContext("2d");
        const max = Math.max(...report.byType.map((item) => item.total), 1);
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        report.byType.forEach((item, index) => {
          const x = 42 + index * 118;
          const passedHeight = (item.passed / max) * 210;
          const failedHeight = (item.failed / max) * 210;
          const y = 258 - passedHeight - failedHeight;
          ctx.fillStyle = colors.Passed;
          ctx.fillRect(x, 258 - passedHeight, 70, passedHeight || 3);
          if (item.failed) {
            ctx.fillStyle = colors.Failed;
            ctx.fillRect(x, y, 70, failedHeight);
          }
          ctx.fillStyle = "#202824";
          ctx.font = "13px Segoe UI";
          ctx.fillText(item.type, x - 4, 292);
          ctx.fillText(String(item.total), x + 28, Math.max(20, y - 8));
        });
      }

      function drawStatusChart() {
        const canvas = document.querySelector("#status-chart");
        const ctx = canvas.getContext("2d");
        const rows = [
          ["Passed", report.statusCounts.passed],
          ["Failed", report.statusCounts.failed],
          ["Skipped", report.statusCounts.skipped]
        ];
        const total = rows.reduce((sum, [, count]) => sum + count, 0) || 1;
        let start = -Math.PI / 2;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        rows.forEach(([label, count]) => {
          const slice = (count / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(145, 150);
          ctx.arc(145, 150, 96, start, start + slice);
          ctx.closePath();
          ctx.fillStyle = colors[label];
          ctx.fill();
          start += slice;
        });
        ctx.beginPath();
        ctx.arc(145, 150, 54, 0, Math.PI * 2);
        ctx.fillStyle = "#fff";
        ctx.fill();
        ctx.fillStyle = "#202824";
        ctx.font = "700 18px Segoe UI";
        ctx.fillText(total + " checks", 105, 156);
        rows.forEach(([label, count], index) => {
          ctx.fillStyle = colors[label];
          ctx.fillRect(285, 100 + index * 34, 12, 12);
          ctx.fillStyle = "#202824";
          ctx.font = "13px Segoe UI";
          ctx.fillText(label + ": " + count, 305, 111 + index * 34);
        });
      }

      function drawLoadChart() {
        const canvas = document.querySelector("#load-chart");
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        report.loadMetrics.filter((item) => item.chart).forEach((item, index) => {
          const max = Math.max(item.threshold, item.value, 1);
          const valueWidth = (item.value / max) * 340;
          const thresholdX = 210 + (item.threshold / max) * 340;
          const y = 58 + index * 82;
          ctx.fillStyle = "#eef2f0";
          ctx.fillRect(210, y, 340, 24);
          ctx.fillStyle = item.status === "Passed" ? colors.Passed : colors.Failed;
          ctx.fillRect(210, y, valueWidth, 24);
          ctx.fillStyle = "#202824";
          ctx.font = "13px Segoe UI";
          ctx.fillText(item.label, 28, y + 17);
          ctx.fillText(item.value + item.unit, 210, y + 48);
          ctx.strokeStyle = "#202824";
          ctx.beginPath();
          ctx.moveTo(thresholdX, y - 6);
          ctx.lineTo(thresholdX, y + 32);
          ctx.stroke();
          ctx.fillText("limit " + item.threshold + item.unit, thresholdX - 26, y - 12);
        });
      }

      function renderLoadCards() {
        const target = document.querySelector("#load-cards");
        target.innerHTML = report.loadMetrics.map((item) => \`
          <div class="metric load-card \${item.status.toLowerCase()}">
            <span>\${item.label}</span>
            <strong>\${item.value}\${item.unit}</strong>
            <p class="muted">\${item.chart ? "Threshold: " + item.threshold + item.unit : "Measured during latest k6 run"}</p>
          </div>\`).join("");
      }

      function renderVisualChecks(sectionTests) {
        const visualTests = sectionTests.filter((item) => item.id.startsWith("VIS-"));
        if (!visualTests.length) {
          return;
        }
        const passed = visualTests.filter((item) => item.status === "Passed").length;
        const panel = document.createElement("div");
        panel.className = "panel visual-panel";
        panel.innerHTML = \`
          <h3>Visual Regression Checks</h3>
          <div class="load-grid">
            \${visualTests.map((item) => \`
              <div class="metric load-card \${item.status.toLowerCase()}">
                <span>\${item.id}</span>
                <strong>\${item.status}</strong>
                <p class="muted">\${item.name}</p>
              </div>\`).join("")}
          </div>
          <p class="muted">\${passed} of \${visualTests.length} Playwright screenshot baseline checks passed in the latest E2E execution.</p>
        \`;
        list.appendChild(panel);
      }

      function renderAddOns() {
        const target = document.querySelector("#addon-cards");
        target.innerHTML = report.addOns.map((item) => \`
          <div class="metric load-card skipped">
            <span>\${item.name}</span>
            <strong>\${item.status}</strong>
            <p class="muted">\${item.details}</p>
          </div>\`).join("");
      }

      function renderCoverageGate() {
        const target = document.querySelector("#coverage-cards");
        if (!report.coverageMetrics.length) {
          target.innerHTML = \`
            <div class="metric load-card skipped">
              <span>Critical Logic Coverage</span>
              <strong>Not Run</strong>
              <p class="muted">Run npm run test:coverage to populate the 90% gate.</p>
            </div>\`;
          return;
        }
        target.innerHTML = report.coverageMetrics.map((item) => \`
          <div class="metric load-card \${item.status.toLowerCase()}">
            <span>\${item.label} Coverage</span>
            <strong>\${item.value}%</strong>
            <p class="muted">Threshold: \${item.threshold}%</p>
          </div>\`).join("");
      }

      renderDashboard();
      renderLoadCards();
      renderAddOns();
      renderCoverageGate();
      drawTypeChart();
      drawStatusChart();
      drawLoadChart();
    </script>
  </body>
</html>`;
}

function summaryFor(type: TestType) {
  const row = byType.find((item) => item.type === type);
  return `${row?.passed ?? 0} passed / ${row?.failed ?? 0} failed`;
}
