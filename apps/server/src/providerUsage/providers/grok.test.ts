// FILE: providerUsage/providers/grok.test.ts
// Purpose: Covers the Grok CLI billing mapping — weekly credits, the omitted-zero weekly period,
// the monthly spend fallback, and the auth outcomes (missing, stale, unauthorized, corrupt).

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { outboundHttp } from "@luminor/shared/outboundHttp";

import { grokUsageFetcher, parseGrokMonthlyUsage, parseGrokWeeklyCredits } from "./grok";

const NOW_MS = Date.parse("2026-08-10T12:00:00.000Z");
const FRESH_EXPIRY = "2026-08-10T13:00:00.000Z";
const STALE_EXPIRY = "2026-08-10T11:00:00.000Z";
const PERIOD_END = "2026-08-14T00:00:00.000Z";

const tempDirs: string[] = [];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function stubOutbound(handler: (url: string) => Response): void {
  vi.spyOn(outboundHttp, "request").mockImplementation(async (input) => {
    const response = handler(String(input.url));
    return {
      status: response.status,
      headers: response.headers,
      body: new Uint8Array(await response.arrayBuffer()),
      url: String(input.url),
    };
  });
}

function makeGrokHome(authFile: unknown | string) {
  const homeDir = mkdtempSync(nodePath.join(os.tmpdir(), "luminor-grok-usage-"));
  tempDirs.push(homeDir);
  const grokDir = nodePath.join(homeDir, ".grok");
  mkdirSync(grokDir, { recursive: true });
  writeFileSync(
    nodePath.join(grokDir, "auth.json"),
    typeof authFile === "string" ? authFile : JSON.stringify(authFile),
    "utf8",
  );
  return homeDir;
}

function signedInAuthFile(expiresAt: string) {
  return {
    "https://auth.x.ai::0f8f0b1a-0000-4000-8000-000000000000": {
      key: "test-access-token",
      expires_at: expiresAt,
      user_id: "user-1",
      oidc_issuer: "https://auth.x.ai",
    },
  };
}

function context(homeDir: string, env: NodeJS.ProcessEnv = {}) {
  return { homeDir, env, platform: "linux" as NodeJS.Platform, nowMs: NOW_MS };
}

afterEach(() => {
  vi.restoreAllMocks();
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("parseGrokWeeklyCredits", () => {
  it("maps credit usage onto a weekly window", () => {
    expect(
      parseGrokWeeklyCredits({
        config: {
          creditUsagePercent: 52.4,
          billingPeriodEnd: PERIOD_END,
          currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: PERIOD_END },
        },
      }),
    ).toEqual({
      window: "Weekly",
      usedPercent: 52.4,
      windowDurationMins: 10_080,
      resetsAt: PERIOD_END,
    });
  });

  it("treats a confirmed weekly period without a percent as 0% used", () => {
    const config = {
      billingPeriodStart: "2026-08-07T00:00:00.000Z",
      billingPeriodEnd: PERIOD_END,
      currentPeriod: {
        type: "USAGE_PERIOD_TYPE_WEEKLY",
        start: "2026-08-07T00:00:00.000Z",
        end: PERIOD_END,
      },
    };
    expect(parseGrokWeeklyCredits({ config })?.usedPercent).toBe(0);
  });

  it("returns null when the period is not a confirmed weekly window", () => {
    expect(
      parseGrokWeeklyCredits({
        config: {
          billingPeriodEnd: PERIOD_END,
          currentPeriod: { type: "USAGE_PERIOD_TYPE_MONTHLY" },
        },
      }),
    ).toBeNull();
  });
});

describe("parseGrokMonthlyUsage", () => {
  it("derives a 30-day window from spend against the monthly limit", () => {
    expect(
      parseGrokMonthlyUsage({
        config: {
          used: { val: "25" },
          monthlyLimit: { val: "100" },
          billingPeriodEnd: PERIOD_END,
        },
      }),
    ).toEqual({
      window: "Monthly",
      usedPercent: 25,
      windowDurationMins: 43_200,
      resetsAt: PERIOD_END,
    });
  });

  it("returns null without a positive monthly limit", () => {
    expect(
      parseGrokMonthlyUsage({ config: { used: { val: "5" }, monthlyLimit: { val: "0" } } }),
    ).toBeNull();
  });
});

describe("grokUsageFetcher", () => {
  it("reports weekly credits from the credits endpoint", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(FRESH_EXPIRY));
    stubOutbound(() =>
      jsonResponse({
        config: {
          creditUsagePercent: 8,
          billingPeriodEnd: PERIOD_END,
          currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: PERIOD_END },
        },
      }),
    );

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limits).toEqual([
      { window: "Weekly", usedPercent: 8, windowDurationMins: 10_080, resetsAt: PERIOD_END },
    ]);
  });

  it("falls back to the monthly billing endpoint when credits are absent", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(FRESH_EXPIRY));
    stubOutbound((url) =>
      url.includes("format=credits")
        ? jsonResponse({ config: {} })
        : jsonResponse({ config: { used: { val: "3" }, monthlyLimit: { val: "12" } } }),
    );

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limits).toEqual([
      { window: "Monthly", usedPercent: 25, windowDurationMins: 43_200 },
    ]);
  });

  it("hides a signed-in account without any quota instead of erroring", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(FRESH_EXPIRY));
    stubOutbound(() => jsonResponse({ config: {} }));

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("unsupported");
    expect(snapshot.limits).toEqual([]);
  });

  it("asks for sign-in when auth.json is missing", async () => {
    const homeDir = mkdtempSync(nodePath.join(os.tmpdir(), "luminor-grok-usage-"));
    tempDirs.push(homeDir);

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("needs-auth");
    expect(snapshot.detail).toContain("grok");
  });

  it("asks the user to run the Grok CLI again when the token is stale", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(STALE_EXPIRY));

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("needs-auth");
    expect(snapshot.detail).toBe("Grok sign-in expired — run `grok` to sign in again.");
  });

  it("treats an unauthorized billing response as an expired sign-in", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(FRESH_EXPIRY));
    stubOutbound(() => jsonResponse({ error: "unauthorized" }, 401));

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("needs-auth");
  });

  it("errors without leaking the credential path when auth.json holds no session", async () => {
    const homeDir = makeGrokHome({ "https://auth.x.ai::abc": { expires_at: FRESH_EXPIRY } });

    const snapshot = await grokUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("error");
    expect(snapshot.detail).toBe("Could not read the Grok CLI credentials.");
    expect(snapshot.detail).not.toContain(homeDir);
  });

  it("honors GROK_HOME", async () => {
    const homeDir = makeGrokHome(signedInAuthFile(FRESH_EXPIRY));
    const grokHome = nodePath.join(homeDir, ".grok");
    stubOutbound(() =>
      jsonResponse({
        config: {
          creditUsagePercent: 1,
          currentPeriod: { type: "USAGE_PERIOD_TYPE_WEEKLY", end: PERIOD_END },
        },
      }),
    );

    const snapshot = await grokUsageFetcher.fetch(
      context("/nonexistent-home", { GROK_HOME: grokHome }),
    );

    expect(snapshot.status).toBe("ok");
  });
});
