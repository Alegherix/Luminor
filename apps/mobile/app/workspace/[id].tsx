import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection, useShell } from "../../src/api";
import { ChevronLinkRow } from "../../src/components/home/ChevronLinkRow";
import { HomeThreadList } from "../../src/components/home/HomeThreadList";
import { SectionStatus } from "../../src/components/home/SectionStatus";
import { sectionPhase } from "../../src/components/home/sectionPhase";
import {
  WORKSPACE_CHAT_PREVIEW,
  buildWorkspaceDetail,
  projectFromShell,
  spaceFromShell,
  threadFromShell,
} from "../../src/components/home/shellSelectors";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import { SectionHeader } from "../../src/components/shared/SectionHeader";
import { PinnedGrid } from "../../src/components/workspace/PinnedGrid";
import { ProjectAccordion } from "../../src/components/workspace/ProjectAccordion";
import { WorkspaceStatsCard } from "../../src/components/workspace/WorkspaceStatsCard";
import { strings, workspaceStrings } from "../../src/strings";
import { colors, spacing } from "../../src/theme/tokens";

export default function WorkspaceScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const rawId = params.id;
  const workspaceId = Array.isArray(rawId) ? rawId[0] : rawId;
  const connection = useConnection();
  const shell = useShell();

  const detail = useMemo(() => {
    if (!workspaceId) return null;
    return buildWorkspaceDetail(
      workspaceId,
      shell.spaces.map(spaceFromShell),
      shell.projects.map(projectFromShell),
      shell.threads.map(threadFromShell),
    );
  }, [shell, workspaceId]);

  const missing = shell.hydrated && detail === null;
  const pinnedPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    (detail?.pinned.length ?? 0) === 0,
  );
  const projectsPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    (detail?.projects.length ?? 0) === 0,
  );
  const chatsPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    (detail?.chats.length ?? 0) === 0,
  );
  const statsPhase = sectionPhase(connection.status, shell.hydrated, detail === null);

  const openThread = (id: string) => {
    router.push(`/thread/${id}`);
  };

  const visibleChats = (detail?.chats ?? []).slice(0, WORKSPACE_CHAT_PREVIEW);

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={detail?.name ?? strings.screens.workspace}
        showBack
        onBack={() => router.back()}
      />
      <ScrollView contentContainerStyle={styles.content}>
        {missing ? (
          <SectionStatus
            phase="empty"
            loadingLabel={workspaceStrings.loading}
            emptyTitle={workspaceStrings.notFoundTitle}
            emptyBody={workspaceStrings.notFoundBody}
            disconnectedTitle={workspaceStrings.disconnectedTitle}
            disconnectedBody={workspaceStrings.disconnectedBody}
          >
            {null}
          </SectionStatus>
        ) : (
          <>
            <SectionStatus
              phase={statsPhase}
              loadingLabel={workspaceStrings.loading}
              emptyTitle={workspaceStrings.notFoundTitle}
              emptyBody={workspaceStrings.notFoundBody}
              disconnectedTitle={workspaceStrings.disconnectedTitle}
              disconnectedBody={workspaceStrings.disconnectedBody}
            >
              {detail ? (
                <WorkspaceStatsCard
                  projectCount={detail.projectCount}
                  threadCount={detail.threadCount}
                  runningTerminalCount={detail.runningTerminalCount}
                  showTerminals={detail.hasSessionData}
                />
              ) : null}
            </SectionStatus>

            <SectionHeader title={workspaceStrings.pinned} />
            <SectionStatus
              phase={pinnedPhase}
              loadingLabel={workspaceStrings.loading}
              emptyTitle={workspaceStrings.emptyPinnedTitle}
              emptyBody={workspaceStrings.emptyPinnedBody}
              disconnectedTitle={workspaceStrings.disconnectedTitle}
              disconnectedBody={workspaceStrings.disconnectedBody}
            >
              <PinnedGrid items={detail?.pinned ?? []} onPress={openThread} />
            </SectionStatus>

            <SectionHeader title={workspaceStrings.projects} />
            <SectionStatus
              phase={projectsPhase}
              loadingLabel={workspaceStrings.loading}
              emptyTitle={workspaceStrings.emptyProjectsTitle}
              emptyBody={workspaceStrings.emptyProjectsBody}
              disconnectedTitle={workspaceStrings.disconnectedTitle}
              disconnectedBody={workspaceStrings.disconnectedBody}
            >
              <ProjectAccordion projects={detail?.projects ?? []} onPressThread={openThread} />
            </SectionStatus>

            <SectionHeader title={workspaceStrings.chats} />
            <SectionStatus
              phase={chatsPhase}
              loadingLabel={workspaceStrings.loading}
              emptyTitle={workspaceStrings.emptyChatsTitle}
              emptyBody={workspaceStrings.emptyChatsBody}
              disconnectedTitle={workspaceStrings.disconnectedTitle}
              disconnectedBody={workspaceStrings.disconnectedBody}
            >
              <HomeThreadList threads={visibleChats} onPressThread={openThread} showUnread />
              {(detail?.chats.length ?? 0) > 0 ? (
                <View style={styles.chatsLink}>
                  <ChevronLinkRow
                    label={workspaceStrings.viewAllChats}
                    onPress={() => router.push("/threads")}
                  />
                </View>
              ) : null}
            </SectionStatus>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  chatsLink: {
    marginTop: spacing.sm,
  },
});
