import { desktopCapturer, session as electronSession, WebContentsView } from "electron";

export const MEETING_WEBVIEW_PARTITION = "persist:luminor-meet";

const MEDIA_PERMISSIONS = new Set(["media", "display-capture", "fullscreen"]);
const NAVIGATION_ABORT_CODE = -3;

export type MeetingWebViewBounds = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
};

export type MeetingWebViewState = {
  readonly joined: boolean;
  readonly visible: boolean;
  readonly url: string | null;
  readonly partition: string;
};

export type MeetingWebContentsLike = {
  loadURL: (url: string) => Promise<void> | void;
  getURL?: () => string;
  isDestroyed?: () => boolean;
  close?: () => void;
  destroy?: () => void;
  setWindowOpenHandler?: (
    handler: (details: { url: string }) => { action: "allow" | "deny" },
  ) => void;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  session?: {
    setPermissionRequestHandler?: (
      handler: (
        contents: unknown,
        permission: string,
        callback: (granted: boolean) => void,
        details?: { requestingUrl?: string },
      ) => void,
    ) => void;
    setDisplayMediaRequestHandler?: (
      handler: (
        request: { securityOrigin?: string; frame?: { origin?: string; url?: string } | null },
        callback: (streams: { video?: unknown }) => void,
      ) => void,
      opts?: { useSystemPicker?: boolean },
    ) => void;
  };
};

export type MeetingWebContentsViewLike = {
  webContents: MeetingWebContentsLike;
  setBounds: (bounds: MeetingWebViewBounds) => void;
  setVisible?: (visible: boolean) => void;
};

export type MeetingOwnerWindowLike = {
  contentView: {
    addChildView: (view: never) => void;
    removeChildView: (view: never) => void;
  };
};

export type MeetingDesktopCapturerLike = {
  getSources: (options: {
    types: ReadonlyArray<"screen" | "window">;
  }) => Promise<ReadonlyArray<{ id: string; name: string }>>;
};

export type MeetingWebViewFactory = (input: {
  readonly webPreferences: {
    readonly partition: string;
    readonly nodeIntegration: false;
    readonly contextIsolation: true;
    readonly sandbox: true;
    readonly webSecurity: true;
    readonly allowRunningInsecureContent: false;
  };
}) => MeetingWebContentsViewLike;

export type MeetingWebViewManagerDeps = {
  readonly getWindow: () => MeetingOwnerWindowLike | null;
  readonly createView?: MeetingWebViewFactory;
  readonly desktopCapturer?: MeetingDesktopCapturerLike;
};

const HIDDEN_BOUNDS: MeetingWebViewBounds = { x: 0, y: 0, width: 0, height: 0 };

export function isAllowedMeetingWebViewUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") {
      return false;
    }
    const host = parsed.hostname.toLowerCase();
    return host === "google.com" || host.endsWith(".google.com");
  } catch {
    return false;
  }
}

export function isAllowedMeetDisplayMediaOrigin(origin: string): boolean {
  try {
    return new URL(origin).origin === "https://meet.google.com";
  } catch {
    return false;
  }
}

function isHarmlessMeetNavigationAbort(error: unknown): boolean {
  if (!error) {
    return false;
  }
  if (typeof error === "object") {
    const record = error as Record<string, unknown>;
    if (
      record.code === "ERR_ABORTED" ||
      record.code === NAVIGATION_ABORT_CODE ||
      record.errno === NAVIGATION_ABORT_CODE ||
      record.errorCode === NAVIGATION_ABORT_CODE
    ) {
      return true;
    }
    return [record.message, record.name, record.error, record.reason].some(
      (value) =>
        typeof value === "string" && (value.includes("ERR_ABORTED") || value.includes("(-3)")),
    );
  }
  const value = String(error);
  return value.includes("ERR_ABORTED") || value.includes("(-3)");
}

async function loadMeetingWebViewUrl(
  webContents: Pick<MeetingWebContentsLike, "loadURL">,
  url: string,
): Promise<void> {
  try {
    await webContents.loadURL(url);
  } catch (error) {
    if (!isHarmlessMeetNavigationAbort(error)) {
      throw error;
    }
  }
}

function originFromDisplayMediaRequest(request: {
  securityOrigin?: string;
  frame?: { origin?: string; url?: string } | null;
}): string {
  if (request.securityOrigin) {
    return request.securityOrigin;
  }
  if (request.frame?.origin) {
    return request.frame.origin;
  }
  if (!request.frame?.url) {
    return "";
  }
  try {
    return new URL(request.frame.url).origin;
  } catch {
    return "";
  }
}

export function parseMeetingEmbedBounds(payload: unknown): MeetingWebViewBounds | null {
  if (payload === null || payload === undefined) {
    return null;
  }
  if (typeof payload !== "object") {
    throw new Error("invalid bounds");
  }
  const record = payload as Partial<MeetingWebViewBounds>;
  const bounds = {
    x: typeof record.x === "number" ? record.x : Number.NaN,
    y: typeof record.y === "number" ? record.y : Number.NaN,
    width: typeof record.width === "number" ? record.width : Number.NaN,
    height: typeof record.height === "number" ? record.height : Number.NaN,
  };
  if (
    !Number.isFinite(bounds.x) ||
    !Number.isFinite(bounds.y) ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 0 ||
    bounds.height <= 0
  ) {
    throw new Error("invalid bounds");
  }
  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  };
}

export class MeetingWebViewManager {
  private view: MeetingWebContentsViewLike | null = null;
  private attached = false;
  private visible = false;
  private bounds: MeetingWebViewBounds | null = null;
  private readonly createdViews: MeetingWebContentsViewLike[] = [];

  constructor(private readonly deps: MeetingWebViewManagerDeps) {}

  async join(url: string): Promise<MeetingWebViewState> {
    if (!isAllowedMeetingWebViewUrl(url)) {
      throw new Error("URL not allowed for embedded meeting");
    }
    const view = this.ensureView();
    await loadMeetingWebViewUrl(view.webContents, url);
    this.visible = true;
    this.syncAttachment();
    return this.getState();
  }

  hide(): MeetingWebViewState {
    this.visible = false;
    this.syncAttachment();
    return this.getState();
  }

  show(): MeetingWebViewState {
    if (!this.view) {
      return this.getState();
    }
    this.visible = true;
    this.syncAttachment();
    return this.getState();
  }

  leave(): MeetingWebViewState {
    this.destroy();
    return this.getState();
  }

  setBounds(bounds: MeetingWebViewBounds | null): MeetingWebViewState {
    this.bounds = bounds;
    this.syncAttachment();
    return this.getState();
  }

  getState(): MeetingWebViewState {
    const url = this.view?.webContents.getURL?.() ?? null;
    return {
      joined: this.view !== null,
      visible: this.visible && this.view !== null,
      url: url && url.length > 0 && url !== "about:blank" ? url : null,
      partition: MEETING_WEBVIEW_PARTITION,
    };
  }

  destroy(): void {
    this.visible = false;
    const view = this.view;
    this.view = null;
    if (!view) {
      this.attached = false;
      return;
    }
    this.detachView(view);
    if (typeof view.webContents.close === "function") {
      view.webContents.close();
    } else if (typeof view.webContents.destroy === "function") {
      view.webContents.destroy();
    }
  }

  createdViewCount(): number {
    return this.createdViews.length;
  }

  private ensureView(): MeetingWebContentsViewLike {
    if (this.view) {
      return this.view;
    }
    const createView = this.deps.createView ?? createNativeMeetingView;
    const view = createView({
      webPreferences: {
        partition: MEETING_WEBVIEW_PARTITION,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });
    this.configureSecurity(view);
    this.createdViews.push(view);
    this.view = view;
    return view;
  }

  private syncAttachment(): void {
    const view = this.view;
    if (!view) {
      return;
    }
    if (this.visible && this.bounds) {
      this.attachView(view);
      view.setVisible?.(true);
      view.setBounds(this.bounds);
      return;
    }
    view.setVisible?.(false);
    view.setBounds(HIDDEN_BOUNDS);
    if (!this.visible) {
      this.detachView(view);
    }
  }

  private attachView(view: MeetingWebContentsViewLike): void {
    const window = this.deps.getWindow();
    if (!window || this.attached) {
      return;
    }
    window.contentView.addChildView(view as never);
    this.attached = true;
  }

  private detachView(view: MeetingWebContentsViewLike): void {
    const window = this.deps.getWindow();
    if (window && this.attached) {
      try {
        window.contentView.removeChildView(view as never);
      } catch {
        // Electron throws when the view is not attached.
      }
    }
    this.attached = false;
  }

  private configureSecurity(view: MeetingWebContentsViewLike): void {
    view.webContents.setWindowOpenHandler?.((details) => {
      if (isAllowedMeetingWebViewUrl(details.url)) {
        void loadMeetingWebViewUrl(view.webContents, details.url);
      }
      return { action: "deny" };
    });
    view.webContents.on?.("will-navigate", (...args: unknown[]) => {
      const [event, url] = args as [{ preventDefault: () => void }, string];
      if (!isAllowedMeetingWebViewUrl(url)) {
        event.preventDefault();
      }
    });
    view.webContents.on?.("will-redirect", (...args: unknown[]) => {
      const [event, url] = args as [{ preventDefault: () => void }, string];
      if (!isAllowedMeetingWebViewUrl(url)) {
        event.preventDefault();
      }
    });
    view.webContents.session?.setPermissionRequestHandler?.(
      (_contents, permission, callback, details) => {
        const requestingUrl = details?.requestingUrl ?? view.webContents.getURL?.() ?? "";
        callback(MEDIA_PERMISSIONS.has(permission) && isAllowedMeetingWebViewUrl(requestingUrl));
      },
    );
    const capturer = this.deps.desktopCapturer ?? desktopCapturer;
    view.webContents.session?.setDisplayMediaRequestHandler?.(
      (request, callback) => {
        const origin = originFromDisplayMediaRequest(request);
        if (!isAllowedMeetDisplayMediaOrigin(origin)) {
          callback({});
          return;
        }
        void capturer.getSources({ types: ["screen", "window"] }).then(
          (sources) => {
            const source = sources[0];
            callback(source ? { video: source } : {});
          },
          () => {
            callback({});
          },
        );
      },
      { useSystemPicker: true },
    );
  }
}

function createNativeMeetingView(input: {
  readonly webPreferences: {
    readonly partition: string;
    readonly nodeIntegration: false;
    readonly contextIsolation: true;
    readonly sandbox: true;
    readonly webSecurity: true;
    readonly allowRunningInsecureContent: false;
  };
}): MeetingWebContentsViewLike {
  electronSession.fromPartition(input.webPreferences.partition);
  return new WebContentsView({
    webPreferences: input.webPreferences,
  }) as unknown as MeetingWebContentsViewLike;
}
