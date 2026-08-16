import { describe, expect, it } from "vitest";

import { strings } from "../../strings";
import { formatHealthFailure, formatHealthSuccess } from "./formatHealth";

describe("formatHealthSuccess", () => {
  it("summarizes a reachable server and flags startup that is still coming up", () => {
    const ready = formatHealthSuccess({
      status: "ok",
      startupReady: true,
      pushBusReady: true,
      projectionState: "ready",
    });
    expect(ready.ok).toBe(true);
    expect(ready.title).toBe(strings.settings.healthOk);
    expect(ready.detail).toContain("ok");
    expect(ready.detail).toContain(strings.settingsUi.healthReady);
    expect(ready.detail).toContain("ready");

    const starting = formatHealthSuccess({
      status: "ok",
      startupReady: false,
      pushBusReady: false,
      projectionState: null,
    });
    expect(starting.ok).toBe(false);
    expect(starting.detail).toContain(strings.settingsUi.healthStarting);
    expect(starting.detail).toContain(strings.settingsUi.healthNotReady);
  });
});

describe("formatHealthFailure", () => {
  it("keeps the error message and never reports success", () => {
    expect(formatHealthFailure(new Error("ECONNREFUSED"))).toEqual({
      ok: false,
      title: strings.settingsUi.healthFailed,
      detail: "ECONNREFUSED",
    });
    expect(formatHealthFailure("boom")).toEqual({
      ok: false,
      title: strings.settingsUi.healthFailed,
      detail: "boom",
    });
  });
});
