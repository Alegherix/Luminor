// FILE: DockPreviewPane.browser.tsx
// Purpose: Verifies the preview pane renders each server-owned preview state and routes
//          its controls to the preview start/stop entry points.
// Layer: Browser UI test
// Depends on: vitest browser rendering, DockPreviewPane, threadPreviewStore.

import "../../index.css";

import {
  PREVIEW_TERMINAL_ID,
  type NativeApi,
  type ProjectId,
  type ProjectScript,
  type ThreadId,
  type ThreadPreviewState,
} from "@luminor/contracts";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useStore } from "~/store";
import { makeProject } from "~/storeTestFixtures";
import { useThreadPreviewStore } from "~/threadPreviewStore";
import { useRightDockStore } from "~/rightDockStore";
import { DockPreviewPane } from "./DockPreviewPane";

const THREAD_ID = "thread-preview-1" as ThreadId;
const PROJECT_ID = "project-preview-1" as ProjectId;

const PREVIEW_SCRIPT: ProjectScript = {
  id: "preview",
  name: "Preview",
  command: "bun run dev",
  icon: "play",
  kind: "preview",
  urlTemplate: "http://localhost:{port}",
};

function seedProject(scripts: ProjectScript[]): void {
  useStore.setState({ projects: [makeProject({ id: PROJECT_ID, scripts })] });
}

const previewState = (overrides: Partial<ThreadPreviewState> = {}): ThreadPreviewState => ({
  threadId: THREAD_ID,
  status: "running",
  terminalId: "preview",
  url: "about:blank",
  port: 5173,
  message: null,
  scriptId: "script-1",
  command: "bun run dev",
  cwd: "/worktrees/preview",
  startedAt: "2026-08-10T00:00:00.000Z",
  ...overrides,
});

function installPreviewNativeApi(handlers: {
  previews?: readonly ThreadPreviewState[];
  start?: (input: { threadId: ThreadId }) => Promise<{ preview: ThreadPreviewState }>;
  stop?: (input: { threadId: ThreadId }) => Promise<{ preview: ThreadPreviewState }>;
  setUrl?: (input: { threadId: ThreadId; url: string }) => Promise<{ preview: ThreadPreviewState }>;
  dispatchCommand?: (command: Record<string, unknown>) => Promise<unknown>;
}): () => void {
  const previousNativeApi = window.nativeApi;
  Object.defineProperty(window, "nativeApi", {
    configurable: true,
    value: {
      preview: {
        start: handlers.start ?? (async () => ({ preview: previewState() })),
        stop: handlers.stop ?? (async () => ({ preview: previewState({ status: "idle" }) })),
        setUrl:
          handlers.setUrl ??
          (async ({ url }) => ({ preview: previewState({ status: "running", url }) })),
        list: async () => ({ previews: handlers.previews ?? [] }),
        onStatusEvent: () => () => undefined,
      },
      orchestration: {
        dispatchCommand: handlers.dispatchCommand ?? (async () => undefined),
      },
    } as unknown as NativeApi,
  });
  return () => {
    Object.defineProperty(window, "nativeApi", {
      configurable: true,
      value: previousNativeApi,
    });
  };
}

function previewStatusTone(): string | null | undefined {
  return document.querySelector('[data-testid="preview-status-dot"]')?.getAttribute("data-tone");
}

describe("DockPreviewPane", () => {
  afterEach(() => {
    useThreadPreviewStore.setState({ previewsByThreadId: {} });
    useRightDockStore.setState({ dockStateByThreadId: {} });
    useStore.setState({ projects: [] });
    document.body.innerHTML = "";
  });

  it("explains the worktree requirement and offers no controls without one", async () => {
    seedProject([PREVIEW_SCRIPT]);
    const restoreNativeApi = installPreviewNativeApi({});
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree={false} />,
    );

    await expect.element(page.getByText("Preview needs a worktree")).toBeInTheDocument();
    expect(previewStatusTone()).toBe("idle");
    expect(document.querySelector('button[aria-label="Start preview"]')).toBeNull();
    expect(document.querySelector('[data-testid="preview-webview"]')).toBeNull();

    await screen.unmount();
    restoreNativeApi();
  });

  it("starts the preview from the idle body and embeds the resolved url", async () => {
    seedProject([PREVIEW_SCRIPT]);
    const start = vi.fn(async () => ({ preview: previewState() }));
    const restoreNativeApi = installPreviewNativeApi({ start });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await expect.element(page.getByText("Preview is not running")).toBeInTheDocument();
    await page.getByRole("button", { name: "Start preview" }).first().click();
    expect(start).toHaveBeenCalledWith({ threadId: THREAD_ID });

    await expect.element(page.getByText(":5173")).toBeInTheDocument();
    expect(document.querySelector('[data-testid="preview-webview"]')?.getAttribute("src")).toBe(
      "about:blank",
    );
    expect(previewStatusTone()).toBe("running");

    await screen.unmount();
    restoreNativeApi();
  });

  it("stops a running preview through the header control", async () => {
    seedProject([PREVIEW_SCRIPT]);
    const stop = vi.fn(async () => ({ preview: previewState({ status: "idle", url: null }) }));
    const restoreNativeApi = installPreviewNativeApi({ previews: [previewState()], stop });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await page.getByRole("button", { name: "Stop preview" }).click();
    expect(stop).toHaveBeenCalledWith({ threadId: THREAD_ID });

    await screen.unmount();
    restoreNativeApi();
  });

  it("loads and keeps a manually entered URL for a running preview", async () => {
    const enteredUrl = "http://localhost:4321";
    const setUrl = vi.fn(async () => ({ preview: previewState({ url: `${enteredUrl}/` }) }));
    const restoreNativeApi = installPreviewNativeApi({
      previews: [previewState({ url: null, port: null })],
      setUrl,
    });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await expect.element(page.getByText("Preview is running")).toBeInTheDocument();
    await page.getByRole("textbox", { name: "Preview URL" }).fill(enteredUrl);
    await page.getByRole("button", { name: "Open preview", exact: true }).click();

    expect(setUrl).toHaveBeenCalledWith({ threadId: THREAD_ID, url: enteredUrl });
    expect(document.querySelector('[data-testid="preview-webview"]')?.getAttribute("src")).toBe(
      `${enteredUrl}/`,
    );

    await screen.unmount();
    restoreNativeApi();
  });

  it("opens the preview terminal in the terminal dock", async () => {
    const restoreNativeApi = installPreviewNativeApi({ previews: [previewState()] });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await page.getByRole("button", { name: "Open preview logs" }).click();

    const dockState = useRightDockStore.getState().dockStateByThreadId[THREAD_ID];
    expect(dockState?.panes).toHaveLength(1);
    expect(dockState?.panes[0]).toMatchObject({
      kind: "terminal",
      terminalThreadId: THREAD_ID,
      terminalId: PREVIEW_TERMINAL_ID,
    });
    expect(dockState?.activePaneId).toBe(dockState?.panes[0]?.id);

    await screen.unmount();
    restoreNativeApi();
  });

  it("restarts a running preview by stopping it before starting again", async () => {
    const calls: string[] = [];
    const stop = vi.fn(async () => {
      calls.push("stop");
      return { preview: previewState({ status: "idle", url: null }) };
    });
    const start = vi.fn(async () => {
      calls.push("start");
      return { preview: previewState() };
    });
    const restoreNativeApi = installPreviewNativeApi({ previews: [previewState()], start, stop });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await page.getByRole("button", { name: "Restart preview" }).click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith({ threadId: THREAD_ID }));
    expect(stop).toHaveBeenCalledWith({ threadId: THREAD_ID });
    expect(calls).toEqual(["stop", "start"]);

    await screen.unmount();
    restoreNativeApi();
  });

  it("saves a preview script from the inline form and starts it in one action", async () => {
    seedProject([]);
    const start = vi.fn(async () => ({ preview: previewState() }));
    const dispatchCommand = vi.fn(async (_command: Record<string, unknown>) => undefined);
    const restoreNativeApi = installPreviewNativeApi({ start, dispatchCommand });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    expect(document.querySelector('button[aria-label="Start preview"]')).toBeNull();
    await page.getByLabelText("Command").fill("bun run dev");
    await page.getByLabelText("URL template").fill("http://localhost:{port}");
    await page.getByRole("button", { name: "Save and start preview" }).click();

    await expect.poll(() => dispatchCommand.mock.calls.length).toBe(1);
    expect(dispatchCommand.mock.calls[0]?.[0]).toMatchObject({
      type: "project.meta.update",
      projectId: PROJECT_ID,
      scripts: [
        {
          kind: "preview",
          command: "bun run dev",
          urlTemplate: "http://localhost:{port}",
        },
      ],
    });
    expect(start).toHaveBeenCalledWith({ threadId: THREAD_ID });

    await screen.unmount();
    restoreNativeApi();
  });

  it("surfaces a failure message with a retry action", async () => {
    seedProject([PREVIEW_SCRIPT]);
    const start = vi.fn(async () => ({ preview: previewState({ status: "starting", url: null }) }));
    const restoreNativeApi = installPreviewNativeApi({
      previews: [previewState({ status: "failed", url: null, message: "Error: port in use" })],
      start,
    });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await expect.element(page.getByText("Error: port in use")).toBeInTheDocument();
    expect(previewStatusTone()).toBe("failed");

    await page.getByRole("button", { name: "Retry preview" }).first().click();
    expect(start).toHaveBeenCalledWith({ threadId: THREAD_ID });
    await expect.element(page.getByText("Starting preview")).toBeInTheDocument();

    await screen.unmount();
    restoreNativeApi();
  });

  it("offers restart from a failed preview", async () => {
    const stop = vi.fn(async () => ({ preview: previewState({ status: "idle", url: null }) }));
    const start = vi.fn(async () => ({ preview: previewState() }));
    const restoreNativeApi = installPreviewNativeApi({
      previews: [previewState({ status: "failed", url: null, message: "Exited" })],
      start,
      stop,
    });
    const screen = await render(
      <DockPreviewPane hostThreadId={THREAD_ID} projectId={PROJECT_ID} hasWorktree />,
    );

    await page.getByRole("button", { name: "Restart preview" }).click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith({ threadId: THREAD_ID }));
    expect(stop).toHaveBeenCalledWith({ threadId: THREAD_ID });

    await screen.unmount();
    restoreNativeApi();
  });
});
