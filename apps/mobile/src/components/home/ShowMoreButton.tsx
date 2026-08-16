import { Pressable, StyleSheet, Text } from "react-native";

import { strings } from "../../strings";
import { colors, spacing, type } from "../../theme/tokens";

export function ShowMoreButton({ onPress }: { readonly onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.button}>
      <Text style={styles.label}>
        {strings.common.showMore} ⌄
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignSelf: "center",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  label: {
    ...type.meta,
    color: colors.textMuted,
  },
});
