/**
 * Preview launch resolution - the single place that turns a thread's workspace
 * and its project's preview script into a runnable command, environment and URL.
 *
 * Port allocation and output-based URL discovery extend this module: they only
 * need to supply `port` / `detectedUrl` to `resolvePreviewUrl`.
 *
 * @module previewLaunchPlan
 */
import {
  PREVIEW_TERMINAL_ID,
  type ProjectScript,
  type ThreadEnvironmentMode,
} from "@luminor/contracts";
import { resolvePreviewUrl } from "@luminor/shared/preview/previewUrl";
import { previewProjectScript, projectScriptRuntimeEnv } from "@luminor/shared/projectScripts";
import { resolveThreadWorkspaceCwd } from "@luminor/shared/threadEnvironment";

export const PREVIEW_WORKTREE_PENDING_MESSAGE =
  "This thread's worktree is not ready yet, so there is nowhere to run the preview.";
export const PREVIEW_REQUIRES_SCRIPT_MESSAGE = "No preview script configured for this project.";

export interface PreviewLaunchContext {
  readonly threadId: string;
  readonly workspaceRoot: string;
  readonly worktreePath: string | null;
  readonly envMode?: ThreadEnvironmentMode | null | undefined;
  readonly workingDirectory?: string | null | undefined;
  readonly scripts: ReadonlyArray<ProjectScript>;
  /** Port reserved for this run, once port allocation applies. */
  readonly port?: number | null;
  /** URL observed in process output, once output discovery applies. */
  readonly detectedUrl?: string | null;
}

export interface PreviewLaunchPlan {
  readonly threadId: string;
  readonly terminalId: string;
  readonly scriptId: string;
  readonly command: string;
  readonly cwd: string;
  readonly env: Record<string, string>;
  readonly url: string | null;
  readonly port: number | null;
}

export type PreviewLaunchResolution =
  | { readonly ok: true; readonly plan: PreviewLaunchPlan }
  | { readonly ok: false; readonly message: string };

export function buildPreviewLaunchPlan(context: PreviewLaunchContext): PreviewLaunchResolution {
  const cwd = resolveThreadWorkspaceCwd({
    projectCwd: context.workspaceRoot,
    envMode: context.envMode,
    worktreePath: context.worktreePath,
    workingDirectory: context.workingDirectory,
  });
  if (!cwd) {
    return { ok: false, message: PREVIEW_WORKTREE_PENDING_MESSAGE };
  }
  const script = previewProjectScript(context.scripts);
  if (!script) {
    return { ok: false, message: PREVIEW_REQUIRES_SCRIPT_MESSAGE };
  }
  const port = context.port ?? null;
  return {
    ok: true,
    plan: {
      threadId: context.threadId,
      terminalId: PREVIEW_TERMINAL_ID,
      scriptId: script.id,
      command: script.command,
      cwd,
      env: projectScriptRuntimeEnv({
        project: { cwd: context.workspaceRoot },
        worktreePath: context.worktreePath,
        ...(port === null
          ? {}
          : {
              extraEnv: {
                PORT: String(port),
                LUMINOR_PREVIEW_PORT: String(port),
              },
            }),
      }),
      url: resolvePreviewUrl({
        urlTemplate: script.urlTemplate,
        port,
        detectedUrl: context.detectedUrl,
      }),
      port,
    },
  };
}
