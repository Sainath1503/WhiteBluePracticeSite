import { MatchersV3, PactV3, Verifier } from "@pact-foundation/pact";
import { describe, expect, it } from "vitest";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createApp } from "../../src/app.js";
import { createOrder } from "../fixtures/orderFactory.js";

const pactDir = path.resolve(process.cwd(), "pacts");
const pactFile = path.join(pactDir, "WhiteBlue Web-WhiteBlue API.json");
const jsonContentType = MatchersV3.regex(/^application\/json(; ?charset=utf-8)?$/i, "application/json");

process.env.PACT_DO_NOT_TRACK = "true";

describe("WhiteBlue API Pact contract", () => {
  it("generates and verifies the WhiteBlue Web consumer contract", async () => {
    const paidOrderRequest = createOrder([{ menuItemId: "cpu-ryzen-7", quantity: 1 }]);

    await new PactV3({
      consumer: "WhiteBlue Web",
      provider: "WhiteBlue API",
      dir: pactDir,
      logLevel: "warn"
    })
      .addInteraction({
        uponReceiving: "a request for the hardware catalog",
        withRequest: {
          method: "GET",
          path: "/menu"
        },
        willRespondWith: {
          status: 200,
          headers: {
            "Content-Type": jsonContentType
          },
          body: {
            items: MatchersV3.eachLike(
              {
                id: MatchersV3.string("cpu-ryzen-7"),
                name: MatchersV3.string("Ryzen 7 Processor"),
                description: MatchersV3.string("8-core desktop CPU for fast gaming and workstation builds"),
                price: MatchersV3.number(299),
                category: MatchersV3.regex("component|accessory|peripheral", "component")
              },
              1
            )
          }
        }
      })
      .addInteraction({
        uponReceiving: "a request to create a paid order",
        withRequest: {
          method: "POST",
          path: "/order",
          headers: {
            "Content-Type": jsonContentType
          },
          body: paidOrderRequest
        },
        willRespondWith: {
          status: 201,
          headers: {
            "Content-Type": jsonContentType
          },
          body: {
            orderId: MatchersV3.uuid("11111111-1111-4111-8111-111111111111"),
            items: [
              {
                menuItemId: "cpu-ryzen-7",
                name: "Ryzen 7 Processor",
                quantity: 1,
                unitPrice: 299,
                lineTotal: 299
              }
            ],
            total: 299,
            paymentStatus: "paid",
            paymentId: MatchersV3.regex(/^pay_.+$/, "pay_test123"),
            customerName: MatchersV3.string("WhiteBlue Demo User"),
            aiSuggestion: MatchersV3.string("AI pick: add a 32GB DDR5 Memory Kit to round out this build.")
          }
        }
      })
      .executeTest(async (mockServer) => {
        const menuResponse = await fetch(`${mockServer.url}/menu`);
        expect(menuResponse.status).toBe(200);
        await expect(menuResponse.json()).resolves.toEqual(
          expect.objectContaining({
            items: expect.arrayContaining([expect.objectContaining({ name: "Ryzen 7 Processor" })])
          })
        );

        const orderResponse = await fetch(`${mockServer.url}/order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(paidOrderRequest)
        });
        expect(orderResponse.status).toBe(201);
        await expect(orderResponse.json()).resolves.toEqual(
          expect.objectContaining({
            total: 299,
            paymentStatus: "paid"
          })
        );
      });

    const server = await startProvider();
    const address = server.address() as AddressInfo;

    try {
      await new Verifier({
        provider: "WhiteBlue API",
        providerBaseUrl: `http://127.0.0.1:${address.port}`,
        pactUrls: [pactFile],
        stateHandlers: {
          "": async () => undefined
        },
        logLevel: "warn"
      }).verifyProvider();
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  });
});

async function startProvider(): Promise<Server> {
  const server = createApp().listen(0, "127.0.0.1");

  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });

  return server;
}
