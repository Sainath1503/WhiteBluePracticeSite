import type { PaymentGateway, PaymentResult } from "../domain/types.js";

const approvedGatewayTokenPrefix = "gateway_paid_card:";

export function createGatewayPaymentToken(cardId: string, paymentId: string): string {
  return `${approvedGatewayTokenPrefix}${encodeURIComponent(cardId)}:${paymentId}`;
}

export class FakePaymentGateway implements PaymentGateway {
  private readonly usedPaymentTokens = new Set<string>();

  async charge(amount: number, paymentToken: string, cardId: string): Promise<PaymentResult> {
    if (amount <= 0) {
      return { status: "failed", reason: "Amount must be greater than zero" };
    }

    if (paymentToken.startsWith("gateway_declined_") || paymentToken === "tok_fail") {
      return { status: "failed", reason: "Payment authorization failed" };
    }

    if (!paymentToken.startsWith(approvedGatewayTokenPrefix)) {
      return { status: "failed", reason: "Payment was not completed through WhiteBlue Payment Gateway" };
    }

    const payment = parseApprovedToken(paymentToken);
    if (!payment) {
      return { status: "failed", reason: "Payment was not completed through WhiteBlue Payment Gateway" };
    }

    if (payment.cardId !== cardId) {
      return { status: "failed", reason: "Payment token does not match submitted card" };
    }

    if (this.usedPaymentTokens.has(paymentToken)) {
      return { status: "failed", reason: "Payment token has already been used" };
    }

    this.usedPaymentTokens.add(paymentToken);

    return {
      status: "paid",
      paymentId: `pay_${payment.paymentId}`
    };
  }
}

function parseApprovedToken(paymentToken: string): { cardId: string; paymentId: string } | undefined {
  const tokenBody = paymentToken.slice(approvedGatewayTokenPrefix.length);
  const separatorIndex = tokenBody.indexOf(":");
  if (separatorIndex <= 0 || separatorIndex === tokenBody.length - 1) {
    return undefined;
  }

  return {
    cardId: decodeURIComponent(tokenBody.slice(0, separatorIndex)),
    paymentId: tokenBody.slice(separatorIndex + 1)
  };
}
