import { StyleSheet, Text, View } from "react-native";

import { colors, radii, type } from "../../theme/tokens";

export type BadgeProps = {
  readonly count?: number;
  readonly dot?: boolean;
  readonly tone?: "accent" | "purple";
};

export function Badge({ count, dot = false, tone = "accent" }: BadgeProps) {
  const backgroundColor = tone === "purple" ? colors.purple : colors.accent;
  if (dot) {
    return <View style={[styles.dot, { backgroundColor }]} />;
  }
  if (count === undefined || count <= 0) {
    return null;
  }
  return (
    <View style={[styles.count, { backgroundColor }]}>
      <Text style={styles.countText}>{count > 99 ? "99+" : String(count)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  count: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: {
    ...type.chip,
    color: colors.background,
  },
});
