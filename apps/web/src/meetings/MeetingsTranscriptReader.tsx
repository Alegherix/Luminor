import { useState } from "react";

import { Button } from "~/components/ui/button";
import { MeetingNotesEditor } from "./MeetingNotesEditor";
import {
  MeetingsReviewTabs,
  meetingsReviewPanelHidden,
  type MeetingsReviewTab,
} from "./MeetingsReviewTabs";
import { formatMeetingTimeRange } from "./meetingsSchedule";
import { compactMeetingsSummaryError, parseMeetingsReviewMarkdown } from "./meetingsSummary";
import {
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  selectedMeetingSession,
  type MeetingsSummaryState,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";
import { useMeetingNotes } from "./useMeetingNotes";

const REVIEW_CARD_CLASS =
  "rounded-xl border border-[color:var(--color-border)] bg-[var(--color-background-elevated-primary-opaque)]";

function OverviewPanel({
  summary,
  canOpenInChat,
  openingInChat,
  retrying = false,
  onOpenInChat,
  onRetrySummary,
}: {
  readonly summary: MeetingsSummaryState;
  readonly canOpenInChat: boolean;
  readonly openingInChat: boolean;
  readonly retrying?: boolean | undefined;
  readonly onOpenInChat?: (() => void) | undefined;
  readonly onRetrySummary?: (() => void) | undefined;
}) {
  const review =
    summary.status === "ready" && summary.text ? parseMeetingsReviewMarkdown(summary.text) : null;
  const hasReviewContent = Boolean(
    review && (review.overview || review.decisions.length > 0 || review.actionItems.length > 0),
  );

  return (
    <div className="flex flex-col gap-4">
      {summary.status === "running" ? (
        <p className="text-sm text-muted-foreground" role="status">
          Summarizing…
        </p>
      ) : null}
      {review?.overview ? (
        <section
          className={`${REVIEW_CARD_CLASS} flex flex-col gap-2 p-5`}
          aria-label="Sammanfattning"
        >
          <h2 className="text-sm font-semibold text-foreground">Sammanfattning</h2>
          <article className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
            {review.overview}
          </article>
        </section>
      ) : null}
      {review && review.decisions.length > 0 ? (
        <section className={`${REVIEW_CARD_CLASS} flex flex-col gap-2 p-5`} aria-label="Beslut">
          <h2 className="text-sm font-semibold text-foreground">Beslut</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
            {review.decisions.map((decision) => (
              <li key={decision}>{decision}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {review && review.actionItems.length > 0 ? (
        <section
          className={`${REVIEW_CARD_CLASS} flex flex-col gap-2 p-5`}
          aria-label="Åtgärdspunkter"
        >
          <h2 className="text-sm font-semibold text-foreground">Åtgärdspunkter</h2>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm leading-6 text-muted-foreground">
            {review.actionItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}
      {summary.status === "failed" ? (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-sm text-muted-foreground">
            {summary.error ? compactMeetingsSummaryError(summary.error) : "Summary is unavailable."}
          </p>
          {onRetrySummary ? (
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onRetrySummary}
                disabled={retrying}
              >
                {retrying ? "Generating…" : "Generate summary"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
      {summary.status === "idle" || (summary.status === "ready" && !hasReviewContent) ? (
        <p className="text-sm text-muted-foreground">
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
  );
}

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
  onRetrySummary,
  pointing = false,
  openingInChat = false,
}: {
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly onBack?: () => void;
  readonly onPointAtEnvironment?: () => void;
  readonly onOpenInChat?: () => void;
  readonly onRetrySummary?: () => void;
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
          {timeRange ? <p className="text-sm text-muted-foreground">{timeRange}</p> : null}
        </header>

        <MeetingsReviewTabs tab={tab} onTabChange={setTab} />

        <div hidden={meetingsReviewPanelHidden(tab, "overview")}>
          <OverviewPanel
            summary={summary}
            canOpenInChat={canOpenInChat}
            openingInChat={openingInChat}
            retrying={summary.status === "running"}
            onOpenInChat={onOpenInChat}
            onRetrySummary={onRetrySummary}
          />
        </div>

        <div hidden={meetingsReviewPanelHidden(tab, "transcript")}>
          {transcription.status === "running" ? (
            <p className="text-sm text-muted-foreground" role="status">
              Transcribing…
            </p>
          ) : null}
          {transcription.status === "ready" && transcription.text ? (
            <article
              className={`${REVIEW_CARD_CLASS} whitespace-pre-wrap p-5 text-sm leading-6 text-foreground`}
            >
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
              <p className="text-sm text-foreground">
                {MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY}
              </p>
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
