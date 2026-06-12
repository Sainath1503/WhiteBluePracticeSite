import { describe, expect, it } from "vitest";
import { menu } from "../../src/data/menu.js";
import { createAiSuggestion } from "../../src/services/recommendationService.js";

describe("createAiSuggestion", () => {
  it("suggests an accessory when the order has a component but no accessory", () => {
    expect(createAiSuggestion([{ menuItemId: "cpu-ryzen-7", quantity: 1 }], menu)).toContain("32GB DDR5 Memory Kit");
  });

  it("recognizes a balanced order", () => {
    expect(
      createAiSuggestion(
        [
          { menuItemId: "cpu-ryzen-7", quantity: 1 },
          { menuItemId: "memory-32gb-ddr5", quantity: 1 },
          { menuItemId: "monitor-27-qhd", quantity: 1 }
        ],
        menu
      )
    ).toContain("well balanced");
  });

  it("suggests a peripheral when the order has a component and accessory but no peripheral", () => {
    expect(
      createAiSuggestion(
        [
          { menuItemId: "cpu-ryzen-7", quantity: 1 },
          { menuItemId: "memory-32gb-ddr5", quantity: 1 }
        ],
        menu
      )
    ).toContain("27-inch QHD Monitor");
  });

  it("suggests a component when the order only has accessories or peripherals", () => {
    expect(createAiSuggestion([{ menuItemId: "monitor-27-qhd", quantity: 1 }], menu)).toContain("RTX 4070 Graphics Card");
  });
});
