import { useState } from "react";

import { Button } from "~/components/ui/button";
import { DisclosureChevron } from "~/components/ui/DisclosureChevron";
import { DisclosureRegion } from "~/components/ui/DisclosureRegion";
import { MeetingNotesEditor } from "./MeetingNotesEditor";
import { compactMeetingsSummaryError } from "./meetingsSummary";
import {
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  selectedMeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";
import { useMeetingNotes } from "./useMeetingNotes";

function MeetingNotesSection({ sessionId }: { readonly sessionId: string }) {
  const [open, setOpen] = useState(true);
  const { notes, setNotes, status } = useMeetingNotes(sessionId);

  return (
    <section className="flex flex-col gap-2" aria-label="Anteckningar">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((previous) => !previous)}
        className="flex w-fit items-center gap-1.5 text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <DisclosureChevron open={open} />
        Anteckningar
      </button>
      <DisclosureRegion open={open}>
        <MeetingNotesEditor
          notes={notes}
          status={status}
          onNotesChange={setNotes}
          placeholder="Inga anteckningar än — skriv här så sparas de till mötet."
        />
      </DisclosureRegion>
    </section>
  );
}

export function MeetingsTranscriptReader({
  workspace,
  onBack,
  onPointAtEnvironment,
  onOpenInChat,
  pointing = false,
  openingInChat = false,
}: {
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly onBack?: () => void;
  readonly onPointAtEnvironment?: () => void;
  readonly onOpenInChat?: () => void;
  readonly pointing?: boolean;
  readonly openingInChat?: boolean;
}) {
  const selected = selectedMeetingSession(workspace);
  const transcription = workspace.transcription;
  const summary = workspace.summary;
  const showRecovery =
    transcription.status === "needs-environment" ||
    (transcription.status === "failed" &&
      transcription.error === MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY);
  const canOpenInChat =
    Boolean(onOpenInChat) && transcription.status === "ready" && Boolean(transcription.text);

  return (
    <section
      className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto px-6 py-8"
      aria-label="Meeting transcript"
    >
      <div className="flex w-full max-w-2xl flex-col gap-4">
        {onBack ? (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <p className="text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-muted-foreground">
            Ended meeting
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {selected?.title ?? "Transcript"}
          </h1>
        </div>

        {transcription.status === "running" ? (
          <p className="text-sm text-muted-foreground" role="status">
            Transcribing…
          </p>
        ) : null}

        {summary.status === "running" ? (
          <p className="text-sm text-muted-foreground" role="status">
            Summarizing…
          </p>
        ) : null}

        {summary.status === "ready" && summary.text ? (
          <article
            className="whitespace-pre-wrap text-sm leading-6 text-foreground"
            aria-label="Meeting summary"
          >
            {summary.text}
          </article>
        ) : null}

        {summary.status === "failed" ? (
          <p className="text-sm text-muted-foreground" role="status">
            {summary.error ? compactMeetingsSummaryError(summary.error) : "Summary is unavailable."}
          </p>
        ) : null}

        {workspace.selectedSessionId === null ? null : (
          <MeetingNotesSection
            key={workspace.selectedSessionId}
            sessionId={workspace.selectedSessionId}
          />
        )}

        {transcription.status === "ready" && transcription.text ? (
          <article className="whitespace-pre-wrap text-sm leading-6 text-foreground">
            {transcription.text}
          </article>
        ) : null}

        {transcription.status === "idle" ? (
          <p className="text-sm text-muted-foreground">Transcript is not ready yet.</p>
        ) : null}

        {transcription.status === "failed" && !showRecovery ? (
          <p className="text-sm text-destructive" role="alert">
            {transcription.error ?? "Transcription failed."}
          </p>
        ) : null}

        {showRecovery ? (
          <div className="flex flex-col gap-3" role="alert">
            <p className="text-sm text-foreground">{MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY}</p>
            <Button
              type="button"
              onClick={() => onPointAtEnvironment?.()}
              disabled={pointing || !onPointAtEnvironment}
            >
              {pointing ? "Looking…" : "Point at the environment"}
            </Button>
          </div>
        ) : null}

        {canOpenInChat ? (
          <div>
            <Button
              type="button"
              onClick={() => onOpenInChat?.()}
              disabled={openingInChat || !onOpenInChat}
            >
              {openingInChat ? "Opening…" : "Öppna i chatt"}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
