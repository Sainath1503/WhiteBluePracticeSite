import request from "supertest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createApp } from "../../src/app.js";
import { CustomerDatabase } from "../../src/data/customerDatabase.js";
import {
  createBoundaryQuantityOrder,
  createDeclinedPaymentOrder,
  createDuplicateItemOrder,
  createEmptyOrder,
  createInvalidOrder,
  createOrder,
  createRandomOrder
} from "../fixtures/orderFactory.js";

describe("WhiteBlue API", () => {
  const app = createApp();

  it("GET /health returns service health metadata", async () => {
    const response = await request(app).get("/health").expect(200);

    expect(response.body).toEqual({
      status: "ok",
      service: "whiteblue-hardware-test-site"
    });
  });

  it("GET /menu returns a stable hardware catalog contract", async () => {
    const response = await request(app).get("/menu").expect(200);

    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "cpu-ryzen-7",
          name: "Ryzen 7 Processor",
          price: 299,
          category: "component",
          available: true
        })
      ])
    );
  });

  it("GET /openapi.json returns Swagger documentation", async () => {
    const response = await request(app).get("/openapi.json").expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        openapi: "3.0.3",
        info: expect.objectContaining({ title: "WhiteBlue Hardware Test Site API" }),
        paths: expect.objectContaining({
          "/menu": expect.any(Object),
          "/order": expect.any(Object)
        })
      })
    );
  });

  it("GET /api-docs serves the local Express Swagger UI fallback", async () => {
    const response = await request(app).get("/api-docs/").expect(200);

    expect(response.text).toContain("WhiteBlue Swagger API Docs");
    expect(response.text).toContain('url: "/openapi.json"');
  });

  it("stores customers in Firebase Realtime Database and supports register/login/session lookup", async () => {
    const appWithCustomerDb = createApp(undefined, new CustomerDatabase("https://whiteblue.test", createFirebaseFetch()));

    const registration = await request(appWithCustomerDb)
      .post("/api/register")
      .send({
        tenantKey: "acme-labs",
        tenantName: "Acme Labs",
        fullName: "Taylor Jordan",
        email: "taylor@example.com",
        username: "tjordan",
        password: "correct-horse-42"
      })
      .expect(201);

    expect(registration.body).toEqual(
      expect.objectContaining({
        sessionToken: expect.any(String),
        customer: expect.objectContaining({
          tenantKey: "acme-labs",
          username: "tjordan",
          fullName: "Taylor Jordan"
        })
      })
    );

    const login = await request(appWithCustomerDb)
      .post("/api/login")
      .send({
        tenantKey: "acme-labs",
        username: "tjordan",
        password: "correct-horse-42"
      })
      .expect(200);

    await request(appWithCustomerDb)
      .get("/api/me")
      .set("x-whiteblue-session", login.body.sessionToken)
      .expect(200)
      .expect((response) => {
        expect(response.body.customer.fullName).toBe("Taylor Jordan");
      });

    await request(appWithCustomerDb)
      .get("/api/customers/acme-labs/tjordan")
      .expect(200)
      .expect((response) => {
        expect(response.body.customer).toEqual(
          expect.objectContaining({
            username: "tjordan",
            email: "taylor@example.com"
          })
        );
        expect(response.body.customer.passwordHash).toBeUndefined();
      });
  });

  it("static Swagger page loads the OpenAPI spec from /openapi.json", () => {
    const staticSwaggerPage = readFileSync(resolve("public/api-docs/index.html"), "utf8");

    expect(staticSwaggerPage).toContain("WhiteBlue Swagger API Docs");
    expect(staticSwaggerPage).toContain('url: "/openapi.json"');
    expect(staticSwaggerPage).toContain("/api-docs/swagger-overrides.css");
  });

  it("POST /order creates a paid receipt", async () => {
    const response = await request(app)
      .post("/order")
      .send(
        createOrder([
          { menuItemId: "gpu-rtx-4070", quantity: 1 },
          { menuItemId: "keyboard-mechanical", quantity: 2 }
        ])
      )
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        total: 777,
        paymentStatus: "paid",
        paymentId: expect.stringMatching(/^pay_/),
        customerName: "WhiteBlue Demo User",
        aiSuggestion: expect.any(String)
      })
    );
  });

  it("POST /order rejects invalid menu items", async () => {
    const response = await request(app)
      .post("/order")
      .send(createInvalidOrder())
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order rejects an empty order", async () => {
    const response = await request(app)
      .post("/order")
      .send(createEmptyOrder())
      .expect(400);

    expect(response.body).toEqual({
      error: "Invalid order",
      details: "Order must contain at least one item"
    });
  });

  it("POST /order ignores manipulated client-side prices and uses server catalog prices", async () => {
    const response = await request(app)
      .post("/order")
      .send({
        ...createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 2 }]),
        items: [{ menuItemId: "cpu-ryzen-7", quantity: 2, price: 0.01 }]
      })
      .expect(201);

    expect(response.body.total).toBe(598);
    expect(response.body.items).toEqual([
      expect.objectContaining({
        menuItemId: "cpu-ryzen-7",
        quantity: 2,
        unitPrice: 299,
        lineTotal: 598
      })
    ]);
  });

  it("POST /order rejects decimal quantities sent directly to the API", async () => {
    const response = await request(app)
      .post("/order")
      .send({
        ...createOrder(),
        items: [{ menuItemId: "cpu-ryzen-7", quantity: 1.5 }]
      })
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order rejects negative quantities sent directly to the API", async () => {
    const response = await request(app)
      .post("/order")
      .send({
        ...createOrder(),
        items: [{ menuItemId: "cpu-ryzen-7", quantity: -1 }]
      })
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order rejects zero quantities sent directly to the API", async () => {
    const response = await request(app)
      .post("/order")
      .send({
        ...createOrder(),
        items: [{ menuItemId: "cpu-ryzen-7", quantity: 0 }]
      })
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order rejects quantities above the supported limit", async () => {
    const response = await request(app)
      .post("/order")
      .send(createBoundaryQuantityOrder(21))
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order rejects sold-out items even if the client submits them directly", async () => {
    const response = await request(app)
      .post("/order")
      .send(createOrder([{ menuItemId: "ssd-2tb-nvme", quantity: 1 }]))
      .expect(400);

    expect(response.body).toEqual({
      error: "Invalid order",
      details: "Menu item is currently unavailable: ssd-2tb-nvme"
    });
  });

  it("POST /order rejects replayed payment tokens", async () => {
    const order = createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 1 }]);

    await request(app).post("/order").send(order).expect(201);

    const response = await request(app).post("/order").send(order).expect(402);

    expect(response.body).toEqual({
      error: "Payment failed",
      details: "Payment token has already been used"
    });
  });

  it("POST /order rejects a payment token bound to a different card ID", async () => {
    const order = {
      ...createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 1 }]),
      cardId: "declined-card"
    };

    const response = await request(app).post("/order").send(order).expect(402);

    expect(response.body).toEqual({
      error: "Payment failed",
      details: "Payment token does not match submitted card"
    });
  });

  it("POST /order handles duplicate item lines with a correct total", async () => {
    const response = await request(app).post("/order").send(createDuplicateItemOrder()).expect(201);

    expect(response.body.total).toBe(897);
    expect(response.body.items).toHaveLength(2);
  });

  it("POST /order accepts a large boundary order", async () => {
    const response = await request(app).post("/order").send(createBoundaryQuantityOrder(20)).expect(201);

    expect(response.body.total).toBe(5980);
  });

  it("POST /order rejects invalid payload shapes", async () => {
    const response = await request(app)
      .post("/order")
      .send({
        paymentToken: "gateway_paid_test123",
        items: { menuItemId: "cpu-ryzen-7", quantity: 1 }
      })
      .expect(400);

    expect(response.body.error).toBe("Invalid order");
  });

  it("POST /order accepts deterministic randomized order data", async () => {
    const response = await request(app).post("/order").send(createRandomOrder(7)).expect(201);

    expect(response.body.items.length).toBeGreaterThan(0);
    expect(response.body.total).toBeGreaterThan(0);
  });

  it("POST /order returns payment failure without creating a paid order", async () => {
    const response = await request(app)
      .post("/order")
      .send(createDeclinedPaymentOrder())
      .expect(402);

    expect(response.body).toEqual({
      error: "Payment failed",
      details: "Payment authorization failed"
    });
  });
});

function createFirebaseFetch(): typeof fetch {
  const store: Record<string, unknown> = {};

  return async (input, init) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    const path = url.pathname.replace(/^\/|\.json$/g, "").split("/").filter(Boolean);
    const method = init?.method ?? "GET";

    if (method === "GET") {
      return jsonResponse(readPath(store, path) ?? null);
    }

    if (method === "PUT") {
      writePath(store, path, JSON.parse(String(init?.body)));
      return jsonResponse(readPath(store, path));
    }

    if (method === "POST") {
      const key = `event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      writePath(store, [...path, key], JSON.parse(String(init?.body)));
      return jsonResponse({ name: key });
    }

    return new Response(null, { status: 405 });
  };
}

function readPath(store: Record<string, unknown>, path: string[]): unknown {
  return path.reduce<unknown>((current, segment) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, store);
}

function writePath(store: Record<string, unknown>, path: string[], value: unknown): void {
  let current = store;
  for (const segment of path.slice(0, -1)) {
    const next = current[segment];
    if (!next || typeof next !== "object") {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[path[path.length - 1]] = value;
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
