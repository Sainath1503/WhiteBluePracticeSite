import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { CustomerAuthError, CustomerDatabase, type AuthenticatedCustomer } from "./data/customerDatabase.js";
import { menu } from "./data/menu.js";
import { OrderValidationError, PaymentFailedError } from "./errors.js";
import { orderSchema } from "./schemas/orderSchema.js";
import { OrderService } from "./services/orderService.js";
import { FakePaymentGateway } from "./services/paymentService.js";
import { whiteBlueOpenApiSpec } from "./openapi.js";

const serviceName = "whiteblue-hardware-test-site";

const authSchema = z.object({
  tenantKey: z.string().trim().min(1),
  username: z.string().trim().min(1),
  password: z.string().min(1)
});

const registerSchema = authSchema.extend({
  tenantName: z.string().trim().optional(),
  fullName: z.string().trim().min(1),
  email: z.string().trim().email().optional().or(z.literal(""))
});

type SessionRecord = {
  customer: AuthenticatedCustomer;
  createdAt: string;
};

const sessions = new Map<string, SessionRecord>();

export function createApp(
  orderService = new OrderService(menu, new FakePaymentGateway()),
  customerDatabase = new CustomerDatabase()
) {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static("public"));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: serviceName });
  });

  app.get("/openapi.json", (_request, response) => {
    response.json(whiteBlueOpenApiSpec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(whiteBlueOpenApiSpec));

  app.get("/menu", (_request, response) => {
    response.json({ items: menu });
  });

  app.post("/api/register", async (request, response, next) => {
    try {
      const payload = registerSchema.parse(request.body);
      const customer = await customerDatabase.registerCustomer(payload);
      const sessionToken = createSession(customer);
      response.status(201).json({ sessionToken, customer });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/login", async (request, response, next) => {
    try {
      const payload = authSchema.parse(request.body);
      const customer = await customerDatabase.validateLogin(payload);
      const sessionToken = createSession(customer);
      response.json({ sessionToken, customer });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/me", (request, response) => {
    const session = getSession(request);
    if (!session) {
      response.status(401).json({ error: "Unauthorized", details: "Login is required" });
      return;
    }

    response.json({ customer: session.customer });
  });

  app.get("/api/customers/:tenantKey/:username", async (request, response, next) => {
    try {
      const customer = await customerDatabase.findCustomerByUsername(request.params.tenantKey, request.params.username);
      if (!customer) {
        response.status(404).json({ error: "Customer not found" });
        return;
      }

      response.json({ customer });
    } catch (error) {
      next(error);
    }
  });

  app.post("/order", async (request, response, next) => {
    try {
      const session = getSession(request);
      const payload = orderSchema.parse(request.body);
      const receipt = await orderService.createOrder({
        ...payload,
        customerName: session?.customer.fullName ?? payload.customerName
      });
      response.status(201).json(receipt);
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError || error instanceof OrderValidationError) {
      response.status(400).json({ error: "Invalid order", details: error.message });
      return;
    }

    if (error instanceof CustomerAuthError) {
      response.status(400).json({ error: "Customer authentication failed", details: error.message });
      return;
    }

    if (error instanceof PaymentFailedError) {
      response.status(402).json({ error: "Payment failed", details: error.message });
      return;
    }

    response.status(500).json({ error: "Internal server error" });
  });

  return app;
}

function createSession(customer: AuthenticatedCustomer): string {
  const sessionToken = randomUUID();
  sessions.set(sessionToken, { customer, createdAt: new Date().toISOString() });
  return sessionToken;
}

function getSession(request: express.Request): SessionRecord | undefined {
  const headerValue = request.header("x-whiteblue-session");
  if (!headerValue) return undefined;
  return sessions.get(headerValue);
}
