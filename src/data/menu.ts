import type { MenuItem } from "../domain/types.js";

export const menu: MenuItem[] = [
  {
    id: "cpu-ryzen-7",
    name: "Ryzen 7 Processor",
    description: "8-core desktop CPU for fast gaming and workstation builds",
    price: 299,
    category: "component",
    available: true
  },
  {
    id: "gpu-rtx-4070",
    name: "RTX 4070 Graphics Card",
    description: "12GB graphics card for high-refresh 1440p systems",
    price: 599,
    category: "component",
    available: true
  },
  {
    id: "memory-32gb-ddr5",
    name: "32GB DDR5 Memory Kit",
    description: "Dual-channel 6000MT/s RAM for smooth multitasking",
    price: 119,
    category: "accessory",
    available: true
  },
  {
    id: "ssd-2tb-nvme",
    name: "2TB NVMe SSD",
    description: "PCIe 4.0 storage with fast boot and project load times",
    price: 149,
    category: "accessory",
    available: false
  },
  {
    id: "monitor-27-qhd",
    name: "27-inch QHD Monitor",
    description: "165Hz display with crisp color for work and play",
    price: 249,
    category: "peripheral",
    available: true
  },
  {
    id: "keyboard-mechanical",
    name: "Mechanical Keyboard",
    description: "Hot-swappable keys with white backlighting",
    price: 89,
    category: "peripheral",
    available: true
  }
];
