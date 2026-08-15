import { useEffect, useState } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { MeetingReviewPrototype } from "~/meetings/prototype/MeetingReviewPrototype";
import { MeetingsEmbedCanvas } from "~/meetings/MeetingsEmbedCanvas";
import { MeetingsIdleCanvas } from "~/meetings/MeetingsIdleCanvas";
import { MeetingsTranscriptReader } from "~/meetings/MeetingsTranscriptReader";
import { meetingsSurfaceJoined, selectedMeetingSession } from "~/meetings/meetingsWorkspace";
import { useMeetingsWorkspace } from "~/meetings/useMeetingsWorkspace";
import { useOpenMeetingInChat } from "~/meetings/useOpenMeetingInChat";
import { isElectron } from "~/env";

export interface MeetingsIndexSearch {
  prototype?: "review";
}

function parseMeetingsIndexSearch(raw: Record<string, unknown>): MeetingsIndexSearch {
  return raw.prototype === "review" ? { prototype: "review" } : {};
}

function MeetingsIndexRouteView() {
  const { prototype } = Route.useSearch();
  if (prototype === "review") {
    return (
      <RouteInsetSurface>
        <MeetingReviewPrototype />
      </RouteInsetSurface>
    );
  }
  return <MeetingsWorkspaceRouteView />;
}

function MeetingsWorkspaceRouteView() {
  const {
    snapshot,
    selectSession,
    joinPastedUrl,
    joinSession,
    leave,
    hideEmbed,
    showEmbed,
    pointAtTranscriptionEnvironment,
  } = useMeetingsWorkspace();
  const { openInChat, opening } = useOpenMeetingInChat();
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
          presentation={snapshot.joinKind === "external" ? "external" : "embed"}
          onLeave={() => void leave()}
          recordingDegradation={snapshot.recording.degradation}
        />
      ) : showTranscript ? (
        <MeetingsTranscriptReader
          workspace={snapshot}
          pointing={pointing}
          openingInChat={opening}
          onBack={() => {
            selectSession(null);
          }}
          onOpenInChat={() => {
            void openInChat(snapshot);
          }}
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
          onSelectSession={selectSession}
          onJoinSession={(sessionId) => {
            void joinSession(sessionId);
          }}
        />
      )}
    </RouteInsetSurface>
  );
}

export const Route = createFileRoute("/_chat/meetings/")({
  validateSearch: parseMeetingsIndexSearch,
  beforeLoad: ({ search }) => {
    if (!isElectron && search.prototype !== "review") {
      throw redirect({ to: "/" });
    }
  },
  component: MeetingsIndexRouteView,
});
