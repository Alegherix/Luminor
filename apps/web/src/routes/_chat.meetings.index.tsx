import { useEffect } from "react";
import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { MeetingsEmbedCanvas } from "~/meetings/MeetingsEmbedCanvas";
import { MeetingsIdleCanvas } from "~/meetings/MeetingsIdleCanvas";
import { meetingsSurfaceJoined } from "~/meetings/meetingsWorkspace";
import { useMeetingsWorkspace } from "~/meetings/useMeetingsWorkspace";
import { isElectron } from "~/env";

function MeetingsIndexRouteView() {
  const { snapshot, joinPastedUrl, joinSession, leave, hideEmbed, showEmbed } =
    useMeetingsWorkspace();

  useEffect(() => {
    void showEmbed();
    return () => {
      void hideEmbed();
    };
  }, [hideEmbed, showEmbed, snapshot.joinedSessionId]);

  return (
    <RouteInsetSurface>
      {meetingsSurfaceJoined(snapshot) ? (
        <MeetingsEmbedCanvas onLeave={() => void leave()} />
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
