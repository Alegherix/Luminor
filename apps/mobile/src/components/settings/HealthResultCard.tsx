import { StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";
import type { HealthDisplay } from "./formatHealth";

export function HealthResultCard({ result }: { readonly result: HealthDisplay }) {
  return (
    <View style={styles.wrap}>
      <Text style={[styles.title, { color: result.ok ? colors.success : colors.danger }]}>
        {result.title}
      </Text>
      <Text style={styles.detail}>{result.detail}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: 2,
  },
  title: {
    ...type.cardTitle,
  },
  detail: {
    ...type.meta,
    color: colors.textMuted,
  },
});
