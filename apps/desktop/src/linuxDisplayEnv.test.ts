import { describe, expect, it, vi } from "vitest";

import {
  applyLinuxElectronDisplayEnvironment,
  resolveElectronOzonePlatformHint,
  withLinuxWaylandDisplay,
} from "./linuxDisplayEnv";

describe("withLinuxWaylandDisplay", () => {
  it("keeps an existing WAYLAND_DISPLAY", () => {
    const env = withLinuxWaylandDisplay(
      { XDG_RUNTIME_DIR: "/run/user/1000", WAYLAND_DISPLAY: "wayland-2" },
      () => true,
    );
    expect(env.WAYLAND_DISPLAY).toBe("wayland-2");
  });

  it("restores wayland-1 from XDG_RUNTIME_DIR when the socket exists", () => {
    const env = withLinuxWaylandDisplay({ XDG_RUNTIME_DIR: "/run/user/1000" }, (path) =>
      path.endsWith("/wayland-1"),
    );
    expect(env.WAYLAND_DISPLAY).toBe("wayland-1");
  });

  it("falls back to wayland-0", () => {
    const env = withLinuxWaylandDisplay({ XDG_RUNTIME_DIR: "/run/user/1000" }, (path) =>
      path.endsWith("/wayland-0"),
    );
    expect(env.WAYLAND_DISPLAY).toBe("wayland-0");
  });

  it("does nothing without a runtime dir or socket", () => {
    expect(withLinuxWaylandDisplay({}, () => true).WAYLAND_DISPLAY).toBeUndefined();
    expect(
      withLinuxWaylandDisplay({ XDG_RUNTIME_DIR: "/run/user/1000" }, () => false).WAYLAND_DISPLAY,
    ).toBeUndefined();
  });
});

describe("resolveElectronOzonePlatformHint", () => {
  it("preserves an explicit hint", () => {
    expect(resolveElectronOzonePlatformHint({ ELECTRON_OZONE_PLATFORM_HINT: "x11" })).toBe("x11");
  });

  it("selects wayland when a display is available", () => {
    expect(resolveElectronOzonePlatformHint({ WAYLAND_DISPLAY: "wayland-1" })).toBe("wayland");
  });

  it("returns undefined without a display or hint", () => {
    expect(resolveElectronOzonePlatformHint({})).toBeUndefined();
  });
});

describe("applyLinuxElectronDisplayEnvironment", () => {
  it("restores the socket and appends the ozone hint on linux", () => {
    const env: NodeJS.ProcessEnv = { XDG_RUNTIME_DIR: "/run/user/1000" };
    const appendSwitch = vi.fn();
    applyLinuxElectronDisplayEnvironment(env, {
      platform: "linux",
      socketExists: (path) => path.endsWith("/wayland-1"),
      appendSwitch,
    });
    expect(env.WAYLAND_DISPLAY).toBe("wayland-1");
    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBe("wayland");
    expect(appendSwitch).toHaveBeenCalledWith("ozone-platform-hint", "wayland");
  });

  it("does not override an explicit ozone hint", () => {
    const env: NodeJS.ProcessEnv = {
      XDG_RUNTIME_DIR: "/run/user/1000",
      ELECTRON_OZONE_PLATFORM_HINT: "auto",
    };
    applyLinuxElectronDisplayEnvironment(env, {
      platform: "linux",
      socketExists: () => true,
    });
    expect(env.ELECTRON_OZONE_PLATFORM_HINT).toBe("auto");
  });

  it("skips non-linux platforms", () => {
    const env: NodeJS.ProcessEnv = { XDG_RUNTIME_DIR: "/run/user/1000" };
    applyLinuxElectronDisplayEnvironment(env, {
      platform: "darwin",
      socketExists: () => true,
    });
    expect(env.WAYLAND_DISPLAY).toBeUndefined();
  });
});
