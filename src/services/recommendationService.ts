import type { MenuItem, OrderLine } from "../domain/types.js";

export function createAiSuggestion(items: OrderLine[], menu: MenuItem[]): string {
  const selectedIds = new Set(items.map((item) => item.menuItemId));
  const selectedItems = menu.filter((item) => selectedIds.has(item.id));
  const hasComponent = selectedItems.some((item) => item.category === "component");
  const hasAccessory = selectedItems.some((item) => item.category === "accessory");
  const hasPeripheral = selectedItems.some((item) => item.category === "peripheral");

  if (hasComponent && !hasAccessory) {
    return "AI pick: add a 32GB DDR5 Memory Kit to round out this build.";
  }

  if (hasComponent && !hasPeripheral) {
    return "AI pick: add a 27-inch QHD Monitor for a complete workstation.";
  }

  if (!hasComponent) {
    return "AI pick: add a core component like the RTX 4070 Graphics Card to complete the order.";
  }

  return "AI pick: this hardware order already looks well balanced.";
}
