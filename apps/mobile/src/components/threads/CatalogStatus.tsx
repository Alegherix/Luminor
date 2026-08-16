import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors, spacing, type } from "../../theme/tokens";
import { EmptyState } from "../shared/EmptyState";

export function CatalogLoading({ label }: { readonly label: string }) {
  return (
    <View style={styles.loading}>
      <ActivityIndicator color={colors.accent} />
      <Text style={styles.loadingLabel}>{label}</Text>
    </View>
  );
}

export function CatalogEmpty({ title, body }: { readonly title: string; readonly body: string }) {
  return <EmptyState title={title} body={body} />;
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
    gap: spacing.md,
  },
  loadingLabel: {
    ...type.meta,
    color: colors.textMuted,
  },
});
