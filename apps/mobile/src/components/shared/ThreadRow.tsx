import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ThreadStatusKind } from "../../state/threadStatus";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { Badge } from "./Badge";
import { IconTile } from "./IconTile";
import { StatusChip } from "./StatusChip";

export type ThreadRowProps = {
  readonly title: string;
  readonly subtitle: string;
  readonly timeLabel?: string;
  readonly status: ThreadStatusKind;
  readonly unreadCount?: number;
  readonly onPress?: () => void;
};

export function ThreadRow({
  title,
  subtitle,
  timeLabel,
  status,
  unreadCount,
  onPress,
}: ThreadRowProps) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <IconTile label={title} />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={styles.trailing}>
        {timeLabel ? <Text style={styles.time}>{timeLabel}</Text> : null}
        <StatusChip status={status} />
        {unreadCount && unreadCount > 0 ? <Badge count={unreadCount} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
  },
  trailing: {
    alignItems: "flex-end",
    gap: spacing.xs,
  },
  time: {
    ...type.meta,
    color: colors.textMuted,
  },
});
