import type { ModelSelection, NativeApi, ProjectId, ThreadId } from "@luminor/contracts";
import { DEFAULT_RUNTIME_MODE } from "@luminor/contracts";

import { promoteThreadCreate } from "../lib/threadCreatePromotion";
import { DEFAULT_INTERACTION_MODE } from "../types";
import { newCommandId } from "../lib/utils";

const TRANSCRIPT_SEED_LIMIT = 16_000;

export function buildMeetingChatSeed(input: {
  readonly title: string;
  readonly summaryText: string | null;
  readonly transcriptText: string | null;
}): { readonly title: string; readonly text: string } {
  const title = input.title.trim() || "Meeting";
  const sections = [`# ${title}`];
  const summary = input.summaryText?.trim() ?? "";
  const transcript = input.transcriptText?.trim() ?? "";
  if (summary.length > 0) {
    sections.push("## Summary", summary);
  }
  if (transcript.length > 0) {
    const clipped =
      transcript.length > TRANSCRIPT_SEED_LIMIT
        ? `${transcript.slice(0, TRANSCRIPT_SEED_LIMIT)}\n\n[truncated]`
        : transcript;
    sections.push("## Transcript", clipped);
  }
  return {
    title,
    text: sections.join("\n\n"),
  };
}

export async function openMeetingInChat(input: {
  readonly projectId: ProjectId;
  readonly title: string;
  readonly summaryText: string | null;
  readonly transcriptText: string | null;
  readonly modelSelection: ModelSelection;
  readonly handleNewThread: (projectId: ProjectId) => Promise<ThreadId | null>;
  readonly seedComposer: (threadId: ThreadId, prompt: string) => void;
  readonly api: NativeApi;
}): Promise<ThreadId | null> {
  const seed = buildMeetingChatSeed({
    title: input.title,
    summaryText: input.summaryText,
    transcriptText: input.transcriptText,
  });
  const threadId = await input.handleNewThread(input.projectId);
  if (!threadId) {
    return null;
  }
  await promoteThreadCreate(
    {
      type: "thread.create",
      commandId: newCommandId(),
      threadId,
      projectId: input.projectId,
      title: seed.title,
      modelSelection: input.modelSelection,
      runtimeMode: DEFAULT_RUNTIME_MODE,
      interactionMode: DEFAULT_INTERACTION_MODE,
      envMode: "local",
      branch: null,
      worktreePath: null,
      createdAt: new Date().toISOString(),
    },
    input.api,
  );
  input.seedComposer(threadId, seed.text);
  return threadId;
}
