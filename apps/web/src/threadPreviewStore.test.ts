import type { ThreadPreviewState } from "@luminor/contracts";
import { beforeEach, describe, expect, it } from "vitest";

import {
  hasActiveThreadPreview,
  selectThreadPreview,
  useThreadPreviewStore,
} from "./threadPreviewStore";

const preview = (
  threadId: string,
  overrides: Partial<ThreadPreviewState> = {},
): ThreadPreviewState => ({
  threadId,
  status: "running",
  terminalId: "preview",
  url: "http://localhost:5173",
  port: 5173,
  message: null,
  scriptId: "script-1",
  command: "bun run dev",
  cwd: "/worktrees/a",
  startedAt: "2026-08-10T00:00:00.000Z",
  ...overrides,
});

describe("threadPreviewStore", () => {
  beforeEach(() => {
    useThreadPreviewStore.setState({ previewsByThreadId: {} });
  });

  it("indexes a snapshot by thread id and drops idle entries", () => {
    useThreadPreviewStore
      .getState()
      .replaceAll([preview("thread-1"), preview("thread-2", { status: "idle", url: null })]);

    const state = useThreadPreviewStore.getState();
    expect(Object.keys(state.previewsByThreadId)).toEqual(["thread-1"]);
    expect(selectThreadPreview("thread-2")(state)).toBeNull();
  });

  it("replaces rather than merges previous snapshot entries", () => {
    useThreadPreviewStore.getState().replaceAll([preview("thread-1")]);
    useThreadPreviewStore.getState().replaceAll([preview("thread-2")]);

    expect(Object.keys(useThreadPreviewStore.getState().previewsByThreadId)).toEqual(["thread-2"]);
  });

  it("untracks a thread when its status transitions to idle", () => {
    useThreadPreviewStore.getState().applyStatus(preview("thread-1"));
    useThreadPreviewStore
      .getState()
      .applyStatus(preview("thread-1", { status: "idle", url: null, port: null }));

    expect(useThreadPreviewStore.getState().previewsByThreadId).toEqual({});
  });

  it("keeps the same state object when an unknown thread goes idle", () => {
    const before = useThreadPreviewStore.getState().previewsByThreadId;
    useThreadPreviewStore.getState().applyStatus(preview("thread-9", { status: "idle" }));

    expect(useThreadPreviewStore.getState().previewsByThreadId).toBe(before);
  });

  it("treats starting and running as active but failed as inactive", () => {
    useThreadPreviewStore
      .getState()
      .replaceAll([
        preview("starting-thread", { status: "starting", url: null }),
        preview("running-thread"),
        preview("failed-thread", { status: "failed", url: null, message: "boom" }),
      ]);

    const state = useThreadPreviewStore.getState();
    expect(hasActiveThreadPreview(state, "starting-thread")).toBe(true);
    expect(hasActiveThreadPreview(state, "running-thread")).toBe(true);
    expect(hasActiveThreadPreview(state, "failed-thread")).toBe(false);
    expect(hasActiveThreadPreview(state, "unknown-thread")).toBe(false);
  });
});
