import { describe, expect, it } from "vitest";

import { strings } from "../../strings";
import { colors } from "../../theme/tokens";
import {
  capabilitiesLabel,
  connectionStatusColor,
  connectionStatusLabel,
  pairingStatusLabel,
  protocolLabel,
} from "./connectionCopy";

describe("connectionCopy", () => {
  it("maps connection status to labels and colors", () => {
    expect(connectionStatusLabel("open")).toBe(strings.connection.connected);
    expect(connectionStatusLabel("connecting")).toBe(strings.connection.connecting);
    expect(connectionStatusLabel("incompatible")).toBe(strings.connection.incompatible);
    expect(connectionStatusLabel("closed")).toBe(strings.connection.disconnected);
    expect(connectionStatusColor("open")).toBe(colors.success);
    expect(connectionStatusColor("closed")).toBe(colors.danger);
  });

  it("formats pairing, protocol, and capabilities without inventing values", () => {
    expect(pairingStatusLabel(true)).toBe(strings.connection.paired);
    expect(pairingStatusLabel(false)).toBe(strings.connection.notPaired);
    expect(protocolLabel(null)).toBe("—");
    expect(protocolLabel({ protocolEpoch: 1, negotiatedRevision: 1 })).toBe("1.1");
    expect(capabilitiesLabel(undefined)).toBe(strings.settingsUi.none);
    expect(capabilitiesLabel([])).toBe(strings.settingsUi.none);
    expect(capabilitiesLabel(["rpc.typed-errors", "git.worktree-setup-progress"])).toBe(
      "rpc.typed-errors, git.worktree-setup-progress",
    );
  });
});
