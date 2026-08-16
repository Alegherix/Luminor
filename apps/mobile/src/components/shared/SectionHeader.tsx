import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";

export type SectionHeaderProps = {
  readonly title: string;
  readonly trailingLabel?: string;
  readonly onPressTrailing?: () => void;
};

export function SectionHeader({ title, trailingLabel, onPressTrailing }: SectionHeaderProps) {
  return (
    <View style={styles.row}>
      <Text style={styles.title}>{title}</Text>
      {trailingLabel ? (
        <Pressable onPress={onPressTrailing} hitSlop={8}>
          <Text style={styles.trailing}>{trailingLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  title: {
    ...type.section,
    color: colors.text,
  },
  trailing: {
    ...type.meta,
    color: colors.textMuted,
  },
});
