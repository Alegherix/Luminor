import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { colors, spacing } from "../../theme/tokens";
import { EmptyState } from "../shared/EmptyState";
import type { SectionPhase } from "./sectionPhase";

export function SectionStatus({
  phase,
  loadingLabel,
  emptyTitle,
  emptyBody,
  disconnectedTitle,
  disconnectedBody,
  children,
}: {
  readonly phase: SectionPhase;
  readonly loadingLabel: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly disconnectedTitle: string;
  readonly disconnectedBody: string;
  readonly children: ReactNode;
}) {
  if (phase === "disconnected") {
    return <EmptyState title={disconnectedTitle} body={disconnectedBody} />;
  }
  if (phase === "loading") {
    return (
      <View style={styles.loading} accessibilityLabel={loadingLabel}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  if (phase === "empty") {
    return <EmptyState title={emptyTitle} body={emptyBody} />;
  }
  return <>{children}</>;
}

const styles = StyleSheet.create({
  loading: {
    paddingVertical: spacing.xxl,
    alignItems: "center",
  },
});
