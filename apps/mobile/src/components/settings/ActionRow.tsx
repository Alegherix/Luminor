import { ActivityIndicator, Pressable, StyleSheet, Text } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";

export type ActionRowTone = "default" | "accent" | "danger";

export function ActionRow({
  label,
  onPress,
  loading = false,
  disabled = false,
  tone = "default",
  trailing,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading?: boolean;
  readonly disabled?: boolean;
  readonly tone?: ActionRowTone;
  readonly trailing?: string;
}) {
  const labelColor =
    tone === "danger" ? colors.danger : tone === "accent" ? colors.accent : colors.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
    >
      {loading ? (
        <ActivityIndicator color={labelColor} />
      ) : (
        <Text style={[styles.label, { color: labelColor }]}>{label}</Text>
      )}
      {trailing && !loading ? <Text style={styles.trailing}>{trailing}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 48,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  pressed: {
    backgroundColor: colors.elevatedStrong,
  },
  label: {
    ...type.cardTitle,
    color: colors.text,
  },
  trailing: {
    ...type.body,
    color: colors.textMuted,
  },
});
