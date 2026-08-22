import { beforeAll, describe, expect, it } from "vitest";

import {
  buildFullProtocolSurface,
  GPUI_COMMAND_TYPES,
  renderFullProtocolSchema,
  renderProtocolSchema,
} from "./export-protocol-schema";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type FullDocument = {
  methods: Record<
    string,
    {
      error?: JsonValue;
      errors?: string[];
      group?: string;
      kind?: string;
      payload?: JsonValue;
      success?: JsonValue;
    }
  >;
  "x-luminor-method-count": number;
};

describe("full-surface protocol schema export", () => {
  let document: FullDocument;
  let rendered: string;

  beforeAll(async () => {
    rendered = await renderFullProtocolSchema();
    document = JSON.parse(rendered) as FullDocument;
  });

  it("exports every WS RPC method across all four groups", () => {
    const methodNames = Object.keys(document.methods);
    expect(document["x-luminor-method-count"]).toBe(methodNames.length);
    expect(methodNames.length).toBeGreaterThanOrEqual(169);
    for (const group of ["feature", "device", "browser", "bootstrap"]) {
      expect(methodNames.some((name) => document.methods[name].group === group)).toBe(true);
    }
  });

  it("contains an allowlisted schema and previously excluded surfaces", async () => {
    const allowlist = JSON.parse(await renderProtocolSchema()) as {
      $defs: Record<string, JsonValue>;
    };

    const withoutRootRef = (schema: JsonValue | undefined): Record<string, JsonValue> => {
      if (schema === null || typeof schema !== "object" || Array.isArray(schema)) {
        throw new Error("expected an object schema");
      }
      const { $ref: _rootRef, ...rest } = schema;
      return rest;
    };
    expect(withoutRootRef(document.methods["bootstrap.negotiate"].error)).toEqual(
      withoutRootRef(allowlist.$defs["WsCompatibilityError"]),
    );
    expect(document.methods["orchestration.getShellSnapshot"].success).toBeDefined();

    expect(document.methods["git.status"].group).toBe("feature");
    expect(document.methods["terminal.open"].group).toBe("feature");
    expect(document.methods["device.tap"].group).toBe("device");
    expect(document.methods["terminal.subscribeEvents"].kind).toBe("stream");
    expect(document.methods["git.status"].kind).toBe("unary");
    expect(document.methods["pullRequests.list"].errors).toEqual([
      "PullRequestsUnavailableError",
      "WsRpcError",
    ]);
    expect(document.methods["git.status"].errors).toEqual(["WsRpcError"]);
  });

  it("is byte-identical when rendered repeatedly", async () => {
    expect(rendered).toBe(await renderFullProtocolSchema());
    expect(JSON.stringify(buildFullProtocolSurface())).toBe(
      JSON.stringify(buildFullProtocolSurface()),
    );
  });

  it("keeps the Phase-1 allowlist render reproducible alongside the full surface", async () => {
    const allowlistText = await renderProtocolSchema();
    const allowlist = JSON.parse(allowlistText) as Record<string, JsonValue>;
    const commandTypes = allowlist["x-luminor-gpui-command-types"] as string[];
    expect(commandTypes).toEqual([...GPUI_COMMAND_TYPES]);
    expect(Object.keys(document.methods)).toContain("git.status");
    expect(Object.keys(document.methods).length).toBeGreaterThan(
      Object.keys(allowlist.$defs as object).length,
    );
  });
});
