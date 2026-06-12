import { menu } from "../../src/data/menu.js";
import type { OrderLine, OrderRequest } from "../../src/domain/types.js";
import { createGatewayPaymentToken } from "../../src/services/paymentService.js";

let paymentTokenCounter = 0;

export function createOrder(items: OrderLine[] = [{ menuItemId: "cpu-ryzen-7", quantity: 1 }]): OrderRequest {
  paymentTokenCounter += 1;

  return {
    paymentToken: createGatewayPaymentToken("approved-card", `test${paymentTokenCounter}`),
    cardId: "approved-card",
    customerName: "WhiteBlue Demo User",
    items
  };
}

export function createInvalidOrder(): OrderRequest {
  return createOrder([{ menuItemId: "missing-item", quantity: 1 }]);
}

export function createEmptyOrder(): OrderRequest {
  return createOrder([]);
}

export function createDeclinedPaymentOrder(): OrderRequest {
  return {
    ...createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 1 }]),
    paymentToken: "gateway_declined_test123",
    cardId: "declined-card"
  };
}

export function createDuplicateItemOrder(): OrderRequest {
  return createOrder([
    { menuItemId: "cpu-ryzen-7", quantity: 1 },
    { menuItemId: "cpu-ryzen-7", quantity: 2 }
  ]);
}

export function createBoundaryQuantityOrder(quantity: number): OrderRequest {
  return createOrder([{ menuItemId: "cpu-ryzen-7", quantity }]);
}

export function createRandomOrder(seed = 1, lineCount = 3): OrderRequest {
  let state = seed;
  const availableMenu = menu.filter((menuItem) => menuItem.available);
  const lines = Array.from({ length: lineCount }, () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    const menuItem = availableMenu[state % availableMenu.length];
    state = (state * 1664525 + 1013904223) % 4294967296;

    return {
      menuItemId: menuItem.id,
      quantity: (state % 3) + 1
    };
  });

  return createOrder(lines);
}
