import { afterEach, describe, expect, it, vi } from "vitest";

import { copyTextToDesktopClipboard } from "./desktopClipboard";

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: originalWindow,
    });
  }
  vi.restoreAllMocks();
});

describe("copyTextToDesktopClipboard", () => {
  it("returns false when the desktop clipboard bridge is missing", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {},
    });

    await expect(copyTextToDesktopClipboard("hello")).resolves.toBe(false);
  });

  it("returns true when the desktop clipboard write succeeds", async () => {
    const writeText = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          clipboard: {
            writeImagePngDataUrl: vi.fn(),
            writeText,
          },
        },
      },
    });

    await expect(copyTextToDesktopClipboard("thread-123")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("thread-123");
  });

  it("returns false when the desktop clipboard write throws", async () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        desktopBridge: {
          clipboard: {
            writeImagePngDataUrl: vi.fn(),
            writeText: vi.fn().mockRejectedValue(new Error("ipc failed")),
          },
        },
      },
    });

    await expect(copyTextToDesktopClipboard("hello")).resolves.toBe(false);
  });
});
