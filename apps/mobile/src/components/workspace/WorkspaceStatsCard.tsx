import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { workspaceStrings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";

export function WorkspaceStatsCard({
  projectCount,
  threadCount,
  runningTerminalCount,
  showTerminals,
}: {
  readonly projectCount: number;
  readonly threadCount: number;
  readonly runningTerminalCount: number;
  readonly showTerminals: boolean;
}) {
  return (
    <View style={styles.card}>
      <StatColumn
        icon="cube-outline"
        iconBackground={colors.accentMuted}
        iconColor={colors.accent}
        count={projectCount}
        label={workspaceStrings.projects}
      />
      <StatColumn
        icon="chatbubbles-outline"
        iconBackground={colors.purpleMuted}
        iconColor={colors.purple}
        count={threadCount}
        label={workspaceStrings.threads}
      />
      {showTerminals ? (
        <StatColumn
          icon="terminal-outline"
          iconBackground={colors.tealMuted}
          iconColor={colors.teal}
          count={runningTerminalCount}
          label={workspaceStrings.runningTerminals}
        />
      ) : null}
    </View>
  );
}

function StatColumn({
  icon,
  iconBackground,
  iconColor,
  count,
  label,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly iconBackground: string;
  readonly iconColor: string;
  readonly count: number;
  readonly label: string;
}) {
  return (
    <View style={styles.column}>
      <View style={[styles.icon, { backgroundColor: iconBackground }]}>
        <Ionicons name={icon} size={16} color={iconColor} />
      </View>
      <Text style={styles.count}>{count}</Text>
      <Text style={styles.label} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.lg,
  },
  column: {
    flex: 1,
    alignItems: "center",
    gap: spacing.sm,
  },
  icon: {
    width: 36,
    height: 36,
    borderRadius: radii.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  count: {
    fontSize: 20,
    fontWeight: "600",
    color: colors.text,
  },
  label: {
    ...type.meta,
    color: colors.textMuted,
    textAlign: "center",
  },
});
