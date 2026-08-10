import { PREVIEW_TERMINAL_ID, type ThreadPreviewState } from "@luminor/contracts";

export function idleThreadPreview(threadId: string): ThreadPreviewState {
  return {
    threadId,
    status: "idle",
    terminalId: PREVIEW_TERMINAL_ID,
    url: null,
    port: null,
    message: null,
    scriptId: null,
    command: null,
    cwd: null,
    startedAt: null,
  };
}

export function isActiveThreadPreview(preview: ThreadPreviewState | null | undefined): boolean {
  return preview?.status === "starting" || preview?.status === "running";
}
