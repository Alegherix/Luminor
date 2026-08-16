import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { homeStrings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { IconTile } from "../shared/IconTile";
import type { WorkspaceSummary } from "./shellSelectors";

const TILE_TONES = [
  { backgroundColor: colors.accentMuted, color: colors.accent },
  { backgroundColor: colors.purpleMuted, color: colors.purple },
  { backgroundColor: colors.tealMuted, color: colors.teal },
] as const;

export function WorkspaceCard({
  workspace,
  selected,
  showTerminals,
  width,
  height,
  toneIndex,
  onPress,
}: {
  readonly workspace: WorkspaceSummary;
  readonly selected: boolean;
  readonly showTerminals: boolean;
  readonly width: number;
  readonly height: number;
  readonly toneIndex: number;
  readonly onPress: () => void;
}) {
  const tone = TILE_TONES[toneIndex % TILE_TONES.length] ?? {
    backgroundColor: colors.accentMuted,
    color: colors.accent,
  };
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, { width, height }, selected ? styles.cardSelected : null]}
    >
      <View style={styles.top}>
        <IconTile
          label={workspace.name}
          size={40}
          backgroundColor={tone.backgroundColor}
          color={tone.color}
        />
      </View>
      <Text style={styles.name} numberOfLines={2}>
        {workspace.name}
      </Text>
      <Text style={styles.subtitle} numberOfLines={1}>
        {workspace.subtitle}
      </Text>
      <View style={styles.stats}>
        <MiniStat icon="cube-outline" count={workspace.projectCount} label={homeStrings.projects} />
        <MiniStat
          icon="chatbubbles-outline"
          count={workspace.threadCount}
          label={homeStrings.threads}
        />
        {showTerminals ? (
          <MiniStat
            icon="terminal-outline"
            count={workspace.terminalCount}
            label={homeStrings.terminals}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

function MiniStat({
  icon,
  count,
  label,
}: {
  readonly icon: keyof typeof Ionicons.glyphMap;
  readonly count: number;
  readonly label: string;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={12} color={colors.textMuted} />
      <Text style={styles.statCount}>{count}</Text>
      <Text style={styles.statLabel} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  cardSelected: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  name: {
    ...type.cardTitle,
    fontWeight: "600",
    color: colors.text,
    marginTop: spacing.sm,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
    marginTop: 2,
  },
  stats: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  statCount: {
    ...type.chip,
    color: colors.text,
  },
  statLabel: {
    fontSize: 10,
    color: colors.textMuted,
  },
});
