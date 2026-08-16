import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function HomeScreen() {
  return (
    <PlaceholderScreen
      title={strings.screens.home}
      emptyTitle={strings.empty.homeTitle}
      emptyBody={strings.empty.homeBody}
      showBrand
      showBell
    />
  );
}
