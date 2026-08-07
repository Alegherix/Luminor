import { describe, expect, it } from "vitest";

import { parseCssColorToHex } from "./cssColor";

describe("parseCssColorToHex", () => {
  it("normalizes rgb() serializations", () => {
    expect(parseCssColorToHex("rgb(255, 255, 255)")).toBe("#ffffff");
    expect(parseCssColorToHex("rgb(0 17 34)")).toBe("#001122");
  });

  it("keeps alpha only when it is not fully opaque", () => {
    expect(parseCssColorToHex("rgba(16, 32, 48, 1)")).toBe("#102030");
    expect(parseCssColorToHex("rgba(16, 32, 48, 0.5)")).toBe("#10203080");
    expect(parseCssColorToHex("rgb(16 32 48 / 0.25)")).toBe("#10203040");
  });

  it("normalizes color(srgb ...) serializations", () => {
    expect(parseCssColorToHex("color(srgb 1 1 1)")).toBe("#ffffff");
    expect(parseCssColorToHex("color(srgb 0 0.5 1)")).toBe("#0080ff");
    expect(parseCssColorToHex("color(srgb 0 0.5 1 / 0.5)")).toBe("#0080ff80");
  });

  it("expands shorthand hex notation", () => {
    expect(parseCssColorToHex("#ABC")).toBe("#aabbcc");
    expect(parseCssColorToHex("#abcd")).toBe("#aabbccdd");
    expect(parseCssColorToHex("#AABBCC")).toBe("#aabbcc");
  });

  it("clamps out-of-range channels", () => {
    expect(parseCssColorToHex("rgb(-20, 300, 128)")).toBe("#00ff80");
  });

  it("returns null for values a monaco theme cannot use", () => {
    expect(parseCssColorToHex("")).toBeNull();
    expect(parseCssColorToHex("transparent")).toBeNull();
    expect(parseCssColorToHex("var(--background)")).toBeNull();
    expect(parseCssColorToHex("rgb(1, 2)")).toBeNull();
    expect(parseCssColorToHex("#12345")).toBeNull();
  });
});
