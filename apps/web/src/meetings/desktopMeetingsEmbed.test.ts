import { afterEach, describe, expect, it, vi } from "vitest";

import { createDesktopMeetingsEmbedHost } from "./desktopMeetingsEmbed";

describe("createDesktopMeetingsEmbedHost", () => {
  afterEach(() => {
    delete (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge;
  });

  it("stays idle when the desktop meetings bridge is missing", async () => {
    const host = createDesktopMeetingsEmbedHost();

    await expect(host.getState()).resolves.toEqual({
      joined: false,
      visible: false,
      url: null,
      partition: "persist:luminor-meet",
    });
    await expect(host.join("https://meet.google.com/abc-defg-hij")).rejects.toThrow(
      "Meet embed is only available in the desktop app.",
    );
  });

  it("delegates join, hide, show, and leave to the desktop meetings bridge", async () => {
    const meetings = {
      joinEmbed: vi.fn(async () => ({
        joined: true,
        visible: true,
        url: "https://meet.google.com/abc-defg-hij",
        partition: "persist:luminor-meet",
      })),
      hideEmbed: vi.fn(async () => ({
        joined: true,
        visible: false,
        url: "https://meet.google.com/abc-defg-hij",
        partition: "persist:luminor-meet",
      })),
      showEmbed: vi.fn(async () => ({
        joined: true,
        visible: true,
        url: "https://meet.google.com/abc-defg-hij",
        partition: "persist:luminor-meet",
      })),
      leaveEmbed: vi.fn(async () => ({
        joined: false,
        visible: false,
        url: null,
        partition: "persist:luminor-meet",
      })),
      getEmbedState: vi.fn(async () => ({
        joined: false,
        visible: false,
        url: null,
        partition: "persist:luminor-meet",
      })),
    };
    (globalThis as typeof globalThis & { desktopBridge?: unknown }).desktopBridge = { meetings };
    const host = createDesktopMeetingsEmbedHost();

    await host.join("https://meet.google.com/abc-defg-hij");
    await host.hide();
    await host.show();
    await host.leave();

    expect(meetings.joinEmbed).toHaveBeenCalledWith({
      url: "https://meet.google.com/abc-defg-hij",
    });
    expect(meetings.hideEmbed).toHaveBeenCalledTimes(1);
    expect(meetings.showEmbed).toHaveBeenCalledTimes(1);
    expect(meetings.leaveEmbed).toHaveBeenCalledTimes(1);
  });
});
