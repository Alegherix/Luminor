import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection, useShell } from "../../src/api";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import {
  CATALOG_LABELS,
  CatalogEmpty,
  CatalogLoading,
  SegmentedFilter,
  ThreadGroupList,
  buildThreadGroups,
  catalogViewState,
  countThreadFilters,
  type ThreadFilter,
} from "../../src/components/threads";
import { strings } from "../../src/strings";
import { colors } from "../../src/theme/tokens";

export default function ThreadsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const connection = useConnection();
  const shell = useShell();
  const [filter, setFilter] = useState<ThreadFilter>("all");
  const viewState = catalogViewState(connection.status, shell.hydrated);
  const counts = useMemo(() => countThreadFilters(shell.threads), [shell.threads]);
  const groups = useMemo(
    () =>
      buildThreadGroups({
        threads: shell.threads,
        projects: shell.projects,
        spaces: shell.spaces,
        filter,
        nowMs: Date.now(),
        labels: CATALOG_LABELS,
      }),
    [filter, shell.projects, shell.spaces, shell.threads],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={strings.screens.threads} />
      <SegmentedFilter
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: strings.threads.filterAll },
          { value: "active", label: strings.threads.filterActive, count: counts.active },
          { value: "pinned", label: strings.threads.filterPinned, count: counts.pinned },
        ]}
      />
      {viewState === "loading" ? (
        <CatalogLoading label={strings.threads.loading} />
      ) : viewState === "disconnected" ? (
        <CatalogEmpty
          title={strings.threads.disconnectedTitle}
          body={strings.threads.disconnectedBody}
        />
      ) : viewState === "incompatible" ? (
        <CatalogEmpty
          title={strings.threads.incompatibleTitle}
          body={strings.threads.incompatibleBody}
        />
      ) : groups.length === 0 ? (
        <CatalogEmpty {...emptyCopyForFilter(filter)} />
      ) : (
        <ThreadGroupList
          groups={groups}
          onPressThread={(threadId) => router.push(`/thread/${threadId}`)}
        />
      )}
    </View>
  );
}

function emptyCopyForFilter(filter: ThreadFilter): { title: string; body: string } {
  if (filter === "active") {
    return { title: strings.threads.emptyActiveTitle, body: strings.threads.emptyActiveBody };
  }
  if (filter === "pinned") {
    return { title: strings.threads.emptyPinnedTitle, body: strings.threads.emptyPinnedBody };
  }
  return { title: strings.threads.emptyAllTitle, body: strings.threads.emptyAllBody };
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
