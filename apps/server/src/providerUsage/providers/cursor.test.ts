// FILE: providerUsage/providers/cursor.test.ts
// Purpose: Covers cursor-agent CLI auth.json as a usage-credential source.

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import nodePath from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { outboundHttp } from "@luminor/shared/outboundHttp";

import { cursorUsageFetcher } from "./cursor";

const NOW_MS = Date.parse("2026-08-16T08:00:00.000Z");

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

function makeHome(authFile?: unknown) {
  const homeDir = mkdtempSync(nodePath.join(os.tmpdir(), "luminor-cursor-usage-"));
  tempDirs.push(homeDir);
  if (authFile !== undefined) {
    const cursorDir = nodePath.join(homeDir, ".config", "cursor");
    mkdirSync(cursorDir, { recursive: true });
    writeFileSync(
      nodePath.join(cursorDir, "auth.json"),
      typeof authFile === "string" ? authFile : JSON.stringify(authFile),
      "utf8",
    );
  }
  return homeDir;
}

function jwtWithExp(expSeconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
  return `eyJhbGciOiJub25lIn0.${payload}.sig`;
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

describe("cursorUsageFetcher CLI auth", () => {
  it("asks for sign-in when cursor-agent auth.json is missing", async () => {
    const snapshot = await cursorUsageFetcher.fetch(context(makeHome()));

    expect(snapshot.status).toBe("needs-auth");
  });

  it("reads cursor-agent ~/.config/cursor/auth.json", async () => {
    const homeDir = makeHome({ accessToken: "cli-access-token" });
    stubOutbound((url) => {
      if (url.includes("GetCurrentPeriodUsage")) {
        return jsonResponse({
          billingCycleEnd: "1771077734000",
          planUsage: { totalPercentUsed: 12 },
        });
      }
      return jsonResponse({ hasCreditGrants: false });
    });

    const snapshot = await cursorUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limits[0]?.usedPercent).toBe(12);
  });

  it("honors XDG_CONFIG_HOME for cursor-agent auth.json", async () => {
    const homeDir = makeHome();
    const xdg = nodePath.join(homeDir, "xdg-config");
    mkdirSync(nodePath.join(xdg, "cursor"), { recursive: true });
    writeFileSync(
      nodePath.join(xdg, "cursor", "auth.json"),
      JSON.stringify({ accessToken: "xdg-access-token" }),
      "utf8",
    );
    stubOutbound(() =>
      jsonResponse({
        billingCycleEnd: "1771077734000",
        planUsage: { totalPercentUsed: 4 },
      }),
    );

    const snapshot = await cursorUsageFetcher.fetch(context(homeDir, { XDG_CONFIG_HOME: xdg }));

    expect(snapshot.status).toBe("ok");
    expect(snapshot.limits[0]?.usedPercent).toBe(4);
  });

  it("asks for sign-in when the CLI access token JWT is expired", async () => {
    const homeDir = makeHome({ accessToken: jwtWithExp(NOW_MS / 1000 - 60) });

    const snapshot = await cursorUsageFetcher.fetch(context(homeDir));

    expect(snapshot.status).toBe("needs-auth");
  });
});
