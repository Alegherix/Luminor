import { Ionicons } from "@expo/vector-icons";
import type { OrchestrationLatestTurn, OrchestrationSession } from "@luminor/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { StatusChip } from "../shared/StatusChip";
import { formatMinutesShort } from "./timeAgo";
import { sessionStatusKind } from "./turnState";

export function SessionCard({
  session,
  latestTurn,
  nowMs,
}: {
  readonly session: OrchestrationSession;
  readonly latestTurn: OrchestrationLatestTurn | null;
  readonly nowMs: number;
}) {
  const [open, setOpen] = useState(false);
  const name = session.providerName ?? strings.thread.session;
  const startedAt = latestTurn?.startedAt ?? session.updatedAt;
  const elapsed =
    session.status === "running" || session.status === "starting"
      ? formatMinutesShort(startedAt, nowMs)
      : null;
  return (
    <View style={styles.card}>
      <Pressable onPress={() => setOpen((current) => !current)} style={styles.header}>
        <View style={styles.titles}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {elapsed ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
        </View>
        <StatusChip status={sessionStatusKind(session.status)} />
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.textMuted} />
      </Pressable>
      {open ? (
        <View style={styles.body}>
          <Text style={styles.meta}>{session.runtimeMode}</Text>
          {session.lastError ? (
            <Text style={styles.error}>
              {strings.thread.sessionError}: {session.lastError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
    gap: spacing.sm,
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...type.cardTitle,
    color: colors.text,
  },
  elapsed: {
    ...type.meta,
    color: colors.textMuted,
  },
  body: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
  },
  meta: {
    ...type.meta,
    color: colors.textMuted,
  },
  error: {
    ...type.meta,
    color: colors.danger,
  },
});
