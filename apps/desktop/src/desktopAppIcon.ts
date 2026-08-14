// FILE: desktopAppIcon.ts
// Purpose: Map the default desktop icon to the platform resource.
// Layer: Desktop-native preference logic

type DesktopPlatform = "darwin" | "linux" | "win32";

interface DesktopAppIconResourceInput {
  readonly platform: DesktopPlatform;
  readonly isDarkAppearance: boolean;
}

const DEFAULT_APP_ICON_RESOURCE_NAMES = {
  darwin: "dock-icon.png",
  linux: "icon.png",
  win32: "icon.ico",
} as const;

export function desktopAppIconResourceName(input: DesktopAppIconResourceInput): string {
  if (input.platform === "darwin" && input.isDarkAppearance) {
    return "dock-icon-dark.png";
  }
  return DEFAULT_APP_ICON_RESOURCE_NAMES[input.platform];
}
