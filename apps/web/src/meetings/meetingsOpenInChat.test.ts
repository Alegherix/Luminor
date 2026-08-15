import { ProjectId, ThreadId, type ModelSelection, type NativeApi } from "@luminor/contracts";
import { describe, expect, it, vi } from "vitest";

import { buildMeetingChatSeed, openMeetingInChat } from "./meetingsOpenInChat";

const PROJECT_ID = ProjectId.makeUnsafe("11111111-1111-4111-8111-111111111111");
const THREAD_ID = ThreadId.makeUnsafe("22222222-2222-4222-8222-222222222222");
const MODEL: ModelSelection = { provider: "grok", model: "grok-4" };

describe("buildMeetingChatSeed", () => {
  it("keeps the existing seed format when notes are absent", () => {
    expect(
      buildMeetingChatSeed({
        title: "Standup",
        summaryText: "Decision: ship the join path.",
        transcriptText: "We shipped the join path.",
      }),
    ).toEqual({
      title: "Standup",
      text: [
        "# Standup",
        "## Summary",
        "Decision: ship the join path.",
        "## Transcript",
        "We shipped the join path.",
      ].join("\n\n"),
    });
  });

  it("includes meeting notes as a distinct section", () => {
    expect(
      buildMeetingChatSeed({
        title: "Standup",
        summaryText: "Decision: ship the join path.",
        transcriptText: "We shipped the join path.",
        notesText: "Follow up with the release team.",
      }),
    ).toEqual({
      title: "Standup",
      text: [
        "# Standup",
        "## Summary",
        "Decision: ship the join path.",
        "## Meeting notes",
        "Follow up with the release team.",
        "## Transcript",
        "We shipped the join path.",
      ].join("\n\n"),
    });
  });
});

describe("openMeetingInChat", () => {
  it("creates one visible thread through the new-thread path and seeds it", async () => {
    const handleNewThread = vi.fn(async () => THREAD_ID);
    const seedComposer = vi.fn();
    const dispatchCommand = vi.fn(async () => undefined);
    const api = {
      orchestration: {
        dispatchCommand,
        getShellSnapshot: async () => ({
          projects: [],
          folders: [],
          threads: [{ id: THREAD_ID }],
        }),
      },
    } as unknown as NativeApi;

    const threadId = await openMeetingInChat({
      projectId: PROJECT_ID,
      sessionId: "standup",
      title: "Standup",
      summaryText: "Decision: ship the join path.",
      transcriptText: "We shipped the join path.",
      notesPersist: {
        readNotes: async () => "Follow up with the release team.",
        writeNotes: async () => undefined,
      },
      modelSelection: MODEL,
      handleNewThread,
      seedComposer,
      api,
    });

    expect(threadId).toBe(THREAD_ID);
    expect(handleNewThread).toHaveBeenCalledTimes(1);
    expect(handleNewThread).toHaveBeenCalledWith(PROJECT_ID);
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(dispatchCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "thread.create",
        threadId: THREAD_ID,
        projectId: PROJECT_ID,
        title: "Standup",
        modelSelection: MODEL,
      }),
    );
    expect(seedComposer).toHaveBeenCalledTimes(1);
    expect(seedComposer).toHaveBeenCalledWith(
      THREAD_ID,
      expect.stringContaining("Decision: ship the join path."),
    );
    expect(seedComposer).toHaveBeenCalledWith(
      THREAD_ID,
      expect.stringContaining("We shipped the join path."),
    );
    expect(seedComposer).toHaveBeenCalledWith(
      THREAD_ID,
      expect.stringContaining("## Meeting notes\n\nFollow up with the release team."),
    );
  });

  it("creates and seeds the thread when reading notes fails", async () => {
    const handleNewThread = vi.fn(async () => THREAD_ID);
    const seedComposer = vi.fn();
    const dispatchCommand = vi.fn(async () => undefined);
    const api = {
      orchestration: {
        dispatchCommand,
        getShellSnapshot: async () => ({
          projects: [],
          folders: [],
          threads: [{ id: THREAD_ID }],
        }),
      },
    } as unknown as NativeApi;

    const threadId = await openMeetingInChat({
      projectId: PROJECT_ID,
      sessionId: "standup",
      title: "Standup",
      summaryText: "Decision: ship the join path.",
      transcriptText: "We shipped the join path.",
      notesPersist: {
        readNotes: async () => {
          throw new Error("Notes unavailable.");
        },
        writeNotes: async () => undefined,
      },
      modelSelection: MODEL,
      handleNewThread,
      seedComposer,
      api,
    });

    expect(threadId).toBe(THREAD_ID);
    expect(dispatchCommand).toHaveBeenCalledTimes(1);
    expect(seedComposer).toHaveBeenCalledWith(
      THREAD_ID,
      [
        "# Standup",
        "## Summary",
        "Decision: ship the join path.",
        "## Transcript",
        "We shipped the join path.",
      ].join("\n\n"),
    );
  });
});
