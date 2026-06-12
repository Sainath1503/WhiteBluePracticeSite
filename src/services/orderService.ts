import { randomUUID } from "node:crypto";
import type { MenuItem, OrderReceipt, OrderRepository, OrderRequest, PaymentGateway } from "../domain/types.js";
import { OrderValidationError, PaymentFailedError } from "../errors.js";
import { createAiSuggestion } from "./recommendationService.js";

export class OrderService {
  constructor(
    private readonly menu: MenuItem[],
    private readonly paymentGateway: PaymentGateway,
    private readonly orderRepository?: OrderRepository
  ) {}

  async createOrder(request: OrderRequest): Promise<OrderReceipt> {
    const lines = this.validateAndPrice(request);
    const total = roundMoney(lines.reduce((sum, line) => sum + line.lineTotal, 0));
    const payment = await this.paymentGateway.charge(total, request.paymentToken, request.cardId);

    if (payment.status === "failed") {
      throw new PaymentFailedError(payment.reason);
    }

    const receipt: OrderReceipt = {
      orderId: randomUUID(),
      items: lines,
      total,
      paymentStatus: "paid",
      paymentId: payment.paymentId,
      customerName: request.customerName,
      aiSuggestion: createAiSuggestion(request.items, this.menu)
    };

    await this.orderRepository?.save(receipt);

    return receipt;
  }

  private validateAndPrice(request: OrderRequest): OrderReceipt["items"] {
    if (!request.items.length) {
      throw new OrderValidationError("Order must contain at least one item");
    }

    return request.items.map((line) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 20) {
        throw new OrderValidationError("Quantity must be an integer between 1 and 20");
      }

      const menuItem = this.menu.find((item) => item.id === line.menuItemId);
      if (!menuItem) {
        throw new OrderValidationError(`Unknown menu item: ${line.menuItemId}`);
      }

      if (!menuItem.available) {
        throw new OrderValidationError(`Menu item is currently unavailable: ${line.menuItemId}`);
      }

      return {
        menuItemId: menuItem.id,
        name: menuItem.name,
        quantity: line.quantity,
        unitPrice: menuItem.price,
        lineTotal: roundMoney(menuItem.price * line.quantity)
      };
    });
  }
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
