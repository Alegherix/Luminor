import { describe, expect, it } from "vitest";

import { sectionPhase } from "./sectionPhase";

describe("sectionPhase", () => {
  it("treats a closed or incompatible socket without a snapshot as disconnected", () => {
    expect(sectionPhase("closed", false, true)).toBe("disconnected");
    expect(sectionPhase("incompatible", false, true)).toBe("disconnected");
  });

  it("shows loading until the shell hydrates", () => {
    expect(sectionPhase("connecting", false, true)).toBe("loading");
    expect(sectionPhase("open", false, true)).toBe("loading");
  });

  it("keeps hydrated snapshots visible even when the socket drops", () => {
    expect(sectionPhase("closed", true, false)).toBe("ready");
    expect(sectionPhase("open", true, true)).toBe("empty");
  });
});
