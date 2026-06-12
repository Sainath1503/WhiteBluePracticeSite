import { z } from "zod";

export const orderSchema = z.object({
  items: z.array(
    z.object({
      menuItemId: z.string().min(1),
      quantity: z.number().int().min(1).max(20)
    })
  ),
  paymentToken: z.string().min(1),
  cardId: z.string().min(1),
  customerName: z.string().trim().min(1)
});
