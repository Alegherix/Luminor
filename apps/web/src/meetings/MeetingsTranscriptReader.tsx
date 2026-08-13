import { Button } from "~/components/ui/button";
import {
  MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY,
  selectedMeetingSession,
  type MeetingsWorkspaceSnapshot,
} from "./meetingsWorkspace";

export function MeetingsTranscriptReader({
  workspace,
  onPointAtEnvironment,
  pointing = false,
}: {
  readonly workspace: MeetingsWorkspaceSnapshot;
  readonly onPointAtEnvironment?: () => void;
  readonly pointing?: boolean;
}) {
  const selected = selectedMeetingSession(workspace);
  const transcription = workspace.transcription;
  const showRecovery =
    transcription.status === "needs-environment" ||
    (transcription.status === "failed" &&
      transcription.error === MEETINGS_TRANSCRIPTION_ENVIRONMENT_RECOVERY);

  return (
    <section className="flex h-full min-h-0 flex-col px-6 py-8" aria-label="Meeting transcript">
      <div className="mx-auto flex w-full max-w-2xl min-h-0 flex-1 flex-col gap-4">
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

        {transcription.status === "ready" && transcription.text ? (
          <article className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap text-sm leading-6 text-foreground">
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
    </section>
  );
}
