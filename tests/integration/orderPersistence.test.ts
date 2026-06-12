import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from "@testcontainers/postgresql";
import { Pool } from "pg";
import { createApp } from "../../src/app.js";
import { menu } from "../../src/data/menu.js";
import { PostgresOrderRepository } from "../../src/data/postgresOrderRepository.js";
import type { PaymentGateway, PaymentResult } from "../../src/domain/types.js";
import { OrderService } from "../../src/services/orderService.js";
import { createOrder } from "../fixtures/orderFactory.js";

class SuccessfulPaymentGateway implements PaymentGateway {
  async charge(): Promise<PaymentResult> {
    return { status: "paid", paymentId: "pay_testcontainers" };
  }
}

describe("Order persistence with Testcontainers PostgreSQL", () => {
  let container: StartedPostgreSqlContainer;
  let pool: Pool;
  let repository: PostgresOrderRepository;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16-alpine").start();
    pool = new Pool({ connectionString: container.getConnectionUri() });
    repository = new PostgresOrderRepository(pool);
    await repository.migrate();
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    await container?.stop();
  });

  it("persists a paid order created through the API in a real PostgreSQL database", async () => {
    const orderService = new OrderService(menu, new SuccessfulPaymentGateway(), repository);
    const app = createApp(orderService);

    const response = await request(app)
      .post("/order")
      .send(createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 2 }]))
      .expect(201);

    const savedOrder = await repository.findById(response.body.orderId);

    expect(savedOrder).toEqual(
      expect.objectContaining({
        orderId: response.body.orderId,
        total: 19,
        paymentStatus: "paid",
        paymentId: "pay_testcontainers",
        customerName: "WhiteBlue Demo User"
      })
    );
    expect(savedOrder?.items).toEqual([
      expect.objectContaining({
        menuItemId: "cpu-ryzen-7",
        quantity: 2,
        lineTotal: 19
      })
    ]);
  });
});
