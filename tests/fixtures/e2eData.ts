export type E2eCheckoutScenario = {
  itemName: string;
  cartLine: string;
  cartTotal: string;
  customerName: string;
  cvv: string;
};

export type E2ePaymentCard = {
  id: string;
  holderName: string;
  number: string;
  maskedNumber: string;
  label: string;
  cvv: string;
};

export function createApprovedCheckout(): E2eCheckoutScenario {
  return {
    itemName: "Ryzen 7 Processor",
    cartLine: "1 x Ryzen 7 Processor",
    cartTotal: "$299.00",
    customerName: "WhiteBlue Demo User",
    cvv: "123"
  };
}

export function createDeclinedPaymentCard(): E2ePaymentCard {
  return {
    id: "declined-card",
    holderName: "WhiteBlue Demo User",
    number: "4000 0000 0000 8911",
    maskedNumber: "xxxx-xxxx-xxxx-8911",
    label: "xxxx-xxxx-xxxx-8911 (Declined)",
    cvv: "999"
  };
}

export function createFakePaymentCard(): E2ePaymentCard {
  return {
    id: "custom-card",
    holderName: "Jordan Lee",
    number: "4111 1111 1111 2222",
    maskedNumber: "xxxx-xxxx-xxxx-2222",
    label: "xxxx-xxxx-xxxx-2222 (Fake Payment Card)",
    cvv: "123"
  };
}
