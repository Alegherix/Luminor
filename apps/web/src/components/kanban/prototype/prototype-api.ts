// FILE: prototype-api.ts
// Purpose: Thin local adapter — persist inbox decisions and create a real Kanban draft.
// Layer: Kanban prototype adapter (no GitHub, no RPC)

import type { ProjectId, ProviderKind, ThreadId } from "@luminor/contracts";
import { getDefaultModel } from "@luminor/shared/model";

import { useComposerDraftStore } from "~/composerDraftStore";
import { isHomeChatContainerProject } from "~/lib/chatProjects";
import { createKanbanDraftTask } from "~/lib/kanbanTaskCreate";
import type { ServerWorkspacePaths } from "~/lib/serverWorkspacePaths";
import { isStudioContainerProject } from "~/lib/studioProjects";
import { buildModelSelection } from "~/providerModelOptions";
import { DEFAULT_INTERACTION_MODE, DEFAULT_RUNTIME_MODE, type Project } from "~/types";
import { buildIssueDraftPrompt } from "./issue-sync.logic";
import type { PrototypeIssue } from "./issue-sync.types";

const STORAGE_KEY = "luminor:issue-inbox-prototype:v1";

interface InboxRecord {
  acceptedIds: string[];
  skippedIds: string[];
}

function readRecord(): InboxRecord {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return { acceptedIds: [], skippedIds: [] };
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return { acceptedIds: [], skippedIds: [] };
    }
    const record = parsed as Partial<InboxRecord>;
    return {
      acceptedIds: Array.isArray(record.acceptedIds)
        ? record.acceptedIds.filter((id): id is string => typeof id === "string")
        : [],
      skippedIds: Array.isArray(record.skippedIds)
        ? record.skippedIds.filter((id): id is string => typeof id === "string")
        : [],
    };
  } catch {
    return { acceptedIds: [], skippedIds: [] };
  }
}

function writeRecord(record: InboxRecord): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
}

export function readHiddenIssueIds(): string[] {
  const record = readRecord();
  return [...new Set([...record.acceptedIds, ...record.skippedIds])];
}

export function markIssueAccepted(issueId: string): void {
  const record = readRecord();
  writeRecord({
    acceptedIds: record.acceptedIds.includes(issueId)
      ? record.acceptedIds
      : [...record.acceptedIds, issueId],
    skippedIds: record.skippedIds.filter((id) => id !== issueId),
  });
}

export function markIssueSkipped(issueId: string): void {
  const record = readRecord();
  if (record.acceptedIds.includes(issueId) || record.skippedIds.includes(issueId)) {
    return;
  }
  writeRecord({ ...record, skippedIds: [...record.skippedIds, issueId] });
}

export function resetSkippedIssues(): void {
  writeRecord({ ...readRecord(), skippedIds: [] });
}

export function resolveIssueDestinationProject(
  projects: readonly Project[],
  repoName: string,
  paths: ServerWorkspacePaths,
): Project | null {
  const chatContainers = projects.filter((project) => isHomeChatContainerProject(project, paths));
  const boardProjects = projects.filter(
    (project) =>
      !isHomeChatContainerProject(project, paths) && !isStudioContainerProject(project, paths),
  );
  const needle = repoName.trim().toLowerCase();
  const named = boardProjects.find((project) => project.name.trim().toLowerCase() === needle);
  if (named) {
    return named;
  }
  if (boardProjects[0]) {
    return boardProjects[0];
  }
  return chatContainers.find((project) => project.kind === "chat") ?? chatContainers[0] ?? null;
}

export function acceptIssueAsKanbanDraft(input: {
  issue: PrototypeIssue;
  projects: readonly Project[];
  defaultProvider: ProviderKind;
  workspacePaths: ServerWorkspacePaths;
}): { ok: true; threadId: ThreadId; projectId: ProjectId } | { ok: false; reason: string } {
  const project = resolveIssueDestinationProject(
    input.projects,
    input.issue.repo,
    input.workspacePaths,
  );
  if (!project) {
    return { ok: false, reason: "Add a project first — drafts need a board to land on." };
  }

  const composer = useComposerDraftStore.getState();
  const provider = composer.stickyActiveProvider ?? input.defaultProvider;
  const stickyModel = composer.stickyModelSelectionByProvider[provider];
  const model = stickyModel?.model ?? getDefaultModel(provider);
  if (!model) {
    return { ok: false, reason: "No default model is available for the current provider." };
  }

  const modelSelection = buildModelSelection(
    provider,
    model,
    stickyModel?.options,
    stickyModel?.provider === "claudeAgent" ? stickyModel.supportsAutoMode : undefined,
  );
  const threadId = createKanbanDraftTask({
    projectId: project.id,
    prompt: buildIssueDraftPrompt(input.issue),
    modelSelection,
    runtimeMode: DEFAULT_RUNTIME_MODE,
    interactionMode: DEFAULT_INTERACTION_MODE,
    envMode: "local",
  });
  markIssueAccepted(input.issue.id);
  return { ok: true, threadId, projectId: project.id };
}
