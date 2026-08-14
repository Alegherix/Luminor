import { describe, expect, it } from "vitest";

import { desktopAppIconResourceName } from "./desktopAppIcon";

describe("desktop app icons", () => {
  it("uses a PNG for the macOS default icon in light and dark mode", () => {
    expect(desktopAppIconResourceName({ platform: "darwin", isDarkAppearance: false })).toBe(
      "dock-icon.png",
    );
    expect(desktopAppIconResourceName({ platform: "darwin", isDarkAppearance: true })).toBe(
      "dock-icon-dark.png",
    );
  });

  it("uses the default icon off macOS regardless of appearance", () => {
    expect(desktopAppIconResourceName({ platform: "linux", isDarkAppearance: false })).toBe(
      "icon.png",
    );
    expect(desktopAppIconResourceName({ platform: "linux", isDarkAppearance: true })).toBe(
      "icon.png",
    );
    expect(desktopAppIconResourceName({ platform: "win32", isDarkAppearance: false })).toBe(
      "icon.ico",
    );
    expect(desktopAppIconResourceName({ platform: "win32", isDarkAppearance: true })).toBe(
      "icon.ico",
    );
  });
});
