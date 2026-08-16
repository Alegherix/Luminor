import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import { IconTile } from "../shared/IconTile";
import type { PinnedCardModel } from "../home/shellSelectors";

export function PinnedGrid({
  items,
  onPress,
}: {
  readonly items: readonly PinnedCardModel[];
  readonly onPress: (id: string) => void;
}) {
  return (
    <View style={styles.grid}>
      {items.map((item) => (
        <Pressable key={item.id} onPress={() => onPress(item.id)} style={styles.card}>
          <View style={styles.top}>
            <IconTile label={item.title} size={32} />
            <Ionicons name="pin" size={14} color={colors.accent} />
          </View>
          <Text style={styles.title} numberOfLines={2}>
            {item.title}
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {item.subtitle}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: "48%",
    flexGrow: 0,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  top: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
  },
});
