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
  SearchField,
  ThreadResultList,
  catalogViewState,
  searchCatalogThreads,
} from "../../src/components/threads";
import { strings } from "../../src/strings";
import { colors } from "../../src/theme/tokens";

export default function SearchScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const connection = useConnection();
  const shell = useShell();
  const [query, setQuery] = useState("");
  const viewState = catalogViewState(connection.status, shell.hydrated);
  const trimmedQuery = query.trim();
  const rows = useMemo(
    () =>
      searchCatalogThreads({
        threads: shell.threads,
        projects: shell.projects,
        spaces: shell.spaces,
        query,
        nowMs: Date.now(),
        labels: CATALOG_LABELS,
      }),
    [query, shell.projects, shell.spaces, shell.threads],
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={strings.screens.search} />
      <SearchField
        value={query}
        onChangeText={setQuery}
        placeholder={strings.search.placeholder}
        editable={viewState === "ready"}
      />
      {viewState === "loading" ? (
        <CatalogLoading label={strings.search.loading} />
      ) : viewState === "disconnected" ? (
        <CatalogEmpty
          title={strings.search.disconnectedTitle}
          body={strings.search.disconnectedBody}
        />
      ) : viewState === "incompatible" ? (
        <CatalogEmpty
          title={strings.search.incompatibleTitle}
          body={strings.search.incompatibleBody}
        />
      ) : trimmedQuery.length === 0 ? (
        <CatalogEmpty title={strings.search.promptTitle} body={strings.search.promptBody} />
      ) : rows.length === 0 ? (
        <CatalogEmpty title={strings.search.noResultsTitle} body={strings.search.noResultsBody} />
      ) : (
        <ThreadResultList
          rows={rows}
          onPressThread={(threadId) => router.push(`/thread/${threadId}`)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
