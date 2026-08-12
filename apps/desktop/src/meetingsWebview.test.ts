import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  desktopCapturer: { getSources: vi.fn(async () => []) },
  session: { fromPartition: vi.fn(() => ({})) },
  WebContentsView: class {},
}));

import {
  isAllowedMeetingWebViewUrl,
  MeetingWebViewManager,
  MEETING_WEBVIEW_PARTITION,
  type MeetingWebContentsViewLike,
  type MeetingWebViewFactory,
} from "./meetingsWebview";

class FakeView implements MeetingWebContentsViewLike {
  destroyed = false;
  visible = true;
  bounds = { x: 0, y: 0, width: 0, height: 0 };
  currentUrl = "";
  partition = "";
  willNavigate: ((event: { preventDefault: () => void }, url: string) => void) | null = null;
  permissionHandler:
    | ((
        contents: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details?: { requestingUrl?: string },
      ) => void)
    | null = null;

  constructor(partition: string) {
    this.partition = partition;
  }

  webContents = {
    loadURL: vi.fn(async (url: string) => {
      this.currentUrl = url;
    }),
    getURL: () => this.currentUrl,
    isDestroyed: () => this.destroyed,
    close: () => {
      this.destroyed = true;
    },
    destroy: () => {
      this.destroyed = true;
    },
    setWindowOpenHandler: vi.fn(),
    on: (event: string, listener: (...args: unknown[]) => void) => {
      if (event === "will-navigate") {
        this.willNavigate = listener as (
          event: { preventDefault: () => void },
          url: string,
        ) => void;
      }
    },
    session: {
      setPermissionRequestHandler: (handler: NonNullable<FakeView["permissionHandler"]>) => {
        this.permissionHandler = handler;
      },
      setDisplayMediaRequestHandler: vi.fn(),
    },
  };

  setBounds(bounds: { x: number; y: number; width: number; height: number }): void {
    this.bounds = bounds;
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
  }
}

function createHarness() {
  const views: FakeView[] = [];
  const added: FakeView[] = [];
  const window = {
    contentView: {
      addChildView: (view: MeetingWebContentsViewLike) => {
        added.push(view as FakeView);
      },
      removeChildView: (view: MeetingWebContentsViewLike) => {
        const index = added.indexOf(view as FakeView);
        if (index >= 0) {
          added.splice(index, 1);
        }
      },
    },
  };
  const createView: MeetingWebViewFactory = (input) => {
    const view = new FakeView(input.webPreferences.partition);
    views.push(view);
    return view;
  };
  const manager = new MeetingWebViewManager({
    getWindow: () => window,
    createView,
    desktopCapturer: { getSources: async () => [] },
  });
  return { added, createView, manager, views, window };
}

describe("meeting webview allowlist", () => {
  it("allows Google hosts and refuses everything else", () => {
    expect(isAllowedMeetingWebViewUrl("https://meet.google.com/abc-defg-hij")).toBe(true);
    expect(isAllowedMeetingWebViewUrl("https://accounts.google.com/ServiceLogin")).toBe(true);
    expect(isAllowedMeetingWebViewUrl("https://google.com")).toBe(true);
    expect(isAllowedMeetingWebViewUrl("https://evil.example")).toBe(false);
    expect(isAllowedMeetingWebViewUrl("http://meet.google.com/abc-defg-hij")).toBe(false);
  });
});

describe("MeetingWebViewManager", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(() => {
    harness = createHarness();
  });

  it("uses a dedicated persistent partition, not the agent browser partition", async () => {
    expect(MEETING_WEBVIEW_PARTITION).toBe("persist:luminor-meet");
    expect(MEETING_WEBVIEW_PARTITION).not.toBe("persist:luminor-browser");
    await harness.manager.join("https://meet.google.com/abc-defg-hij");
    expect(harness.views[0]?.partition).toBe(MEETING_WEBVIEW_PARTITION);
  });

  it("refuses to join a non-Google URL", async () => {
    await expect(harness.manager.join("https://zoom.us/j/1")).rejects.toThrow(
      "URL not allowed for embedded meeting",
    );
    expect(harness.views).toHaveLength(0);
  });

  it("blocks in-page navigation away from Google hosts", async () => {
    await harness.manager.join("https://meet.google.com/abc-defg-hij");
    const preventDefault = vi.fn();
    harness.views[0]?.willNavigate?.({ preventDefault }, "https://evil.example/phish");
    expect(preventDefault).toHaveBeenCalledOnce();
    harness.views[0]?.willNavigate?.({ preventDefault }, "https://accounts.google.com/signin");
    expect(preventDefault).toHaveBeenCalledOnce();
  });

  it("hides without destroying and only leave tears the session down", async () => {
    await harness.manager.setBounds({ x: 10, y: 20, width: 800, height: 600 });
    await harness.manager.join("https://meet.google.com/abc-defg-hij");
    const view = harness.views[0];
    expect(view?.destroyed).toBe(false);
    expect(view?.visible).toBe(true);
    expect(harness.added).toHaveLength(1);

    expect(harness.manager.hide().joined).toBe(true);
    expect(view?.destroyed).toBe(false);
    expect(view?.visible).toBe(false);
    expect(harness.added).toHaveLength(0);
    expect(harness.manager.createdViewCount()).toBe(1);

    expect(harness.manager.show().joined).toBe(true);
    expect(view?.destroyed).toBe(false);
    expect(view?.visible).toBe(true);
    expect(harness.added).toHaveLength(1);
    expect(harness.manager.createdViewCount()).toBe(1);
    expect(harness.views).toHaveLength(1);

    expect(harness.manager.leave().joined).toBe(false);
    expect(view?.destroyed).toBe(true);
    expect(harness.added).toHaveLength(0);

    await harness.manager.join("https://meet.google.com/abc-defg-hij");
    expect(harness.views).toHaveLength(2);
  });

  it("grants media only for Google Meet origins", async () => {
    await harness.manager.join("https://meet.google.com/abc-defg-hij");
    const granted: boolean[] = [];
    harness.views[0]?.permissionHandler?.(
      null,
      "media",
      (value) => {
        granted.push(value);
      },
      { requestingUrl: "https://meet.google.com/abc-defg-hij" },
    );
    harness.views[0]?.permissionHandler?.(
      null,
      "media",
      (value) => {
        granted.push(value);
      },
      { requestingUrl: "https://evil.example" },
    );
    expect(granted).toEqual([true, false]);
  });
});
