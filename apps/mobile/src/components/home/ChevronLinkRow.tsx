import { Pressable, StyleSheet, Text } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";

export function ChevronLinkRow({
  label,
  onPress,
}: {
  readonly label: string;
  readonly onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    marginHorizontal: spacing.lg,
  },
  label: {
    ...type.cardTitle,
    color: colors.text,
  },
  chevron: {
    ...type.section,
    color: colors.textMuted,
  },
});
