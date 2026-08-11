// FILE: DockPreviewPane.browser.tsx
// Purpose: Verifies the preview pane renders each server-owned preview state and routes
//          its controls to the preview start/stop entry points.
// Layer: Browser UI test
// Depends on: vitest browser rendering, DockPreviewPane, threadPreviewStore.

import "../../index.css";

import type {
  NativeApi,
  ProjectId,
  ProjectScript,
  ThreadId,
  ThreadPreviewState,
} from "@luminor/contracts";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render } from "vitest-browser-react";

import { useStore } from "~/store";
import { makeProject } from "~/storeTestFixtures";
import { useThreadPreviewStore } from "~/threadPreviewStore";
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
  dispatchCommand?: (command: Record<string, unknown>) => Promise<unknown>;
}): () => void {
  const previousNativeApi = window.nativeApi;
  Object.defineProperty(window, "nativeApi", {
    configurable: true,
    value: {
      preview: {
        start: handlers.start ?? (async () => ({ preview: previewState() })),
        stop: handlers.stop ?? (async () => ({ preview: previewState({ status: "idle" }) })),
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
});
