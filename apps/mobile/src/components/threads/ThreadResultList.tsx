import { FlatList, SectionList, StyleSheet, View } from "react-native";

import { spacing } from "../../theme/tokens";
import { SectionHeader } from "../shared/SectionHeader";
import { ThreadRow } from "../shared/ThreadRow";
import type { CatalogGroup, CatalogRow } from "./threadCatalog";

function ThreadResultRow({
  row,
  onPressThread,
}: {
  readonly row: CatalogRow;
  readonly onPressThread: (threadId: string) => void;
}) {
  return (
    <View style={styles.rowWrap}>
      <ThreadRow
        title={row.title}
        subtitle={row.subtitle}
        status={row.status}
        {...(row.timeLabel ? { timeLabel: row.timeLabel } : {})}
        {...(row.unreadCount > 0 ? { unreadCount: row.unreadCount } : {})}
        onPress={() => onPressThread(row.threadId)}
      />
    </View>
  );
}

export function ThreadResultList({
  rows,
  onPressThread,
}: {
  readonly rows: readonly CatalogRow[];
  readonly onPressThread: (threadId: string) => void;
}) {
  return (
    <FlatList
      data={rows}
      keyExtractor={(row) => row.threadId}
      renderItem={({ item }) => <ThreadResultRow row={item} onPressThread={onPressThread} />}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    />
  );
}

export function ThreadGroupList({
  groups,
  onPressThread,
}: {
  readonly groups: readonly CatalogGroup[];
  readonly onPressThread: (threadId: string) => void;
}) {
  return (
    <SectionList
      sections={groups.map((group) => ({
        key: group.key,
        title: group.title,
        data: group.rows,
      }))}
      keyExtractor={(row) => row.threadId}
      renderItem={({ item }) => <ThreadResultRow row={item} onPressThread={onPressThread} />}
      renderSectionHeader={({ section }) => <SectionHeader title={section.title} />}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingBottom: spacing.xxl,
  },
  rowWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
});
