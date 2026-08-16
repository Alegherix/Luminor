import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";

import { colors, radii, spacing } from "../../theme/tokens";
import { SectionHeader } from "../shared/SectionHeader";

export function GroupedSection({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <SectionHeader title={title} />
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function SettingsDivider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  section: {
    gap: 0,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    overflow: "hidden",
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginLeft: spacing.lg,
  },
});
