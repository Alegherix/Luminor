import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import { IconTile } from "../shared/IconTile";
import { StatusChip } from "../shared/StatusChip";
import type { SessionRowModel } from "./shellSelectors";

const DOT_COLOR = {
  running: colors.success,
  active: colors.warning,
  idle: colors.warning,
  "needs-attention": colors.danger,
} as const;

export function SessionRow({
  session,
  onPress,
}: {
  readonly session: SessionRowModel;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <View style={[styles.dot, { backgroundColor: DOT_COLOR[session.status] }]} />
      <IconTile
        label={session.title}
        size={36}
        backgroundColor={colors.tealMuted}
        color={colors.teal}
      />
      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={1}>
          {session.title}
        </Text>
        {session.subtitle ? (
          <Text style={styles.subtitle} numberOfLines={1}>
            {session.subtitle}
          </Text>
        ) : null}
      </View>
      <View style={styles.trailing}>
        <StatusChip status={session.status} />
        {session.timeLabel ? <Text style={styles.time}>{session.timeLabel}</Text> : null}
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
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  body: {
    flex: 1,
    gap: 2,
    minWidth: 0,
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
