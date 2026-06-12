export class OrderValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrderValidationError";
  }
}

export class PaymentFailedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentFailedError";
  }
}
