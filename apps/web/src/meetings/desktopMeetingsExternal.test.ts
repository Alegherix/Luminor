import { afterEach, describe, expect, it, vi } from "vitest";

import { createDesktopMeetingsExternalHost } from "./desktopMeetingsExternal";

describe("createDesktopMeetingsExternalHost", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge;
  });

  it("returns false when the desktop open-external path is missing", async () => {
    const host = createDesktopMeetingsExternalHost();

    await expect(host.open("https://zoom.us/j/123")).resolves.toBe(false);
  });

  it("delegates to the existing desktop open-external path", async () => {
    const openExternal = vi.fn(async () => true);
    (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge = {
      openExternal,
    };
    const host = createDesktopMeetingsExternalHost();

    await expect(host.open("https://zoom.us/j/123")).resolves.toBe(true);
    expect(openExternal).toHaveBeenCalledWith("https://zoom.us/j/123");
  });
});
