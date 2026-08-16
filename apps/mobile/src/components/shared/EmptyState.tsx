import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";

export type EmptyStateProps = {
  readonly title: string;
  readonly body: string;
};

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: "center",
    gap: spacing.sm,
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
    textAlign: "center",
  },
  body: {
    ...type.meta,
    color: colors.textMuted,
    textAlign: "center",
  },
});
