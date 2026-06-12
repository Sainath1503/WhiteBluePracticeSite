import { createApp } from "./app.js";
import { createPaymentApp } from "./paymentApp.js";

const appPort = Number(process.env.PORT ?? 4173);
const paymentPort = Number(process.env.PAYMENT_PORT ?? 4174);

createApp().listen(appPort, "127.0.0.1", () => {
  console.log(`WhiteBlue Hardware Test Site running on http://127.0.0.1:${appPort}`);
});

createPaymentApp().listen(paymentPort, "127.0.0.1", () => {
  console.log(`WhiteBlue Payment Gateway running on http://127.0.0.1:${paymentPort}`);
});
