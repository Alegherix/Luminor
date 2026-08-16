import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { LayoutAnimation, Platform, Pressable, StyleSheet, Text, UIManager, View } from "react-native";

import { strings, workspaceStrings } from "../../strings";
import type { ThreadStatusKind } from "../../state/threadStatus";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { IconTile } from "../shared/IconTile";
import { ThreadRow } from "../shared/ThreadRow";
import type { ProjectGroupModel } from "../home/shellSelectors";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const DISCLOSURE_MS = 220;

function animateDisclosure(): void {
  LayoutAnimation.configureNext({
    duration: DISCLOSURE_MS,
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeOut },
    delete: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  });
}

export function ProjectAccordion({
  projects,
  onPressThread,
}: {
  readonly projects: readonly ProjectGroupModel[];
  readonly onPressThread: (id: string) => void;
}) {
  const firstId = projects[0]?.id;
  const [openId, setOpenId] = useState<string | null>(firstId ?? null);

  const toggle = (id: string) => {
    animateDisclosure();
    setOpenId((current) => (current === id ? null : id));
  };

  return (
    <View style={styles.list}>
      {projects.map((project) => {
        const open = project.id === openId;
        const countLabel = `${project.threads.length} ${
          project.threads.length === 1
            ? workspaceStrings.threadSingular
            : workspaceStrings.threadPlural
        }`;
        return (
          <View key={project.id} style={styles.card}>
            <Pressable onPress={() => toggle(project.id)} style={styles.header}>
              <IconTile
                label={project.name}
                size={36}
                backgroundColor={colors.accentMuted}
                color={colors.accent}
              />
              <View style={styles.headerBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {project.name}
                </Text>
                <Text style={styles.subtitle} numberOfLines={1}>
                  {project.subtitle}
                </Text>
              </View>
              <View style={styles.countPill}>
                <Text style={styles.countLabel}>{countLabel}</Text>
              </View>
              <Ionicons
                name={open ? "chevron-up" : "chevron-down"}
                size={16}
                color={colors.textMuted}
              />
            </Pressable>
            {open ? (
              <View style={styles.threads}>
                {project.threads.map((thread) => (
                  <View key={thread.id} style={styles.threadWrap}>
                    <ThreadRow
                      title={thread.title}
                      subtitle={`${thread.timeLabel} • ${statusLabel(thread.status)}`}
                      status={thread.status}
                      {...(thread.unreadCount > 0 ? { unreadCount: thread.unreadCount } : {})}
                      onPress={() => onPressThread(thread.id)}
                    />
                    {thread.isPinned ? (
                      <View style={styles.pin}>
                        <Ionicons name="pin" size={12} color={colors.accent} />
                      </View>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function statusLabel(status: ThreadStatusKind): string {
  switch (status) {
    case "needs-attention":
      return strings.status.needsAttention;
    case "running":
      return strings.status.running;
    case "active":
      return strings.status.active;
    default:
      return strings.status.idle;
  }
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    padding: spacing.md,
  },
  headerBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...type.cardTitle,
    color: colors.text,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
  },
  countPill: {
    backgroundColor: colors.elevatedStrong,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  countLabel: {
    ...type.chip,
    color: colors.textMuted,
  },
  threads: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  threadWrap: {
    position: "relative",
  },
  pin: {
    position: "absolute",
    top: spacing.sm,
    right: spacing.sm,
  },
});
