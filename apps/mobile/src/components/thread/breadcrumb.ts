import type {
  OrchestrationProjectShell,
  OrchestrationSpaceShell,
  OrchestrationThread,
} from "@luminor/contracts";

export function threadBreadcrumb(
  thread: Pick<OrchestrationThread, "projectId">,
  projects: readonly OrchestrationProjectShell[],
  spaces: readonly OrchestrationSpaceShell[],
): string | null {
  const project = projects.find((item) => item.id === thread.projectId);
  if (!project) return null;
  const space = project.spaceId ? spaces.find((item) => item.id === project.spaceId) : undefined;
  return space ? `${space.name} • ${project.title}` : project.title;
}
