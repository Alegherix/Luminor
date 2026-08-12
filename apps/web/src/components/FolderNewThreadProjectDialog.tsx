// FILE: FolderNewThreadProjectDialog.tsx
// Purpose: Ask which project a thread started inside a space folder belongs to.
// Layer: Sidebar UI component
// Exports: FolderNewThreadProjectDialog

import type { ProjectId } from "@luminor/contracts";
import { useMemo, useState } from "react";

import {
  Command,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
} from "~/components/ui/command";
import { HiOutlineFolderOpen } from "react-icons/hi2";

import { filterFolderNewThreadProjects, type FolderNewThreadProject } from "./Sidebar.logic";

export function FolderNewThreadProjectDialog(props: {
  open: boolean;
  folderName: string;
  projects: readonly FolderNewThreadProject[];
  onOpenChange: (open: boolean) => void;
  onSelectProject: (projectId: ProjectId) => void;
}) {
  return (
    <CommandDialog open={props.open} onOpenChange={props.onOpenChange}>
      <CommandDialogPopup className="max-w-lg">
        <FolderNewThreadProjectList
          folderName={props.folderName}
          projects={props.projects}
          onOpenChange={props.onOpenChange}
          onSelectProject={props.onSelectProject}
        />
      </CommandDialogPopup>
    </CommandDialog>
  );
}

function FolderNewThreadProjectList(props: {
  folderName: string;
  projects: readonly FolderNewThreadProject[];
  onOpenChange: (open: boolean) => void;
  onSelectProject: (projectId: ProjectId) => void;
}) {
  const [query, setQuery] = useState("");
  const matchedProjects = useMemo(
    () => filterFolderNewThreadProjects({ projects: props.projects, query }),
    [props.projects, query],
  );

  return (
    <Command autoHighlight={false} mode="none">
      <CommandPanel className="overflow-hidden">
        <div className="border-b border-border/70 px-4 py-3">
          <p className="font-medium text-[length:var(--app-font-size-ui,12px)] text-foreground">
            New thread in “{props.folderName}”
          </p>
          <p className="mt-1 text-[length:var(--app-font-size-ui-meta,10px)] text-muted-foreground">
            Choose the project this thread belongs to. It cannot be changed later.
          </p>
        </div>
        <CommandInput
          placeholder="Search projects"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <CommandList className="max-h-[min(20rem,50vh)] not-empty:px-1.5 not-empty:pt-0 not-empty:pb-1.5">
          {matchedProjects.length === 0 ? (
            <CommandEmpty className="py-10">
              <div className="text-center text-[length:var(--app-font-size-ui,12px)] text-muted-foreground/79">
                No matching projects in this space.
              </div>
            </CommandEmpty>
          ) : (
            <CommandGroup>
              {matchedProjects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={project.id}
                  className="cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5"
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    props.onOpenChange(false);
                    props.onSelectProject(project.id);
                  }}
                >
                  <div className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
                    <HiOutlineFolderOpen className="size-[15px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[length:var(--app-font-size-ui,12px)] text-foreground">
                      {project.name || "Untitled project"}
                    </div>
                    <div className="truncate text-[length:var(--app-font-size-ui-meta,10px)] text-muted-foreground/79">
                      {project.cwd}
                    </div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandPanel>
    </Command>
  );
}
