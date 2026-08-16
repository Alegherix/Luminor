import { Ionicons } from "@expo/vector-icons";
import type { OrchestrationMessage } from "@luminor/contracts";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";
import { AssistantMarkdown } from "./AssistantMarkdown";
import { formatClockTime } from "./timeAgo";

export const ChatMessage = memo(function ChatMessage({
  message,
}: {
  readonly message: OrchestrationMessage;
}) {
  if (message.role === "system") {
    return (
      <View style={styles.systemWrap}>
        <View style={styles.systemPill}>
          <View style={styles.systemDot} />
          <Text style={styles.systemText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  if (message.role === "user") {
    return (
      <View style={styles.userWrap}>
        <View style={styles.userBubble}>
          <Text style={styles.userText}>{message.text}</Text>
        </View>
        <View style={styles.userMeta}>
          <Text style={styles.userTime}>{formatClockTime(message.createdAt)}</Text>
          <Ionicons name="checkmark-done" size={14} color={colors.success} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.assistantWrap}>
      <AssistantMarkdown value={message.text} />
    </View>
  );
});

const styles = StyleSheet.create({
  assistantWrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  userWrap: {
    alignItems: "flex-end",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.xs,
  },
  userBubble: {
    maxWidth: "86%",
    backgroundColor: colors.elevatedStrong,
    borderRadius: radii.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  userText: {
    ...type.body,
    color: colors.text,
  },
  userMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  userTime: {
    ...type.meta,
    color: colors.textMuted,
  },
  systemWrap: {
    alignItems: "center",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  systemPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    backgroundColor: colors.elevated,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: "92%",
  },
  systemDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  systemText: {
    ...type.meta,
    color: colors.text,
    flexShrink: 1,
  },
});
