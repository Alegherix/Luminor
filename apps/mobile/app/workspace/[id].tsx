import { useLocalSearchParams, useRouter } from "expo-router";

import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function WorkspaceScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen
      title={params.id ?? strings.screens.workspace}
      emptyTitle={strings.empty.workspaceTitle}
      emptyBody={strings.empty.workspaceBody}
      showBack
      onBack={() => router.back()}
    />
  );
}
