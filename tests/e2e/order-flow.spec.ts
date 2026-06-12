import { expect, test, type Page } from "@playwright/test";
import {
  createApprovedCheckout,
  createDeclinedPaymentCard,
  createFakePaymentCard
} from "../fixtures/e2eData.js";

async function attachScreenshot(page: Page, name: string) {
  await test.info().attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png"
  });
}

async function expectStableScreenshot(page: Page, name: string) {
  await expect(page).toHaveScreenshot(name, {
    animations: "disabled",
    fullPage: true,
    maxDiffPixelRatio: 0.1
  });
}

async function registerCustomer(page: Page, suffix: string, fullName = "WhiteBlue Demo User") {
  const uniqueSuffix = `${suffix}-${Date.now()}`;
  await page.goto("/");
  await page.getByRole("link", { name: "Register here" }).click();
  await page.locator("#register-full-name").fill(fullName);
  await page.locator("#register-email").fill(`tester-${uniqueSuffix}@example.com`);
  await page.locator("#register-username").fill(`tester-${uniqueSuffix}`);
  await page.locator("#register-password").fill("correct-horse-42");
  await page.getByRole("button", { name: "Register" }).click();
  await expect(page.getByRole("heading", { name: "Hardware Catalog" })).toBeVisible();
}

test("customer can view menu, pay through the gateway, and open the invoice", async ({ page }) => {
  const checkout = createApprovedCheckout();

  await registerCustomer(page, "approved");

  await expect(page.getByRole("heading", { name: "Hardware Catalog" })).toBeVisible();
  await expect(page.getByText(checkout.itemName)).toBeVisible();
  await attachScreenshot(page, "menu-visible");
  await expectStableScreenshot(page, "menu-visible.png");

  await page.getByRole("button", { name: "Add" }).first().click();
  await expect(page.getByText(checkout.cartLine)).toBeVisible();
  await expect(page.locator("#cart-total")).toHaveText(checkout.cartTotal);
  await attachScreenshot(page, "cart-ready");
  await expectStableScreenshot(page, "cart-ready.png");

  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "WhiteBlue Payment Gateway" })).toBeVisible();
  await expect(page.getByText("xxxx-xxxx-xxxx-6781")).toBeVisible();
  await attachScreenshot(page, "gateway-ready");
  await expectStableScreenshot(page, "gateway-ready.png");

  await page.getByLabel("CVV").fill(checkout.cvv);
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page).toHaveURL(/127\.0\.0\.1:4173/);
  await expect(page.locator("#message")).toContainText(`paid ${checkout.cartTotal}`);
  await expect(page.locator("#message")).toContainText(checkout.customerName);
  await expect(page.locator("#message")).not.toContainText("AI pick");
  await page.getByRole("link", { name: /Open invoice for order/ }).click();
  await expect(page.getByRole("heading", { name: "Invoice" })).toBeVisible();
  await expect(page.locator("#invoice-transaction-id")).toContainText(/^pay_/);
  await expect(page.locator("#invoice-card-last4")).toHaveText("6781");
  await expect(page.locator("#invoice-customer-name")).toHaveText(checkout.customerName);
  await attachScreenshot(page, "paid-receipt");
});

test("customer sees a declined gateway payment failure", async ({ page }) => {
  const declinedCard = createDeclinedPaymentCard();

  await registerCustomer(page, "declined");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.locator("#payment-card").selectOption(declinedCard.id);
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "WhiteBlue Payment Gateway" })).toBeVisible();
  await expect(page.getByText(declinedCard.maskedNumber)).toBeVisible();
  await attachScreenshot(page, "declined-card-gateway");

  await page.getByLabel("CVV").fill(declinedCard.cvv);
  await page.getByRole("button", { name: "Pay" }).click();

  await expect(page.locator("#gateway-message")).toHaveText(`Payment declined for ${declinedCard.maskedNumber}.`);
  await attachScreenshot(page, "declined-payment-message");
});

test("customer can add a fake payment card before launching the gateway", async ({ page }) => {
  const fakeCard = createFakePaymentCard();

  await registerCustomer(page, "fake-card");

  await page.getByRole("button", { name: "Add fake payment card" }).click();
  await page.getByLabel("Card user name").fill(fakeCard.holderName);
  await page.getByLabel("Card number").fill(fakeCard.number);
  await page.getByRole("button", { name: "Save card" }).click();

  await expect(page.locator("#payment-card")).toContainText(fakeCard.label);
  await attachScreenshot(page, "fake-card-saved");

  await page.getByRole("button", { name: "Add" }).first().click();
  await page.getByRole("button", { name: "Pay and create order" }).click();

  await expect(page.getByRole("heading", { name: "WhiteBlue Payment Gateway" })).toBeVisible();
  await expect(page.getByText(fakeCard.maskedNumber)).toBeVisible();
  await expect(page.getByLabel("Card user name")).toHaveValue("WhiteBlue Demo User");
  await attachScreenshot(page, "fake-card-gateway");
});
