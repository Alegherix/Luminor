import { StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import type { ThreadStatusKind } from "../../state/threadStatus";
import { colors, radii, spacing, type } from "../../theme/tokens";

export type StatusChipProps = {
  readonly status: ThreadStatusKind;
};

const STATUS_STYLES: Record<
  ThreadStatusKind,
  { readonly color: string; readonly backgroundColor: string }
> = {
  active: { color: colors.accent, backgroundColor: colors.accentMuted },
  idle: { color: colors.warning, backgroundColor: colors.warningMuted },
  running: { color: colors.success, backgroundColor: colors.successMuted },
  "needs-attention": { color: colors.danger, backgroundColor: colors.dangerMuted },
};

const STATUS_LABELS: Record<ThreadStatusKind, string> = {
  active: strings.status.active,
  idle: strings.status.idle,
  running: strings.status.running,
  "needs-attention": strings.status.needsAttention,
};

export function StatusChip({ status }: StatusChipProps) {
  const tone = STATUS_STYLES[status];
  return (
    <View style={[styles.chip, { backgroundColor: tone.backgroundColor }]}>
      <Text style={[styles.label, { color: tone.color }]}>{STATUS_LABELS[status]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: "flex-start",
  },
  label: {
    ...type.chip,
  },
});
