import type { NativeApi, OrchestrationShellSnapshot, ProjectId } from "@luminor/contracts";
import { describe, expect, it, vi } from "vitest";

import { useStore } from "../store";
import { resolveProjectForComposerSend } from "./resolveProjectForComposerSend";

const PROJECT_ID = "project-send-resolve" as ProjectId;

function makeSnapshot(projectId: ProjectId): OrchestrationShellSnapshot {
  return {
    snapshotSequence: 1,
    projects: [
      {
        id: projectId,
        kind: "chat",
        title: "Home",
        workspaceRoot: "/Users/tester",
        scripts: [],
        defaultModelSelection: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        deletedAt: null,
        spaceId: null,
      },
    ],
    threads: [],
    folders: [],
    spaces: [],
  };
}

describe("resolveProjectForComposerSend", () => {
  it("returns the project already present in the local store", async () => {
    useStore.setState({
      projects: [
        {
          id: PROJECT_ID,
          kind: "project",
          name: "Repo",
          cwd: "/repo",
          scripts: [],
          defaultModelSelection: null,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    });

    const getShellSnapshot = vi.fn();
    const syncShellSnapshot = vi.fn();

    await expect(
      resolveProjectForComposerSend({
        api: { orchestration: { getShellSnapshot } } as unknown as NativeApi,
        projectId: PROJECT_ID,
        syncShellSnapshot,
      }),
    ).resolves.toMatchObject({ id: PROJECT_ID, cwd: "/repo" });
    expect(getShellSnapshot).not.toHaveBeenCalled();
    expect(syncShellSnapshot).not.toHaveBeenCalled();
  });

  it("hydrates the project from a shell snapshot when the store is empty", async () => {
    useStore.setState({ projects: [] });
    const snapshot = makeSnapshot(PROJECT_ID);
    const syncShellSnapshot = vi.fn((nextSnapshot) => {
      useStore.getState().syncServerShellSnapshot(nextSnapshot);
    });

    await expect(
      resolveProjectForComposerSend({
        api: {
          orchestration: {
            getShellSnapshot: vi.fn(async () => snapshot),
          },
        } as unknown as NativeApi,
        projectId: PROJECT_ID,
        syncShellSnapshot,
      }),
    ).resolves.toMatchObject({ id: PROJECT_ID, kind: "chat" });
    expect(syncShellSnapshot).toHaveBeenCalledWith(snapshot);
  });
});
