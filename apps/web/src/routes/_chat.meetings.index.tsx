import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { MeetingsEmbedCanvas } from "~/meetings/MeetingsEmbedCanvas";
import { MeetingsIdleCanvas } from "~/meetings/MeetingsIdleCanvas";
import { MeetingsTranscriptReader } from "~/meetings/MeetingsTranscriptReader";
import { meetingsSurfaceJoined, selectedMeetingSession } from "~/meetings/meetingsWorkspace";
import { useMeetingsWorkspace } from "~/meetings/useMeetingsWorkspace";
import { isElectron } from "~/env";

function MeetingsIndexRouteView() {
  const {
    snapshot,
    joinPastedUrl,
    joinSession,
    leave,
    hideEmbed,
    showEmbed,
    pointAtTranscriptionEnvironment,
  } = useMeetingsWorkspace();
  const [pointing, setPointing] = useState(false);
  const selected = selectedMeetingSession(snapshot);
  const showTranscript = !meetingsSurfaceJoined(snapshot) && selected?.status === "ended";

  useEffect(() => {
    void showEmbed();
    return () => {
      void hideEmbed();
    };
  }, [hideEmbed, showEmbed, snapshot.joinedSessionId]);

  return (
    <RouteInsetSurface>
      {meetingsSurfaceJoined(snapshot) ? (
        <MeetingsEmbedCanvas
          onLeave={() => void leave()}
          recordingDegradation={snapshot.recording.degradation}
        />
      ) : showTranscript ? (
        <MeetingsTranscriptReader
          workspace={snapshot}
          pointing={pointing}
          onPointAtEnvironment={() => {
            setPointing(true);
            void pointAtTranscriptionEnvironment().finally(() => {
              setPointing(false);
            });
          }}
        />
      ) : (
        <MeetingsIdleCanvas
          workspace={snapshot}
          onJoinPastedUrl={(url) => {
            void joinPastedUrl(url);
          }}
          onJoinSelected={() => {
            if (snapshot.selectedSessionId) {
              void joinSession(snapshot.selectedSessionId);
            }
          }}
        />
      )}
    </RouteInsetSurface>
  );
}

export const Route = createFileRoute("/_chat/meetings/")({
  beforeLoad: () => {
    if (!isElectron) {
      throw redirect({ to: "/" });
    }
  },
  component: MeetingsIndexRouteView,
});
