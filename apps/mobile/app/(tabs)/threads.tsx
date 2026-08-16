import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function ThreadsScreen() {
  return (
    <PlaceholderScreen
      title={strings.screens.threads}
      emptyTitle={strings.empty.threadsTitle}
      emptyBody={strings.empty.threadsBody}
    />
  );
}
