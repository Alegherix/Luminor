import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection, useShell } from "../../src/api";
import { ChevronLinkRow } from "../../src/components/home/ChevronLinkRow";
import { HomeThreadList } from "../../src/components/home/HomeThreadList";
import { SectionStatus } from "../../src/components/home/SectionStatus";
import { SegmentedControl, type HomeSegment } from "../../src/components/home/SegmentedControl";
import { SessionRow } from "../../src/components/home/SessionRow";
import { ShowMoreButton } from "../../src/components/home/ShowMoreButton";
import { WorkspaceCarousel } from "../../src/components/home/WorkspaceCarousel";
import { sectionPhase } from "../../src/components/home/sectionPhase";
import {
  RECENT_THREAD_PREVIEW,
  buildHomeModel,
  projectFromShell,
  spaceFromShell,
  threadFromShell,
} from "../../src/components/home/shellSelectors";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import { SectionHeader } from "../../src/components/shared/SectionHeader";
import { homeStrings, strings } from "../../src/strings";
import { colors, spacing } from "../../src/theme/tokens";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const connection = useConnection();
  const shell = useShell();
  const [segment, setSegment] = useState<HomeSegment>("spaces");
  const [recentExpanded, setRecentExpanded] = useState(false);

  const model = useMemo(
    () =>
      buildHomeModel(
        shell.spaces.map(spaceFromShell),
        shell.projects.map(projectFromShell),
        shell.threads.map(threadFromShell),
      ),
    [shell],
  );

  const workspacesPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    model.workspaces.length === 0,
  );
  const recentPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    model.recentThreads.length === 0,
  );
  const activityPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    model.activityThreads.length === 0,
  );
  const pinnedPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    model.pinnedThreads.length === 0,
  );
  const sessionsPhase = sectionPhase(
    connection.status,
    shell.hydrated,
    model.sessions.length === 0,
  );

  const visibleRecent = recentExpanded
    ? model.recentThreads
    : model.recentThreads.slice(0, RECENT_THREAD_PREVIEW);

  const openThread = (id: string) => {
    router.push(`/thread/${id}`);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader showBrand showBell hasNotifications={model.hasNotifications} />
      <ScrollView contentContainerStyle={styles.content}>
        <SegmentedControl
          value={segment}
          onChange={setSegment}
          spacesLabel={homeStrings.segmentSpaces}
          activityLabel={homeStrings.segmentActivity}
          pinnedLabel={homeStrings.segmentPinned}
          pinnedCount={model.pinnedCount}
        />

        {segment === "spaces" ? (
          <>
            <SectionHeader title={homeStrings.workspaces} />
            <SectionStatus
              phase={workspacesPhase}
              loadingLabel={homeStrings.loading}
              emptyTitle={homeStrings.emptyWorkspacesTitle}
              emptyBody={homeStrings.emptyWorkspacesBody}
              disconnectedTitle={homeStrings.disconnectedTitle}
              disconnectedBody={homeStrings.disconnectedBody}
            >
              <WorkspaceCarousel
                workspaces={model.workspaces}
                showTerminals={model.hasSessionData}
                onPressWorkspace={(id) => router.push(`/workspace/${id}`)}
              />
            </SectionStatus>

            <SectionHeader
              title={homeStrings.recentThreads}
              trailingLabel={`${strings.common.viewAll} ›`}
              onPressTrailing={() => router.push("/threads")}
            />
            <SectionStatus
              phase={recentPhase}
              loadingLabel={homeStrings.loading}
              emptyTitle={homeStrings.emptyRecentTitle}
              emptyBody={homeStrings.emptyRecentBody}
              disconnectedTitle={homeStrings.disconnectedTitle}
              disconnectedBody={homeStrings.disconnectedBody}
            >
              <HomeThreadList threads={visibleRecent} onPressThread={openThread} />
              {model.recentThreads.length > RECENT_THREAD_PREVIEW && !recentExpanded ? (
                <ShowMoreButton onPress={() => setRecentExpanded(true)} />
              ) : null}
            </SectionStatus>

            {model.hasSessionData ? (
              <>
                <SectionHeader
                  title={homeStrings.runningTerminals}
                  trailingLabel={`${strings.common.viewAll} ›`}
                  onPressTrailing={() => router.push("/sessions")}
                />
                <SectionStatus
                  phase={sessionsPhase}
                  loadingLabel={homeStrings.loading}
                  emptyTitle={homeStrings.emptyRecentTitle}
                  emptyBody={homeStrings.emptyRecentBody}
                  disconnectedTitle={homeStrings.disconnectedTitle}
                  disconnectedBody={homeStrings.disconnectedBody}
                >
                  <View style={styles.sessionList}>
                    {model.sessions.map((session) => (
                      <SessionRow
                        key={session.threadId}
                        session={session}
                        onPress={() => openThread(session.threadId)}
                      />
                    ))}
                  </View>
                </SectionStatus>
                <ChevronLinkRow
                  label={homeStrings.openSessions}
                  onPress={() => router.push("/sessions")}
                />
              </>
            ) : null}
          </>
        ) : null}

        {segment === "activity" ? (
          <SectionStatus
            phase={activityPhase}
            loadingLabel={homeStrings.loading}
            emptyTitle={homeStrings.emptyActivityTitle}
            emptyBody={homeStrings.emptyActivityBody}
            disconnectedTitle={homeStrings.disconnectedTitle}
            disconnectedBody={homeStrings.disconnectedBody}
          >
            <HomeThreadList threads={model.activityThreads} onPressThread={openThread} />
          </SectionStatus>
        ) : null}

        {segment === "pinned" ? (
          <SectionStatus
            phase={pinnedPhase}
            loadingLabel={homeStrings.loading}
            emptyTitle={homeStrings.emptyPinnedTitle}
            emptyBody={homeStrings.emptyPinnedBody}
            disconnectedTitle={homeStrings.disconnectedTitle}
            disconnectedBody={homeStrings.disconnectedBody}
          >
            <HomeThreadList threads={model.pinnedThreads} onPressThread={openThread} />
          </SectionStatus>
        ) : null}
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
    gap: spacing.sm,
  },
  sessionList: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
});
