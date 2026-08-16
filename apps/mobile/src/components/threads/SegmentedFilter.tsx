import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";

export type SegmentedFilterOption<T extends string> = {
  readonly value: T;
  readonly label: string;
  readonly count?: number;
};

export function SegmentedFilter<T extends string>({
  value,
  options,
  onChange,
}: {
  readonly value: T;
  readonly options: readonly SegmentedFilterOption<T>[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {options.map((option) => {
        const selected = option.value === value;
        const count = option.count;
        const label =
          count !== undefined && count > 0 ? `${option.label} (${count})` : option.label;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected ? styles.segmentSelected : null]}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: "row",
    backgroundColor: colors.elevated,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  segment: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.pill,
  },
  segmentSelected: {
    backgroundColor: colors.elevatedStrong,
  },
  label: {
    ...type.chip,
    color: colors.textMuted,
  },
  labelSelected: {
    color: colors.text,
  },
});
