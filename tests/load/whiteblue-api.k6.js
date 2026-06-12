import http from "k6/http";
import { check, group, sleep } from "k6";
import { Rate } from "k6/metrics";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:4173";
const orderFailureRate = new Rate("whiteblue_order_failures");

export const options = {
  scenarios: {
    browse_and_order: {
      executor: "ramping-vus",
      stages: [
        { duration: __ENV.RAMP_UP || "15s", target: Number(__ENV.VUS || 5) },
        { duration: __ENV.STEADY_STATE || "30s", target: Number(__ENV.VUS || 5) },
        { duration: __ENV.RAMP_DOWN || "10s", target: 0 }
      ]
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.05"],
    http_req_duration: ["p(95)<500"],
    whiteblue_order_failures: ["rate<0.02"]
  }
};

const orderTemplates = [
  [{ menuItemId: "cpu-ryzen-7", quantity: 1 }],
  [{ menuItemId: "gpu-rtx-4070", quantity: 1 }],
  [
    { menuItemId: "cpu-ryzen-7", quantity: 1 },
    { menuItemId: "monitor-27-qhd", quantity: 1 }
  ],
  [
    { menuItemId: "gpu-rtx-4070", quantity: 1 },
    { menuItemId: "keyboard-mechanical", quantity: 2 }
  ]
];

export default function () {
  group("health check", () => {
    const response = http.get(`${baseUrl}/health`);

    check(response, {
      "health returns 200": (res) => res.status === 200,
      "health status is ok": (res) => res.status === 200 && res.json("status") === "ok"
    });
  });

  group("browse menu", () => {
    const response = http.get(`${baseUrl}/menu`);

    check(response, {
      "menu returns 200": (res) => res.status === 200,
      "menu has items": (res) => res.status === 200 && Array.isArray(res.json("items")) && res.json("items").length > 0
    });
  });

  group("create paid order", () => {
    const order = createOrder();
    const response = http.post(`${baseUrl}/order`, JSON.stringify(order), {
      headers: {
        "Content-Type": "application/json"
      }
    });

    const orderPassed = check(response, {
      "order returns 201": (res) => res.status === 201,
      "order is paid": (res) => res.status === 201 && res.json("paymentStatus") === "paid",
      "order has payment id": (res) => res.status === 201 && /^pay_/.test(String(res.json("paymentId"))),
      "order has positive total": (res) => res.status === 201 && Number(res.json("total")) > 0
    });

    orderFailureRate.add(!orderPassed);
  });

  sleep(Number(__ENV.THINK_TIME_SECONDS || 1));
}

export function handleSummary(data) {
  return {
    stdout: textSummary(data),
    "qa-artifacts/load-test-summary.json": JSON.stringify(data, null, 2)
  };
}

function createOrder() {
  return {
    paymentToken: createGatewayPaymentToken("approved-card", `load_${__VU}_${__ITER}`),
    cardId: "approved-card",
    customerName: "WhiteBlue Load Tester",
    items: orderTemplates[Math.floor(Math.random() * orderTemplates.length)]
  };
}

function createGatewayPaymentToken(cardId, paymentId) {
  return `gateway_paid_card:${encodeURIComponent(cardId)}:${paymentId}`;
}

function textSummary(data) {
  const duration = data.metrics.http_req_duration;
  const failed = data.metrics.http_req_failed;
  const orderFailures = data.metrics.whiteblue_order_failures;

  return [
    "",
    "WhiteBlue k6 load test summary",
    `http_req_duration p95: ${duration?.values?.["p(95)"] ?? "n/a"} ms`,
    `http_req_failed rate: ${failed?.values?.rate ?? "n/a"}`,
    `whiteblue_order_failures rate: ${orderFailures?.values?.rate ?? "n/a"}`,
    "Full JSON summary: qa-artifacts/load-test-summary.json",
    ""
  ].join("\n");
}
