import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import type { ConnectionStatus } from "../../api/types";
import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { EmptyState } from "../shared/EmptyState";
import { sessionEmptyHint } from "./sessionEmptyCopy";

export function SessionsEmpty({ status }: { readonly status: ConnectionStatus }) {
  const hint = sessionEmptyHint(status);
  return (
    <View style={styles.wrap}>
      <View style={styles.icon}>
        <Ionicons name="terminal-outline" size={28} color={colors.teal} />
      </View>
      <EmptyState title={strings.sessionsUi.emptyTitle} body={strings.sessionsUi.emptyBody} />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    paddingBottom: spacing.xxl,
  },
  icon: {
    alignSelf: "center",
    width: 64,
    height: 64,
    borderRadius: radii.card,
    backgroundColor: colors.tealMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  hint: {
    ...type.meta,
    color: colors.textMuted,
    textAlign: "center",
    paddingHorizontal: spacing.xl,
  },
});
