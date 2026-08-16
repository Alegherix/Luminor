import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function SessionsScreen() {
  return (
    <PlaceholderScreen
      title={strings.screens.sessions}
      emptyTitle={strings.empty.sessionsTitle}
      emptyBody={strings.empty.sessionsBody}
    />
  );
}
