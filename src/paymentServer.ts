import { createPaymentApp } from "./paymentApp.js";

const port = Number(process.env.PAYMENT_PORT ?? 4174);

createPaymentApp().listen(port, "127.0.0.1", () => {
  console.log(`WhiteBlue Payment Gateway running on http://127.0.0.1:${port}`);
});
