import { StyleSheet, Text, View } from "react-native";

import { colors, type } from "../../theme/tokens";
import { formatSigned } from "./fileEditStats";

export function DiffStat({
  additions,
  deletions,
}: {
  readonly additions: number;
  readonly deletions: number;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.add}>{formatSigned(additions, "+")}</Text>
      <Text style={styles.del}>{formatSigned(deletions, "−")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 6,
  },
  add: {
    ...type.meta,
    color: colors.success,
  },
  del: {
    ...type.meta,
    color: colors.danger,
  },
});
