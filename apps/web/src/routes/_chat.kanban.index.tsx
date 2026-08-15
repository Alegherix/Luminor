import { createFileRoute } from "@tanstack/react-router";

import { IssueSyncPrototype } from "~/components/kanban/prototype/IssueSyncPrototype";
import KanbanView from "~/components/kanban/KanbanView";

export interface KanbanOverviewSearch {
  prototype?: "issues";
}

function parseKanbanOverviewSearch(raw: Record<string, unknown>): KanbanOverviewSearch {
  return raw.prototype === "issues" ? { prototype: "issues" } : {};
}

function KanbanOverviewRouteView() {
  const { prototype } = Route.useSearch();
  if (prototype === "issues") {
    return <IssueSyncPrototype />;
  }
  return <KanbanView projectId={null} />;
}

export const Route = createFileRoute("/_chat/kanban/")({
  validateSearch: parseKanbanOverviewSearch,
  component: KanbanOverviewRouteView,
});
