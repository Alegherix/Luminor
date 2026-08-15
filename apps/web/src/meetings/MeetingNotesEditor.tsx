import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { MEETINGS_NOTES_MAX_CHARS, type MeetingsNotesStatus } from "./meetingsNotes";

const NOTES_STATUS_LABELS: Record<MeetingsNotesStatus, string | null> = {
  idle: null,
  loading: "Laddar anteckningar…",
  saving: "Sparar…",
  saved: "Sparat",
  error: "Kunde inte spara — texten finns kvar",
};

const NOTES_COUNTER_VISIBLE_FROM = Math.floor(MEETINGS_NOTES_MAX_CHARS * 0.9);

const NOTES_TEXTAREA_CLASS =
  "[&_[data-slot=textarea]]:min-h-40 [&_[data-slot=textarea]]:px-3 [&_[data-slot=textarea]]:py-2 [&_[data-slot=textarea]]:leading-6";

export function meetingNotesStatusLabel(status: MeetingsNotesStatus): string | null {
  return NOTES_STATUS_LABELS[status];
}

export function meetingNotesCounterLabel(length: number): string | null {
  if (length < NOTES_COUNTER_VISIBLE_FROM) {
    return null;
  }
  return `${length} / ${MEETINGS_NOTES_MAX_CHARS}`;
}

export function MeetingNotesEditor({
  notes,
  status,
  onNotesChange,
  label = "Anteckningar",
  placeholder = "Skriv anteckningar…",
  className,
}: {
  readonly notes: string;
  readonly status: MeetingsNotesStatus;
  readonly onNotesChange: (notes: string) => void;
  readonly label?: string;
  readonly placeholder?: string;
  readonly className?: string;
}) {
  const statusLabel = meetingNotesStatusLabel(status);
  const counterLabel = meetingNotesCounterLabel(notes.length);

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Textarea
        aria-label={label}
        aria-busy={status === "loading" ? true : undefined}
        value={notes}
        placeholder={placeholder}
        maxLength={MEETINGS_NOTES_MAX_CHARS}
        onChange={(event) => onNotesChange(event.target.value)}
        className={cn("text-sm", NOTES_TEXTAREA_CLASS)}
      />
      <p
        className={cn(
          "flex min-h-4 items-center gap-2 text-[length:var(--app-font-size-ui-sm,11px)]",
          status === "error" ? "text-destructive" : "text-muted-foreground",
        )}
        role="status"
        aria-live="polite"
      >
        <span>{statusLabel}</span>
        {counterLabel ? <span className="ml-auto tabular-nums">{counterLabel}</span> : null}
      </p>
    </div>
  );
}
