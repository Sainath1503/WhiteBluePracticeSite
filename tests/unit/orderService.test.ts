import { describe, expect, it, vi } from "vitest";
import { menu } from "../../src/data/menu.js";
import type { PaymentGateway, PaymentResult } from "../../src/domain/types.js";
import { OrderValidationError, PaymentFailedError } from "../../src/errors.js";
import { OrderService } from "../../src/services/orderService.js";
import { createInvalidOrder, createOrder } from "../fixtures/orderFactory.js";

function gateway(overrides: Partial<PaymentGateway> = {}): PaymentGateway {
  return {
    charge: vi.fn(async (): Promise<PaymentResult> => ({ status: "paid", paymentId: "pay_test" })),
    ...overrides
  };
}

describe("OrderService", () => {
  it("calculates totals and calls payment with the exact total", async () => {
    const paymentGateway = gateway();
    const service = new OrderService(menu, paymentGateway);

    const receipt = await service.createOrder(
      createOrder([
        { menuItemId: "cpu-ryzen-7", quantity: 2 },
        { menuItemId: "monitor-27-qhd", quantity: 1 }
      ])
    );

    expect(receipt.total).toBe(847);
    expect(receipt.items).toEqual([
      {
        menuItemId: "cpu-ryzen-7",
        name: "Ryzen 7 Processor",
        quantity: 2,
        unitPrice: 299,
        lineTotal: 598
      },
      {
        menuItemId: "monitor-27-qhd",
        name: "27-inch QHD Monitor",
        quantity: 1,
        unitPrice: 249,
        lineTotal: 249
      }
    ]);
    expect(paymentGateway.charge).toHaveBeenCalledWith(
      847,
      expect.stringMatching(/^gateway_paid_card:approved-card:test\d+$/),
      "approved-card"
    );
    expect(receipt.customerName).toBe("WhiteBlue Demo User");
  });

  it("rejects unknown menu items", async () => {
    const service = new OrderService(menu, gateway());

    await expect(
      service.createOrder(createInvalidOrder())
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("rejects unavailable menu items", async () => {
    const service = new OrderService(menu, gateway());

    await expect(
      service.createOrder(createOrder([{ menuItemId: "ssd-2tb-nvme", quantity: 1 }]))
    ).rejects.toBeInstanceOf(OrderValidationError);
  });

  it("surfaces payment failures", async () => {
    const service = new OrderService(
      menu,
      gateway({
        charge: vi.fn(
          async (): Promise<PaymentResult> => ({ status: "failed", reason: "Payment authorization failed" })
        )
      })
    );

    await expect(
      service.createOrder(createOrder([{ menuItemId: "gpu-rtx-4070", quantity: 1 }]))
    ).rejects.toBeInstanceOf(PaymentFailedError);
  });
});
