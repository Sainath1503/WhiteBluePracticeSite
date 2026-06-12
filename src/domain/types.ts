export type MenuItem = {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "component" | "accessory" | "peripheral";
  available: boolean;
};

export type OrderLine = {
  menuItemId: string;
  quantity: number;
};

export type OrderRequest = {
  items: OrderLine[];
  paymentToken: string;
  cardId: string;
  customerName: string;
};

export type OrderReceipt = {
  orderId: string;
  items: Array<{
    menuItemId: string;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
  }>;
  total: number;
  paymentStatus: "paid";
  paymentId: string;
  customerName: string;
  aiSuggestion: string;
};

export type PaymentResult =
  | { status: "paid"; paymentId: string }
  | { status: "failed"; reason: string };

export type PaymentGateway = {
  charge(amount: number, paymentToken: string, cardId: string): Promise<PaymentResult>;
};

export type OrderRepository = {
  save(receipt: OrderReceipt): Promise<void>;
};
