import { Ionicons } from "@expo/vector-icons";
import type { OrchestrationThreadActivity } from "@luminor/contracts";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import type { ActivityIconKind } from "./activityPresentation";
import { presentActivity } from "./activityPresentation";
import { formatTimeAgo } from "./timeAgo";

const ICON: Record<
  ActivityIconKind,
  { readonly name: keyof typeof Ionicons.glyphMap; readonly color: string; readonly bg: string }
> = {
  success: { name: "checkmark-circle", color: colors.success, bg: colors.successMuted },
  tool: { name: "construct", color: colors.teal, bg: colors.tealMuted },
  approval: { name: "alert-circle", color: colors.accent, bg: colors.accentMuted },
  error: { name: "close-circle", color: colors.danger, bg: colors.dangerMuted },
  info: { name: "information-circle", color: colors.purple, bg: colors.purpleMuted },
};

export function TimelineEvent({
  activity,
  connectAbove,
  connectBelow,
  nowMs,
}: {
  readonly activity: OrchestrationThreadActivity;
  readonly connectAbove: boolean;
  readonly connectBelow: boolean;
  readonly nowMs: number;
}) {
  const presented = presentActivity(activity);
  const icon = ICON[presented.icon];
  return (
    <View style={styles.row}>
      <View style={styles.rail}>
        <View style={[styles.railLine, styles.railTop, !connectAbove && styles.railHidden]} />
        <View style={[styles.tile, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={16} color={icon.color} />
        </View>
        <View style={[styles.railLine, styles.railBottom, !connectBelow && styles.railHidden]} />
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.title} numberOfLines={2}>
            {presented.title}
          </Text>
          <Text style={styles.time}>{formatTimeAgo(activity.createdAt, nowMs)}</Text>
        </View>
        {presented.body ? (
          <Text style={styles.detail} numberOfLines={2}>
            {presented.body}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  rail: {
    width: 32,
    alignItems: "center",
  },
  railLine: {
    width: 1,
    backgroundColor: colors.border,
    flex: 1,
  },
  railTop: {
    minHeight: 4,
  },
  railBottom: {
    minHeight: 12,
  },
  railHidden: {
    backgroundColor: "transparent",
  },
  tile: {
    width: 32,
    height: 32,
    borderRadius: radii.tile,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
  },
  body: {
    flex: 1,
    minWidth: 0,
    paddingBottom: spacing.md,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: spacing.sm,
  },
  title: {
    ...type.body,
    fontWeight: "600",
    color: colors.text,
    flex: 1,
  },
  time: {
    ...type.meta,
    color: colors.textMuted,
  },
  detail: {
    ...type.meta,
    color: colors.textMuted,
  },
});
