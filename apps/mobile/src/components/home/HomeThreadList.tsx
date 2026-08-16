import { StyleSheet, View } from "react-native";

import { spacing } from "../../theme/tokens";
import { ThreadRow } from "../shared/ThreadRow";
import type { ThreadRowModel } from "./shellSelectors";

export function HomeThreadList({
  threads,
  onPressThread,
  showUnread,
}: {
  readonly threads: readonly ThreadRowModel[];
  readonly onPressThread: (id: string) => void;
  readonly showUnread?: boolean;
}) {
  return (
    <View style={styles.list}>
      {threads.map((thread) => (
        <ThreadRow
          key={thread.id}
          title={thread.title}
          subtitle={thread.subtitle}
          status={thread.status}
          {...(thread.timeLabel ? { timeLabel: thread.timeLabel } : {})}
          {...(showUnread && thread.unreadCount > 0 ? { unreadCount: thread.unreadCount } : {})}
          onPress={() => onPressThread(thread.id)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
