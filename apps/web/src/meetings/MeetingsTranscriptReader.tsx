import { useState } from "react";

import { Button } from "~/components/ui/button";
import { MeetingNotesEditor } from "./MeetingNotesEditor";
import {
  MeetingsReviewTabs,
  meetingsReviewPanelHidden,
  type MeetingsReviewTab,
} from "./MeetingsReviewTabs";
import { formatMeetingTimeRange } from "./meetingsSchedule";
import { compactMeetingsSummaryError } from "./meetingsSummary";
import {
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  selectedMeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";
import { useMeetingNotes } from "./useMeetingNotes";

const REVIEW_CARD_CLASS =
  "rounded-xl border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)]";

function MeetingNotesPanel({ sessionId }: { readonly sessionId: string }) {
  const { notes, setNotes, status } = useMeetingNotes(sessionId);

  return (
    <section className="flex flex-col gap-3" aria-label="Anteckningar">
      <MeetingNotesEditor
        notes={notes}
        status={status}
        onNotesChange={setNotes}
        placeholder="Inga anteckningar än — skriv här så sparas de till mötet."
      />
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
  const [tab, setTab] = useState<MeetingsReviewTab>("overview");
  const selected = selectedMeetingSession(workspace);
  const transcription = workspace.transcription;
  const summary = workspace.summary;
  const showRecovery =
    transcription.status === "needs-environment" ||
    (transcription.status === "failed" &&
      transcription.error === MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY);
  const canOpenInChat =
    Boolean(onOpenInChat) && transcription.status === "ready" && Boolean(transcription.text);
  const timeRange = selected ? formatMeetingTimeRange(selected) : null;

  return (
    <section
      className="flex h-full min-h-0 flex-1 justify-center overflow-y-auto px-6 py-8"
      aria-label="Meeting transcript"
    >
      <div className="flex w-full max-w-4xl flex-col gap-5">
        {onBack ? (
          <div>
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Back
            </Button>
          </div>
        ) : null}
        <header className="flex flex-col gap-2">
          <p className="text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-muted-foreground">
            Ended meeting
          </p>
          <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
            {selected?.title ?? "Transcript"}
          </h1>
          {timeRange ? (
            <p className="text-sm text-muted-foreground">{timeRange}</p>
          ) : null}
        </header>

        <MeetingsReviewTabs tab={tab} onTabChange={setTab} />

        <div hidden={meetingsReviewPanelHidden(tab, "overview")}>
          <div className="flex flex-col gap-4">
            {summary.status === "running" ? (
              <p className="text-sm text-muted-foreground" role="status">
                Summarizing…
              </p>
            ) : null}
            {summary.status === "ready" && summary.text ? (
              <section className={`${REVIEW_CARD_CLASS} flex flex-col gap-2 p-5`} aria-label="Sammanfattning">
                <h2 className="text-sm font-semibold text-foreground">Sammanfattning</h2>
                <article className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                  {summary.text}
                </article>
              </section>
            ) : null}
            {summary.status === "failed" ? (
              <p className="text-sm text-muted-foreground" role="status">
                {summary.error ? compactMeetingsSummaryError(summary.error) : "Summary is unavailable."}
              </p>
            ) : null}
            {summary.status === "idle" || (summary.status === "ready" && !summary.text) ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Ingen sammanfattning finns för det här mötet än.
              </p>
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
        </div>

        <div hidden={meetingsReviewPanelHidden(tab, "transcript")}>
          {transcription.status === "running" ? (
            <p className="text-sm text-muted-foreground" role="status">
              Transcribing…
            </p>
          ) : null}
          {transcription.status === "ready" && transcription.text ? (
            <article className={`${REVIEW_CARD_CLASS} whitespace-pre-wrap p-5 text-sm leading-6 text-foreground`}>
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
        </div>

        <div hidden={meetingsReviewPanelHidden(tab, "notes")}>
          {workspace.selectedSessionId === null ? null : (
            <MeetingNotesPanel
              key={workspace.selectedSessionId}
              sessionId={workspace.selectedSessionId}
            />
          )}
        </div>
      </div>
    </section>
  );
}
