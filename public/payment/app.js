const selectedCard = document.querySelector("#selected-card");
const paymentAmount = document.querySelector("#payment-amount");
const gatewayForm = document.querySelector("#gateway-form");
const cardholder = document.querySelector("#cardholder");
const cvv = document.querySelector("#cvv");
const cancelButton = document.querySelector("#cancel-button");
const gatewayMessage = document.querySelector("#gateway-message");

const params = new URLSearchParams(window.location.search);
const amount = Number(params.get("amount") ?? 0);
const maskedNumber = params.get("maskedNumber") ?? "xxxx-xxxx-xxxx-0000";
const outcome = params.get("outcome") ?? "approved";
const returnUrl = params.get("returnUrl") ?? "http://127.0.0.1:4173/";

selectedCard.textContent = maskedNumber;
paymentAmount.textContent = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
cardholder.value = params.get("cardholder") ?? "";

gatewayForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!cardholder.value.trim() || !/^\d{3,4}$/.test(cvv.value)) {
    gatewayMessage.textContent = "Enter the card user name and a valid 3 or 4 digit CVV.";
    gatewayMessage.className = "message error";
    return;
  }

  gatewayMessage.textContent = "Processing through WhiteBlue Payment Gateway...";
  gatewayMessage.className = "message";

  await new Promise((resolve) => setTimeout(resolve, 600));

  if (outcome === "declined") {
    gatewayMessage.textContent = `Payment declined for ${maskedNumber}.`;
    gatewayMessage.className = "message error";
    return;
  }

  const paymentId = `${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  gatewayMessage.textContent = `Payment approved for ${maskedNumber}. Returning to WhiteBlue...`;
  gatewayMessage.className = "message success";

  const callback = new URL(returnUrl);
  callback.searchParams.set("gatewayStatus", "paid");
  callback.searchParams.set("paymentId", paymentId);
  window.location.href = callback.toString();
});

cancelButton.addEventListener("click", () => {
  const callback = new URL(returnUrl);
  callback.searchParams.set("gatewayStatus", "cancelled");
  window.location.href = callback.toString();
});
