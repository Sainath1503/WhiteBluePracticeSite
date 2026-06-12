import { describe, expect, it } from "vitest";
import { createGatewayPaymentToken, FakePaymentGateway } from "../../src/services/paymentService.js";

describe("FakePaymentGateway", () => {
  const gateway = new FakePaymentGateway();

  it("rejects non-positive payment amounts", async () => {
    await expect(gateway.charge(0, createGatewayPaymentToken("approved-card", "test123"), "approved-card")).resolves.toEqual({
      status: "failed",
      reason: "Amount must be greater than zero"
    });
  });

  it("rejects declined gateway tokens", async () => {
    await expect(gateway.charge(9.5, "gateway_declined_test123", "declined-card")).resolves.toEqual({
      status: "failed",
      reason: "Payment authorization failed"
    });
  });

  it("rejects tokens that did not come from the gateway", async () => {
    await expect(gateway.charge(9.5, "not-a-gateway-token", "approved-card")).resolves.toEqual({
      status: "failed",
      reason: "Payment was not completed through WhiteBlue Payment Gateway"
    });
  });

  it("creates a payment id from approved gateway tokens", async () => {
    await expect(gateway.charge(9.5, createGatewayPaymentToken("approved-card", "test-approved"), "approved-card")).resolves.toEqual({
      status: "paid",
      paymentId: "pay_test-approved"
    });
  });

  it("rejects approved gateway tokens bound to a different card", async () => {
    await expect(
      gateway.charge(9.5, createGatewayPaymentToken("approved-card", "wrong-card-test"), "declined-card")
    ).resolves.toEqual({
      status: "failed",
      reason: "Payment token does not match submitted card"
    });
  });

  it("rejects a replayed approved payment token", async () => {
    const token = createGatewayPaymentToken("approved-card", "replay_test");

    await expect(gateway.charge(9.5, token, "approved-card")).resolves.toEqual({
      status: "paid",
      paymentId: "pay_replay_test"
    });
    await expect(gateway.charge(9.5, token, "approved-card")).resolves.toEqual({
      status: "failed",
      reason: "Payment token has already been used"
    });
  });
});
