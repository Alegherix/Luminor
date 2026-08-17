import { useEffect, useState } from "react";
import type { ThreadId } from "@luminor/contracts";

import { formatRelativeTime } from "~/lib/relativeTime";
import { cn } from "~/lib/utils";
import {
  SIDEBAR_ROW_FOCUS_CLASS_NAME,
  SIDEBAR_ROW_HOVER_CLASS_NAME,
  SIDEBAR_SECTION_LABEL_CLASS_NAME,
} from "~/sidebarRowStyles";
import { ProviderIcon } from "../ProviderIcon";
import { SidebarUnreadCompletionGlyph } from "../SidebarStatusTrailingGlyph";
import { DisclosureChevron } from "../ui/DisclosureChevron";
import { DisclosureRegion, PresenceDisclosure } from "../ui/DisclosureRegion";
import type { SpaceJustFinishedItem } from "./spaceJustFinishedTypes";

function keepComposerFocus(event: { preventDefault: () => void }) {
  event.preventDefault();
}

function PeekRow(props: { item: SpaceJustFinishedItem; onActivate: () => void }) {
  const { item, onActivate } = props;
  return (
    <button
      type="button"
      onMouseDown={keepComposerFocus}
      onClick={onActivate}
      className={cn(
        "flex w-full min-w-0 cursor-pointer flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left",
        SIDEBAR_ROW_HOVER_CLASS_NAME,
        SIDEBAR_ROW_FOCUS_CLASS_NAME,
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-1.5">
        <ProviderIcon
          provider={item.provider}
          className="size-3 shrink-0"
          fallback={
            <span className="size-3 shrink-0 rounded-full border border-dashed border-muted-foreground/40" />
          }
        />
        <span className="min-w-0 flex-1 truncate text-[length:var(--app-font-size-ui,12px)] text-foreground/89">
          {item.title}
        </span>
        <SidebarUnreadCompletionGlyph />
      </span>
      <span className="flex w-full min-w-0 items-center gap-1 text-[11px] text-muted-foreground/70">
        <span className="truncate">{item.projectName}</span>
        <span aria-hidden>·</span>
        <span className="shrink-0">{formatRelativeTime(item.completedAt)}</span>
      </span>
    </button>
  );
}

export function SpaceJustFinishedPeek(props: {
  spaceName: string;
  items: ReadonlyArray<SpaceJustFinishedItem>;
  onOpenThread: (threadId: ThreadId) => void;
  onMarkVisited: (threadId: ThreadId, completedAt: string) => void;
}) {
  const { items, onMarkVisited, onOpenThread } = props;
  const [open, setOpen] = useState(false);
  const hasItems = items.length > 0;
  const drawerOpen = open && hasItems;

  useEffect(() => {
    if (!hasItems) {
      setOpen(false);
    }
  }, [hasItems]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen]);

  const markVisited = (threadIds: ReadonlyArray<SpaceJustFinishedItem>) => {
    for (const item of threadIds) {
      onMarkVisited(item.threadId, item.completedAt);
    }
  };

  return (
    <PresenceDisclosure open={hasItems}>
      <div className="pb-2">
        <button
          type="button"
          aria-expanded={drawerOpen}
          onMouseDown={keepComposerFocus}
          onClick={() => setOpen((current) => !current)}
          className={cn(
            "flex h-7 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-0.5 text-left",
            SIDEBAR_SECTION_LABEL_CLASS_NAME,
            SIDEBAR_ROW_FOCUS_CLASS_NAME,
            "hover:text-foreground",
          )}
        >
          <span
            aria-hidden
            className="size-[7px] shrink-0 rounded-full bg-emerald-500 dark:bg-emerald-300/90"
          />
          <span className="truncate">Just finished</span>
          <span className="shrink-0 text-muted-foreground/70">· {items.length}</span>
          <DisclosureChevron open={drawerOpen} className="ml-auto" />
        </button>

        <DisclosureRegion open={drawerOpen} contentClassName="pt-1">
          <div className="rounded-xl border border-sidebar-border bg-[color-mix(in_srgb,var(--sidebar-accent)_40%,transparent)] p-1">
            <div className="flex min-w-0 items-center gap-1.5 px-2 pt-1 pb-0.5">
              <span className="min-w-0 truncate text-[length:var(--app-font-size-ui,12px)] font-medium text-foreground/89">
                {props.spaceName}
              </span>
              <span className="shrink-0 text-[11px] text-muted-foreground/70">{items.length}</span>
              <button
                type="button"
                onMouseDown={keepComposerFocus}
                onClick={() => {
                  markVisited(items);
                  setOpen(false);
                }}
                className={cn(
                  "ml-auto shrink-0 cursor-pointer rounded-md px-1.5 py-0.5 text-[11px] text-muted-foreground/79 hover:text-foreground",
                  SIDEBAR_ROW_HOVER_CLASS_NAME,
                  SIDEBAR_ROW_FOCUS_CLASS_NAME,
                )}
              >
                Mark seen
              </button>
            </div>
            <div className="flex flex-col gap-0.5">
              {items.map((item) => (
                <PeekRow
                  key={item.threadId}
                  item={item}
                  onActivate={() => {
                    markVisited([item]);
                    onOpenThread(item.threadId);
                  }}
                />
              ))}
            </div>
          </div>
        </DisclosureRegion>
      </div>
    </PresenceDisclosure>
  );
}
