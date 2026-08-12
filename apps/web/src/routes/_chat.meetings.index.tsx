import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { MeetingsIdleCanvas } from "~/meetings/MeetingsIdleCanvas";
import { IDLE_MEETINGS_WORKSPACE } from "~/meetings/meetingsWorkspace";
import { isElectron } from "~/env";

function MeetingsIndexRouteView() {
  return (
    <RouteInsetSurface>
      <MeetingsIdleCanvas workspace={IDLE_MEETINGS_WORKSPACE} />
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
