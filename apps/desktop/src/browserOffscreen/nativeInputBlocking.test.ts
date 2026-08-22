import { describe, expect, it, vi } from "vitest";

import { reportBlockedNativeInput } from "./nativeInputBlocking";

describe("offscreen native input blocking reports", () => {
  it("reports a swallowed file chooser instead of silently eating the click", () => {
    const report = vi.fn();

    expect(reportBlockedNativeInput("file", report)).toBe(true);
    expect(report).toHaveBeenCalledWith({ kind: "file-chooser", inputType: "file" });
  });

  it("separates other native widgets and ignores regular inputs", () => {
    const report = vi.fn();

    expect(reportBlockedNativeInput("date", report)).toBe(true);
    expect(reportBlockedNativeInput("text", report)).toBe(false);
    expect(report).toHaveBeenCalledExactlyOnceWith({
      kind: "native-widget",
      inputType: "date",
    });
  });

  it("still classifies the widget for swallowing when reporting fails", () => {
    expect(
      reportBlockedNativeInput("file", () => {
        throw new Error("preload IPC is unavailable");
      }),
    ).toBe(true);
  });
});
