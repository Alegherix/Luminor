import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import type { TaskProgressView } from "./taskProgress";

export function TaskProgressCard({ progress }: { readonly progress: TaskProgressView }) {
  const ratio = progress.total === 0 ? 0 : progress.completed / progress.total;
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{strings.thread.taskProgress}</Text>
        <Text style={styles.count}>
          {progress.completed} / {progress.total}
        </Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round(ratio * 100)}%` }]} />
      </View>
      <View style={styles.list}>
        {progress.items.map((item) => (
          <View key={`${item.state}:${item.label}`} style={styles.item}>
            {item.state === "done" ? (
              <Ionicons name="checkmark-circle" size={16} color={colors.success} />
            ) : (
              <View
                style={[
                  styles.ring,
                  item.state === "current" ? styles.ringCurrent : styles.ringPending,
                ]}
              />
            )}
            <Text
              style={[styles.label, item.state === "pending" && styles.labelPending]}
              numberOfLines={2}
            >
              {item.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.md,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
  },
  count: {
    ...type.meta,
    color: colors.textMuted,
  },
  track: {
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.elevatedStrong,
    overflow: "hidden",
  },
  fill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
  },
  list: {
    gap: spacing.sm,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  ring: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  ringCurrent: {
    borderColor: colors.accent,
  },
  ringPending: {
    borderColor: colors.tabInactive,
  },
  label: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },
  labelPending: {
    color: colors.textMuted,
  },
});
