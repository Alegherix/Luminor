import { describe, expect, it } from "vitest";
import {
  PREVIEW_URL_PORT_PLACEHOLDER,
  previewUrlTemplateRequiresPort,
  resolvePreviewUrl,
} from "./previewUrl";

describe("resolvePreviewUrl", () => {
  it("uses a fixed template as-is", () => {
    expect(resolvePreviewUrl({ urlTemplate: "http://localhost:5173" })).toBe(
      "http://localhost:5173",
    );
  });

  it("trims surrounding whitespace from a fixed template", () => {
    expect(resolvePreviewUrl({ urlTemplate: "  http://localhost:3000  " })).toBe(
      "http://localhost:3000",
    );
  });

  it("returns null without a template or detected url", () => {
    expect(resolvePreviewUrl({})).toBeNull();
    expect(resolvePreviewUrl({ urlTemplate: "   " })).toBeNull();
  });

  it("falls back to the detected url when no template is configured", () => {
    expect(resolvePreviewUrl({ detectedUrl: "http://127.0.0.1:4321" })).toBe(
      "http://127.0.0.1:4321",
    );
  });

  it("prefers the template over a detected url", () => {
    expect(
      resolvePreviewUrl({ urlTemplate: "http://localhost:5173", detectedUrl: "http://other" }),
    ).toBe("http://localhost:5173");
  });

  it("substitutes every port placeholder once a port is known", () => {
    expect(
      resolvePreviewUrl({
        urlTemplate: `http://localhost:${PREVIEW_URL_PORT_PLACEHOLDER}/?p=${PREVIEW_URL_PORT_PLACEHOLDER}`,
        port: 4100,
      }),
    ).toBe("http://localhost:4100/?p=4100");
  });

  it("cannot resolve a port template without a port", () => {
    expect(resolvePreviewUrl({ urlTemplate: "http://localhost:{port}" })).toBeNull();
    expect(resolvePreviewUrl({ urlTemplate: "http://localhost:{port}", port: 0 })).toBeNull();
    expect(resolvePreviewUrl({ urlTemplate: "http://localhost:{port}", port: null })).toBeNull();
  });

  it("falls back to a detected url when a port template is unresolved", () => {
    expect(
      resolvePreviewUrl({
        urlTemplate: "http://localhost:{port}",
        detectedUrl: "http://localhost:9999",
      }),
    ).toBe("http://localhost:9999");
  });
});

describe("previewUrlTemplateRequiresPort", () => {
  it("detects the port placeholder", () => {
    expect(previewUrlTemplateRequiresPort("http://localhost:{port}")).toBe(true);
    expect(previewUrlTemplateRequiresPort("http://localhost:5173")).toBe(false);
    expect(previewUrlTemplateRequiresPort(null)).toBe(false);
    expect(previewUrlTemplateRequiresPort(undefined)).toBe(false);
  });
});
