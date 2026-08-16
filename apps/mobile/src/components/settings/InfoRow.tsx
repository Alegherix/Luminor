import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";

export function InfoRow({
  label,
  value,
  tone = "default",
}: {
  readonly label: string;
  readonly value: string;
  readonly tone?: "default" | "danger" | "success";
}) {
  const valueColor =
    tone === "danger" ? colors.danger : tone === "success" ? colors.success : colors.text;
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.value, { color: valueColor }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: 2,
  },
  label: {
    ...type.meta,
    color: colors.textMuted,
  },
  value: {
    ...type.body,
    color: colors.text,
  },
});
