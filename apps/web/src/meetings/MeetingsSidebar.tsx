import { MeetingsSidebarList } from "./MeetingsSidebarList";
import { useMeetingsWorkspace } from "./useMeetingsWorkspace";

export function MeetingsSidebar() {
  const { snapshot, selectSession, joinSession, connect, connecting, connectError } =
    useMeetingsWorkspace();

  return (
    <MeetingsSidebarList
      workspace={snapshot}
      onSelectSession={selectSession}
      onJoinSession={(sessionId) => {
        void joinSession(sessionId);
      }}
      onConnect={() => {
        void connect();
      }}
      connecting={connecting}
      connectError={connectError}
    />
  );
}
