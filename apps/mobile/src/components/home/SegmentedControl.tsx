import { Pressable, StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import { Badge } from "../shared/Badge";

export type HomeSegment = "spaces" | "activity" | "pinned";

export function SegmentedControl({
  value,
  onChange,
  spacesLabel,
  activityLabel,
  pinnedLabel,
  pinnedCount,
}: {
  readonly value: HomeSegment;
  readonly onChange: (next: HomeSegment) => void;
  readonly spacesLabel: string;
  readonly activityLabel: string;
  readonly pinnedLabel: string;
  readonly pinnedCount: number;
}) {
  return (
    <View style={styles.track}>
      <Segment
        label={spacesLabel}
        selected={value === "spaces"}
        onPress={() => onChange("spaces")}
      />
      <Segment
        label={activityLabel}
        selected={value === "activity"}
        onPress={() => onChange("activity")}
      />
      <Segment
        label={pinnedLabel}
        selected={value === "pinned"}
        onPress={() => onChange("pinned")}
        {...(pinnedCount > 0 ? { badge: pinnedCount } : {})}
      />
    </View>
  );
}

function Segment({
  label,
  selected,
  onPress,
  badge,
}: {
  readonly label: string;
  readonly selected: boolean;
  readonly onPress: () => void;
  readonly badge?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segment, selected ? styles.segmentSelected : null]}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
    >
      <Text style={[styles.label, selected ? styles.labelSelected : null]}>{label}</Text>
      {badge !== undefined ? <Badge count={badge} /> : null}
    </Pressable>
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
    marginBottom: spacing.xl,
  },
  segment: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
    paddingVertical: 8,
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
