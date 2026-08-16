import { Ionicons } from "@expo/vector-icons";
import type { OrchestrationCheckpointSummary } from "@luminor/contracts";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import { DiffStat } from "./DiffStat";
import { editedFilesLabel, sumDiffstat } from "./fileEditStats";
import { middleTruncate } from "./format";
import { formatTimeAgo } from "./timeAgo";

export function FileEditCard({
  edit,
  nowMs,
}: {
  readonly edit: OrchestrationCheckpointSummary;
  readonly nowMs: number;
}) {
  const totals = sumDiffstat(edit.files);
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <Text style={styles.title}>{editedFilesLabel(edit.files.length)}</Text>
          <DiffStat additions={totals.additions} deletions={totals.deletions} />
        </View>
        {edit.files.map((file) => (
          <View key={file.path} style={styles.fileRow}>
            <Ionicons name="document-text-outline" size={14} color={colors.textMuted} />
            <Text style={styles.path} numberOfLines={1}>
              {middleTruncate(file.path, 34)}
            </Text>
            <DiffStat additions={file.additions} deletions={file.deletions} />
          </View>
        ))}
      </View>
      <Text style={styles.time}>{formatTimeAgo(edit.completedAt, nowMs)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  card: {
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
    flex: 1,
  },
  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  path: {
    ...type.meta,
    color: colors.text,
    flex: 1,
    fontFamily: "monospace",
  },
  time: {
    ...type.meta,
    color: colors.textMuted,
    alignSelf: "flex-end",
  },
});
