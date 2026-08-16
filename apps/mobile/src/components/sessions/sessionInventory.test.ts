import { describe, expect, it } from "vitest";

import {
  canRenderHostTerminalRows,
  HOST_TERMINAL_INVENTORY,
  listHostTerminals,
} from "./sessionInventory";

describe("host terminal inventory", () => {
  it("does not claim a list RPC the mobile read model cannot call", () => {
    expect(HOST_TERMINAL_INVENTORY.listSupported).toBe(false);
    expect(HOST_TERMINAL_INVENTORY.reason).toBe("no-list-rpc");
    expect(listHostTerminals()).toEqual([]);
    expect(canRenderHostTerminalRows()).toBe(false);
  });
});
