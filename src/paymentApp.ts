import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import { whiteBlueOpenApiSpec } from "./openapi.js";

export function createPaymentApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(express.static("payment-public"));

  app.get("/health", (_request, response) => {
    response.json({ status: "ok", service: "WhiteBlue Payment Gateway" });
  });

  app.get("/openapi.json", (_request, response) => {
    response.json(whiteBlueOpenApiSpec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(whiteBlueOpenApiSpec));

  return app;
}
