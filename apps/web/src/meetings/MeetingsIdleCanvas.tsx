import { type FormEvent, useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { selectedMeetingSession, type MeetingsWorkspaceSnapshot } from "./meetingsWorkspace";

function MeetPlaceholderIcon() {
  return (
    <span
      className="flex size-12 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground"
      aria-hidden
    >
      <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
        <rect x="3" y="6" width="13" height="12" rx="2.5" fill="currentColor" opacity="0.9" />
        <path d="M16 10.5l4-2.2v7.4l-4-2.2z" fill="currentColor" opacity="0.9" />
      </svg>
    </span>
  );
}

export function MeetingsIdleCanvas({
  workspace,
  onJoinPastedUrl,
  onJoinSelected,
  joining = false,
}: {
  readonly workspace?: MeetingsWorkspaceSnapshot;
  readonly onJoinPastedUrl?: (url: string) => void;
  readonly onJoinSelected?: () => void;
  readonly joining?: boolean;
}) {
  const selectedMeeting = workspace ? selectedMeetingSession(workspace) : null;
  const [pastedMeetUrl, setPastedMeetUrl] = useState(workspace?.pastedMeetUrl ?? "");
  const joinError = workspace?.joinError ?? null;

  const submitPastedUrl = (event: FormEvent) => {
    event.preventDefault();
    const url = pastedMeetUrl.trim();
    if (url.length === 0 || joining) {
      return;
    }
    onJoinPastedUrl?.(url);
  };

  return (
    <section
      className="flex h-full min-h-0 items-center justify-center px-6 py-10"
      aria-label="Meeting cockpit empty state"
    >
      <div className="flex w-full max-w-md flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <MeetPlaceholderIcon />
          <div className="flex flex-col gap-1">
            <h1 className="font-heading text-2xl font-semibold tracking-tight text-foreground">
              Google Meet opens here
            </h1>
            <p className="text-sm text-muted-foreground">
              When you join the meeting, the call will appear in this window.
            </p>
          </div>
        </div>

        <form
          className="flex w-full flex-col gap-2 text-left"
          aria-label="Join Google Meet by link"
          onSubmit={submitPastedUrl}
        >
          <Label htmlFor="meetings-pasted-meet-url">Google Meet link</Label>
          <div className="flex items-center gap-2">
            <Input
              id="meetings-pasted-meet-url"
              type="url"
              inputMode="url"
              placeholder="https://meet.google.com/abc-defg-hij"
              value={pastedMeetUrl}
              onChange={(event) => setPastedMeetUrl(event.currentTarget.value)}
              className="min-w-0 flex-1"
              aria-invalid={joinError !== null}
            />
            <Button type="submit" disabled={joining || pastedMeetUrl.trim().length === 0}>
              Join
            </Button>
          </div>
          {joinError ? (
            <p className="text-sm text-destructive" role="alert">
              {joinError}
            </p>
          ) : null}
        </form>

        <fieldset
          className="w-full rounded-xl border border-border bg-card px-4 py-4 text-left"
          aria-label="Selected meeting"
        >
          <p className="text-[length:var(--app-font-size-ui-sm,11px)] font-medium text-muted-foreground">
            Selected meeting
          </p>
          {selectedMeeting ? (
            <div className="mt-2 flex flex-col gap-3">
              <p className="font-heading text-base font-medium text-foreground">
                {selectedMeeting.title}
              </p>
              <Button
                type="button"
                disabled={joining || !selectedMeeting.meetUrl}
                onClick={() => onJoinSelected?.()}
              >
                Join
              </Button>
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">Select a meeting to get started</p>
          )}
        </fieldset>
      </div>
    </section>
  );
}
