import { useLocalSearchParams, useRouter } from "expo-router";

import { PlaceholderScreen } from "../../src/components/shared/PlaceholderScreen";
import { strings } from "../../src/strings";

export default function ThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  return (
    <PlaceholderScreen
      title={params.id ?? strings.screens.thread}
      emptyTitle={strings.empty.threadTitle}
      emptyBody={strings.empty.threadBody}
      showBack
      onBack={() => router.back()}
    />
  );
}
