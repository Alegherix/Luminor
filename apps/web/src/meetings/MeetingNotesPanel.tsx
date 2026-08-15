import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { disclosureWidthClassName } from "~/lib/disclosureMotion";
import { PanelRightCloseIcon } from "~/lib/icons";
import { cn } from "~/lib/utils";

import {
  MEETING_NOTES_PANEL_ID,
  MEETING_NOTES_PANEL_TITLE_ID,
  meetingNotesRemainingLabel,
  meetingNotesSaveState,
} from "./MeetingNotesPanel.logic";
import { MEETINGS_NOTES_MAX_CHARS, type MeetingsNotesStatus } from "./meetingsNotes";

export function MeetingNotesPanel({
  open,
  notes,
  status,
  onNotesChange,
  onClose,
}: {
  readonly open: boolean;
  readonly notes: string;
  readonly status: MeetingsNotesStatus;
  readonly onNotesChange: (notes: string) => void;
  readonly onClose: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const previousOpenRef = useRef(open);
  const saveState = meetingNotesSaveState(status);
  const remainingLabel = meetingNotesRemainingLabel(notes);

  useEffect(() => {
    const justOpened = open && !previousOpenRef.current;
    previousOpenRef.current = open;
    if (justOpened) {
      textareaRef.current?.focus();
    }
  }, [open]);

  return (
    <aside
      id={MEETING_NOTES_PANEL_ID}
      aria-labelledby={MEETING_NOTES_PANEL_TITLE_ID}
      aria-hidden={open ? undefined : true}
      inert={!open}
      className={disclosureWidthClassName(open, "w-80", "h-full shrink-0")}
    >
      <div className="flex h-full w-80 min-w-80 flex-col border-l border-border bg-card">
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border py-2 pr-2 pl-3">
          <h2
            id={MEETING_NOTES_PANEL_TITLE_ID}
            className="text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-muted-foreground"
          >
            Notes
          </h2>
          <div className="flex min-w-0 items-center gap-1">
            <span
              role="status"
              aria-live="polite"
              className={cn(
                "truncate text-[length:var(--app-font-size-ui-sm,11px)]",
                saveState?.tone === "destructive" ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {saveState?.label ?? ""}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Hide notes"
              onClick={onClose}
            >
              <PanelRightCloseIcon />
            </Button>
          </div>
        </div>
        <textarea
          ref={textareaRef}
          aria-label="Meeting notes"
          className="font-system-ui min-h-0 flex-1 resize-none bg-transparent px-3 py-2 text-[length:var(--app-font-size-ui,12px)] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          placeholder="Type while the meeting runs. Notes save automatically."
          maxLength={MEETINGS_NOTES_MAX_CHARS}
          value={notes}
          onChange={(event) => {
            onNotesChange(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              onClose();
            }
          }}
        />
        {remainingLabel ? (
          <p className="shrink-0 px-3 pb-2 text-right text-[length:var(--app-font-size-ui-sm,11px)] text-muted-foreground">
            {remainingLabel}
          </p>
        ) : null}
      </div>
    </aside>
  );
}
