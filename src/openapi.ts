type OpenApiDocument = Record<string, unknown>;

export const whiteBlueOpenApiSpec: OpenApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "WhiteBlue Hardware Test Site API",
    version: "1.0.0",
    description:
      "OpenAPI documentation for the WhiteBlue computer hardware ordering API and the WhiteBlue Payment Gateway service."
  },
  servers: [
    {
      url: "/",
      description: "Current WhiteBlue deployment"
    },
    {
      url: "http://127.0.0.1:4173",
      description: "WhiteBlue Hardware Test Site"
    },
    {
      url: "http://127.0.0.1:4174",
      description: "WhiteBlue Payment Gateway"
    }
  ],
  tags: [
    { name: "WhiteBlue App", description: "Hardware catalog and order APIs" },
    { name: "Customer Auth", description: "SQLite-backed tenant customer registration, login, and lookup APIs" },
    { name: "Payment Gateway", description: "Fake payment gateway status and browser handoff" }
  ],
  paths: {
    "/health": {
      get: {
        tags: ["WhiteBlue App", "Payment Gateway"],
        summary: "Check service health",
        description:
          "Both WhiteBlue Hardware Test Site on port 4173 and WhiteBlue Payment Gateway on port 4174 expose GET /health.",
        servers: [{ url: "/" }],
        responses: {
          "200": {
            description: "Service is running",
            content: {
              "application/json": {
                schema: {
                  oneOf: [
                    { $ref: "#/components/schemas/AppHealth" },
                    { $ref: "#/components/schemas/PaymentGatewayHealth" }
                  ]
                },
                examples: {
                  app: {
                    summary: "WhiteBlue app",
                    value: { status: "ok" }
                  },
                  paymentGateway: {
                    summary: "WhiteBlue Payment Gateway",
                    value: { status: "ok", service: "WhiteBlue Payment Gateway" }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/register": {
      post: {
        tags: ["Customer Auth"],
        summary: "Register a tenant customer",
        description:
          "Creates the embedded SQLite customer tables at runtime when needed, inserts the tenant/customer record, stores a salted password hash, and returns a session token.",
        servers: [{ url: "/" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterCustomerRequest" },
              example: {
                tenantKey: "whiteblue",
                tenantName: "WhiteBlue",
                fullName: "WhiteBlue Demo User",
                email: "demo@whiteblue.test",
                username: "demo.user",
                password: "correct-horse-42"
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Customer registered and logged in",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionResponse" }
              }
            }
          },
          "400": {
            description: "Invalid registration data or duplicate tenant username",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Customer authentication failed", details: "Username already exists for this tenant" }
              }
            }
          }
        }
      }
    },
    "/api/login": {
      post: {
        tags: ["Customer Auth"],
        summary: "Validate customer login",
        description:
          "Reads the customer credentials from the embedded SQLite database and validates the supplied password against the stored salted hash.",
        servers: [{ url: "/" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginCustomerRequest" },
              example: {
                tenantKey: "whiteblue",
                username: "demo.user",
                password: "correct-horse-42"
              }
            }
          }
        },
        responses: {
          "200": {
            description: "Login accepted",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AuthSessionResponse" }
              }
            }
          },
          "400": {
            description: "Invalid credentials",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Customer authentication failed", details: "Invalid username or password" }
              }
            }
          }
        }
      }
    },
    "/api/me": {
      get: {
        tags: ["Customer Auth"],
        summary: "Read current logged-in customer",
        description: "Looks up the in-memory session created by login or registration and returns the customer profile.",
        servers: [{ url: "/" }],
        parameters: [
          {
            name: "x-whiteblue-session",
            in: "header",
            required: true,
            schema: { type: "string", format: "uuid" },
            description: "Session token returned from /api/login or /api/register"
          }
        ],
        responses: {
          "200": {
            description: "Current customer profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CustomerResponse" }
              }
            }
          },
          "401": {
            description: "Missing or invalid session token",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Unauthorized", details: "Login is required" }
              }
            }
          }
        }
      }
    },
    "/api/customers/{tenantKey}/{username}": {
      get: {
        tags: ["Customer Auth"],
        summary: "Find customer by tenant and username",
        description:
          "Reads a customer profile from the embedded SQLite database. Password hashes and salts are never returned.",
        servers: [{ url: "/" }],
        parameters: [
          {
            name: "tenantKey",
            in: "path",
            required: true,
            schema: { type: "string", example: "whiteblue" }
          },
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string", example: "demo.user" }
          }
        ],
        responses: {
          "200": {
            description: "Customer profile",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CustomerResponse" }
              }
            }
          },
          "404": {
            description: "Customer not found",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Customer not found" }
              }
            }
          }
        }
      }
    },
    "/menu": {
      get: {
        tags: ["WhiteBlue App"],
        summary: "Fetch hardware catalog",
        servers: [{ url: "/" }],
        responses: {
          "200": {
            description: "Hardware catalog items",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/MenuResponse" }
              }
            }
          }
        }
      }
    },
    "/order": {
      post: {
        tags: ["WhiteBlue App"],
        summary: "Create an order after gateway payment",
        description:
          "Validates hardware catalog items, calculates totals, checks the fake payment token returned by WhiteBlue Payment Gateway, then creates a paid order.",
        servers: [{ url: "/" }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/OrderRequest" },
              examples: {
                approved: {
                  summary: "Approved gateway payment",
                  value: {
                    paymentToken: "gateway_paid_card:approved-card:test123",
                    cardId: "approved-card",
                    customerName: "WhiteBlue Demo User",
                    items: [
                      { menuItemId: "gpu-rtx-4070", quantity: 1 },
                      { menuItemId: "keyboard-mechanical", quantity: 2 }
                    ]
                  }
                },
                declined: {
                  summary: "Declined gateway payment",
                  value: {
                    paymentToken: "gateway_declined_test123",
                    cardId: "declined-card",
                    customerName: "WhiteBlue Demo User",
                    items: [{ menuItemId: "cpu-ryzen-7", quantity: 1 }]
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Paid order receipt",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/OrderReceipt" }
              }
            }
          },
          "400": {
            description: "Invalid order request",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Invalid order", details: "Order must contain at least one item" }
              }
            }
          },
          "402": {
            description: "Payment failed",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" },
                example: { error: "Payment failed", details: "Payment authorization failed" }
              }
            }
          },
          "500": {
            description: "Unexpected server error",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ErrorResponse" }
              }
            }
          }
        }
      }
    },
    "/": {
      get: {
        tags: ["Payment Gateway"],
        summary: "Launch local WhiteBlue Payment Gateway UI",
        description:
          "Local browser page used by the checkout flow when the fake payment gateway runs on port 4174.",
        servers: [{ url: "http://127.0.0.1:4174" }],
        parameters: [
          { name: "amount", in: "query", schema: { type: "number", example: 299 } },
          { name: "cardId", in: "query", schema: { type: "string", example: "approved-card" } },
          {
            name: "maskedNumber",
            in: "query",
            schema: { type: "string", example: "xxxx-xxxx-xxxx-6781" }
          },
          { name: "outcome", in: "query", schema: { type: "string", enum: ["approved", "declined"] } },
          { name: "cardholder", in: "query", schema: { type: "string", example: "WhiteBlue Demo User" } },
          { name: "returnUrl", in: "query", schema: { type: "string", example: "http://127.0.0.1:4173/" } }
        ],
        responses: {
          "200": {
            description: "Payment gateway HTML page"
          }
        }
      }
    },
    "/payment": {
      get: {
        tags: ["Payment Gateway"],
        summary: "Launch deployed WhiteBlue Payment Gateway UI",
        description:
          "Vercel-friendly payment gateway page served from the same WhiteBlue deployment. The main app redirects here with amount, maskedNumber, outcome, cardholder, cardId, and returnUrl query parameters.",
        servers: [{ url: "/" }],
        parameters: [
          { name: "amount", in: "query", schema: { type: "number", example: 299 } },
          { name: "cardId", in: "query", schema: { type: "string", example: "approved-card" } },
          {
            name: "maskedNumber",
            in: "query",
            schema: { type: "string", example: "xxxx-xxxx-xxxx-6781" }
          },
          { name: "outcome", in: "query", schema: { type: "string", enum: ["approved", "declined"] } },
          { name: "cardholder", in: "query", schema: { type: "string", example: "WhiteBlue Demo User" } },
          { name: "returnUrl", in: "query", schema: { type: "string", example: "https://whiteblue.vercel.app/" } }
        ],
        responses: {
          "200": {
            description: "Payment gateway HTML page"
          }
        }
      }
    }
  },
  components: {
    schemas: {
      AppHealth: {
        type: "object",
        required: ["status"],
        properties: {
          status: { type: "string", example: "ok" }
        }
      },
      PaymentGatewayHealth: {
        type: "object",
        required: ["status", "service"],
        properties: {
          status: { type: "string", example: "ok" },
          service: { type: "string", example: "WhiteBlue Payment Gateway" }
        }
      },
      Customer: {
        type: "object",
        required: ["customerId", "tenantId", "tenantKey", "tenantName", "username", "fullName"],
        properties: {
          customerId: { type: "string", format: "uuid" },
          tenantId: { type: "string", format: "uuid" },
          tenantKey: { type: "string", example: "whiteblue" },
          tenantName: { type: "string", example: "WhiteBlue" },
          username: { type: "string", example: "demo.user" },
          fullName: { type: "string", example: "WhiteBlue Demo User" },
          email: { type: "string", format: "email", example: "demo@whiteblue.test" }
        }
      },
      RegisterCustomerRequest: {
        type: "object",
        required: ["tenantKey", "fullName", "username", "password"],
        properties: {
          tenantKey: { type: "string", example: "whiteblue" },
          tenantName: { type: "string", example: "WhiteBlue" },
          fullName: { type: "string", example: "WhiteBlue Demo User" },
          email: { type: "string", format: "email", example: "demo@whiteblue.test" },
          username: {
            type: "string",
            minLength: 3,
            maxLength: 40,
            example: "demo.user"
          },
          password: {
            type: "string",
            format: "password",
            minLength: 8,
            example: "correct-horse-42"
          }
        }
      },
      LoginCustomerRequest: {
        type: "object",
        required: ["tenantKey", "username", "password"],
        properties: {
          tenantKey: { type: "string", example: "whiteblue" },
          username: { type: "string", example: "demo.user" },
          password: {
            type: "string",
            format: "password",
            example: "correct-horse-42"
          }
        }
      },
      AuthSessionResponse: {
        type: "object",
        required: ["sessionToken", "customer"],
        properties: {
          sessionToken: { type: "string", format: "uuid" },
          customer: { $ref: "#/components/schemas/Customer" }
        }
      },
      CustomerResponse: {
        type: "object",
        required: ["customer"],
        properties: {
          customer: { $ref: "#/components/schemas/Customer" }
        }
      },
      MenuItem: {
        type: "object",
        required: ["id", "name", "description", "price", "category", "available"],
        properties: {
          id: { type: "string", example: "cpu-ryzen-7" },
          name: { type: "string", example: "Ryzen 7 Processor" },
          description: { type: "string", example: "8-core desktop CPU for fast gaming and workstation builds" },
          price: { type: "number", example: 299 },
          category: { type: "string", enum: ["component", "accessory", "peripheral"], example: "component" },
          available: { type: "boolean", example: true }
        }
      },
      MenuResponse: {
        type: "object",
        required: ["items"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/MenuItem" }
          }
        }
      },
      OrderLine: {
        type: "object",
        required: ["menuItemId", "quantity"],
        properties: {
          menuItemId: { type: "string", example: "cpu-ryzen-7" },
          quantity: { type: "integer", minimum: 1, maximum: 20, example: 2 }
        }
      },
      OrderRequest: {
        type: "object",
        required: ["items", "paymentToken", "cardId", "customerName"],
        properties: {
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderLine" }
          },
          paymentToken: {
            type: "string",
            description: "Fake payment token returned by WhiteBlue Payment Gateway and bound to the selected card ID.",
            example: "gateway_paid_card:approved-card:test123"
          },
          cardId: {
            type: "string",
            example: "approved-card"
          },
          customerName: {
            type: "string",
            example: "WhiteBlue Demo User"
          }
        }
      },
      OrderReceiptLine: {
        type: "object",
        required: ["menuItemId", "name", "quantity", "unitPrice", "lineTotal"],
        properties: {
          menuItemId: { type: "string", example: "cpu-ryzen-7" },
          name: { type: "string", example: "Ryzen 7 Processor" },
          quantity: { type: "integer", example: 2 },
          unitPrice: { type: "number", example: 299 },
          lineTotal: { type: "number", example: 598 }
        }
      },
      OrderReceipt: {
        type: "object",
        required: ["orderId", "items", "total", "paymentStatus", "paymentId", "customerName", "aiSuggestion"],
        properties: {
          orderId: { type: "string", format: "uuid" },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/OrderReceiptLine" }
          },
          total: { type: "number", example: 598 },
          paymentStatus: { type: "string", enum: ["paid"], example: "paid" },
          paymentId: { type: "string", example: "pay_test123" },
          customerName: { type: "string", example: "WhiteBlue Demo User" },
          aiSuggestion: { type: "string", example: "AI pick: add a 32GB DDR5 Memory Kit to round out this build." }
        }
      },
      ErrorResponse: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string", example: "Invalid order" },
          details: { type: "string", example: "Unknown catalog item: missing-item" }
        }
      }
    }
  }
};
