import { describe, expect, it } from "vitest";

import { deriveUsageRosterRowState, isUsageRosterRowVisible } from "~/lib/usageRosterRowState";

describe("deriveUsageRosterRowState", () => {
  it("shows usage whenever rows exist, whatever the status says", () => {
    expect(
      deriveUsageRosterRowState({
        status: "error",
        detail: "stale",
        hasRows: true,
        isLoading: false,
      }),
    ).toEqual({ kind: "usage", detail: "stale" });
  });

  it("maps each failing status onto its own row kind", () => {
    const base = { detail: undefined, hasRows: false, isLoading: false } as const;
    expect(deriveUsageRosterRowState({ ...base, status: "needs-auth" }).kind).toBe("signed-out");
    expect(deriveUsageRosterRowState({ ...base, status: "unsupported" }).kind).toBe("unavailable");
    expect(deriveUsageRosterRowState({ ...base, status: "error" }).kind).toBe("error");
  });

  it("shows loading only while an ok/unknown status has nothing to render yet", () => {
    expect(
      deriveUsageRosterRowState({
        status: undefined,
        detail: undefined,
        hasRows: false,
        isLoading: true,
      }).kind,
    ).toBe("loading");
    expect(
      deriveUsageRosterRowState({
        status: "ok",
        detail: undefined,
        hasRows: false,
        isLoading: false,
      }).kind,
    ).toBe("unavailable");
  });

  it("prefers a failing status over the loading placeholder", () => {
    expect(
      deriveUsageRosterRowState({
        status: "needs-auth",
        detail: undefined,
        hasRows: false,
        isLoading: true,
      }).kind,
    ).toBe("signed-out");
  });

  it("drops blank details", () => {
    expect(
      deriveUsageRosterRowState({
        status: "error",
        detail: "   ",
        hasRows: false,
        isLoading: false,
      }).detail,
    ).toBeUndefined();
  });
});

describe("isUsageRosterRowVisible", () => {
  it("gives a status-bar segment to usage rows only", () => {
    expect(isUsageRosterRowVisible({ kind: "usage", detail: undefined })).toBe(true);
    for (const kind of ["loading", "signed-out", "unavailable", "error"] as const) {
      expect(isUsageRosterRowVisible({ kind, detail: undefined })).toBe(false);
    }
  });
});
