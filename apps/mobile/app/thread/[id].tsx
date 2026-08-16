import type { OrchestrationPendingInteraction, ThreadId } from "@luminor/contracts";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, getRuntime, useConnection, useShell, useThread } from "../../src/api";
import { ApprovalCard } from "../../src/components/thread/ApprovalCard";
import { openApprovals } from "../../src/components/thread/approvalDescription";
import { threadBreadcrumb } from "../../src/components/thread/breadcrumb";
import { ChatMessage } from "../../src/components/thread/ChatMessage";
import { Composer } from "../../src/components/thread/Composer";
import { FileEditCard } from "../../src/components/thread/FileEditCard";
import { SessionCard } from "../../src/components/thread/SessionCard";
import { TaskProgressCard } from "../../src/components/thread/TaskProgressCard";
import { deriveTaskProgress } from "../../src/components/thread/taskProgress";
import { ThreadHeader } from "../../src/components/thread/ThreadHeader";
import {
  buildThreadFeed,
  latestStreamingMessageId,
  type ThreadFeedItem,
} from "../../src/components/thread/threadFeed";
import { TimelineEvent } from "../../src/components/thread/TimelineEvent";
import { useNow } from "../../src/components/thread/useNow";
import { isTurnRunning, workingStartedAt } from "../../src/components/thread/turnState";
import { WorkingBanner } from "../../src/components/thread/WorkingBanner";
import { EmptyState } from "../../src/components/shared/EmptyState";
import { strings } from "../../src/strings";
import { colors } from "../../src/theme/tokens";

const NEAR_BOTTOM_PX = 80;

function routeThreadId(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function ThreadScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string }>();
  const threadId = routeThreadId(params.id);
  const insets = useSafeAreaInsets();
  const nowMs = useNow();
  const connection = useConnection();
  const shell = useShell();
  const threadState = useThread(threadId);
  const listRef = useRef<FlatList<ThreadFeedItem>>(null);
  const nearBottom = useRef(true);
  const didInitialScroll = useRef(false);
  const [interrupting, setInterrupting] = useState(false);
  const [approvalBusy, setApprovalBusy] = useState(false);

  useEffect(() => {
    if (threadId) getRuntime().markThreadVisited(threadId);
  }, [threadId]);

  const shellThread = shell.threads.find((item) => item.id === threadId);
  const title = threadState.thread?.title ?? shellThread?.title ?? strings.screens.thread;
  const provider =
    threadState.thread?.modelSelection.provider ?? shellThread?.modelSelection.provider ?? null;
  const breadcrumb = threadState.thread
    ? threadBreadcrumb(threadState.thread, shell.projects, shell.spaces)
    : shellThread
      ? threadBreadcrumb(shellThread, shell.projects, shell.spaces)
      : null;
  const running = isTurnRunning(threadState.latestTurn, threadState.session);
  const startedAt = workingStartedAt(threadState.latestTurn, threadState.session);
  const taskProgress = useMemo(
    () =>
      deriveTaskProgress(
        threadState.activities,
        threadState.proposedPlans,
        threadState.latestTurn?.turnId,
      ),
    [threadState.activities, threadState.proposedPlans, threadState.latestTurn?.turnId],
  );
  const feed = useMemo(
    () =>
      buildThreadFeed({
        messages: threadState.messages,
        activities: threadState.activities,
        fileEdits: threadState.fileEdits,
        taskProgress,
        session: threadState.session,
      }),
    [
      threadState.messages,
      threadState.activities,
      threadState.fileEdits,
      taskProgress,
      threadState.session,
    ],
  );
  const approvals = useMemo(
    () => openApprovals(threadState.pendingInteractions),
    [threadState.pendingInteractions],
  );
  const streamingId = latestStreamingMessageId(threadState.messages);

  const interrupt = async () => {
    if (!threadId) return;
    setInterrupting(true);
    try {
      const turnId = threadState.latestTurn?.turnId;
      await api.interrupt(threadId as ThreadId, ...(turnId ? [turnId] : []));
    } finally {
      setInterrupting(false);
    }
  };

  const respondToApproval = async (
    interaction: OrchestrationPendingInteraction,
    decision: "accept" | "decline",
  ) => {
    setApprovalBusy(true);
    try {
      await api.respondToApproval({
        threadId: threadId as ThreadId,
        requestId: interaction.requestId,
        decision,
        ...(interaction.lifecycleGeneration
          ? { lifecycleGeneration: interaction.lifecycleGeneration }
          : {}),
      });
    } finally {
      setApprovalBusy(false);
    }
  };

  const onScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    nearBottom.current =
      contentOffset.y + layoutMeasurement.height >= contentSize.height - NEAR_BOTTOM_PX;
  };

  const maybeFollowOutput = () => {
    if (streamingId && nearBottom.current) {
      listRef.current?.scrollToEnd({ animated: false });
    }
  };

  useEffect(() => {
    if (didInitialScroll.current || threadState.loading || feed.length === 0) return;
    didInitialScroll.current = true;
    requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
  }, [threadState.loading, feed.length]);

  const renderItem = ({ item }: { item: ThreadFeedItem }) => {
    switch (item.type) {
      case "message":
        return <ChatMessage message={item.message} />;
      case "activity":
        return (
          <TimelineEvent
            activity={item.activity}
            connectAbove={item.connectAbove}
            connectBelow={item.connectBelow}
            nowMs={nowMs}
          />
        );
      case "fileEdit":
        return <FileEditCard edit={item.edit} nowMs={nowMs} />;
      case "taskProgress":
        return <TaskProgressCard progress={item.progress} />;
      case "session":
        return (
          <SessionCard session={item.session} latestTurn={threadState.latestTurn} nowMs={nowMs} />
        );
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ThreadHeader
        title={title}
        breadcrumb={breadcrumb}
        provider={provider}
        status={threadState.status}
        showInterrupt={running}
        interrupting={interrupting}
        onBack={() => router.back()}
        onInterrupt={() => void interrupt()}
      />
      {startedAt ? <WorkingBanner startedAt={startedAt} nowMs={nowMs} /> : null}
      {threadState.loading && feed.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : feed.length === 0 ? (
        <EmptyState
          title={threadState.error ?? strings.thread.emptyTitle}
          body={threadState.error ? strings.thread.missing : strings.thread.emptyBody}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={feed}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onContentSizeChange={maybeFollowOutput}
          keyboardShouldPersistTaps="handled"
          extraData={`${nowMs}:${streamingId ?? ""}`}
          contentContainerStyle={styles.feed}
        />
      )}
      {approvals.map((interaction) => (
        <ApprovalCard
          key={`${interaction.requestId}:${interaction.lifecycleGeneration ?? ""}`}
          interaction={interaction}
          activities={threadState.activities}
          busy={approvalBusy}
          onRespond={(decision) => respondToApproval(interaction, decision)}
        />
      ))}
      {threadState.thread ? (
        <Composer
          threadId={threadState.thread.id}
          modelSelection={threadState.thread.modelSelection}
          runtimeMode={threadState.thread.runtimeMode}
          interactionMode={threadState.thread.interactionMode}
          running={running}
          connected={connection.status === "open"}
          interrupting={interrupting}
          onInterrupt={() => void interrupt()}
        />
      ) : null}
      <View style={{ height: Math.max(insets.bottom, 12) }} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  feed: {
    paddingTop: 4,
    paddingBottom: 16,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
