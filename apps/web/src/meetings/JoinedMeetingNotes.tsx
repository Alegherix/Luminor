import { MeetingNotesPanel } from "./MeetingNotesPanel";
import { useMeetingNotes } from "./useMeetingNotes";

export function JoinedMeetingNotes({
  sessionId,
  open,
  onClose,
}: {
  readonly sessionId: string;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { notes, setNotes, status } = useMeetingNotes(sessionId);

  return (
    <MeetingNotesPanel
      open={open}
      notes={notes}
      status={status}
      onNotesChange={setNotes}
      onClose={onClose}
    />
  );
}
