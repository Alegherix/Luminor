import { createFileRoute, redirect } from "@tanstack/react-router";

import { RouteInsetSurface } from "~/components/RouteInsetSurface";
import { MeetingsIdleCanvas } from "~/meetings/MeetingsIdleCanvas";
import { useMeetingsWorkspace } from "~/meetings/useMeetingsWorkspace";
import { isElectron } from "~/env";

function MeetingsIndexRouteView() {
  const { snapshot } = useMeetingsWorkspace();
  return (
    <RouteInsetSurface>
      <MeetingsIdleCanvas workspace={snapshot} />
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
