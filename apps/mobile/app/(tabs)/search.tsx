import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function SearchScreen() {
  return (
    <PlaceholderScreen
      title={strings.screens.search}
      emptyTitle={strings.empty.searchTitle}
      emptyBody={strings.empty.searchBody}
    />
  );
}
