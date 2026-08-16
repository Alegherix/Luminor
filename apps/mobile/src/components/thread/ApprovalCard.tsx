import type {
  OrchestrationPendingInteraction,
  OrchestrationThreadActivity,
} from "@luminor/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { describeApproval } from "./approvalDescription";

export function ApprovalCard({
  interaction,
  activities,
  busy,
  onRespond,
}: {
  readonly interaction: OrchestrationPendingInteraction;
  readonly activities: readonly OrchestrationThreadActivity[];
  readonly busy: boolean;
  readonly onRespond: (decision: "accept" | "decline") => Promise<void>;
}) {
  const copy = describeApproval(interaction, activities);
  const [error, setError] = useState<string | null>(null);
  const respond = async (decision: "accept" | "decline") => {
    setError(null);
    try {
      await onRespond(decision);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  };
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{copy.title}</Text>
      {copy.body ? <Text style={styles.body}>{copy.body}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          onPress={() => void respond("decline")}
          disabled={busy}
          style={[styles.button, styles.deny]}
        >
          <Text style={styles.denyLabel}>{strings.thread.deny}</Text>
        </Pressable>
        <Pressable
          onPress={() => void respond("accept")}
          disabled={busy}
          style={[styles.button, styles.approve]}
        >
          <Text style={styles.approveLabel}>{strings.thread.approve}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
  },
  body: {
    ...type.meta,
    color: colors.textMuted,
  },
  error: {
    ...type.meta,
    color: colors.danger,
  },
  actions: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  button: {
    flex: 1,
    borderRadius: radii.row,
    paddingVertical: spacing.sm,
    alignItems: "center",
  },
  approve: {
    backgroundColor: colors.accent,
  },
  deny: {
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border,
  },
  approveLabel: {
    ...type.cardTitle,
    color: colors.background,
  },
  denyLabel: {
    ...type.cardTitle,
    color: colors.text,
  },
});
