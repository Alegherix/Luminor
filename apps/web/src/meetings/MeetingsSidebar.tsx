import { MeetingsSidebarList } from "./MeetingsSidebarList";
import { useMeetingsWorkspace } from "./useMeetingsWorkspace";

export function MeetingsSidebar() {
  const { snapshot, selectSession, connect, connecting, connectError } = useMeetingsWorkspace();

  return (
    <MeetingsSidebarList
      workspace={snapshot}
      onSelectSession={selectSession}
      onConnect={() => {
        void connect();
      }}
      connecting={connecting}
      connectError={connectError}
    />
  );
}
