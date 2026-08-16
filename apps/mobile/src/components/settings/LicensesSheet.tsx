import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { OPEN_SOURCE_LICENSES } from "./licenses";

export function LicensesSheet({
  visible,
  onClose,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{strings.settingsUi.licensesTitle}</Text>
          <Text style={styles.subtitle}>{strings.settingsUi.licensesSubtitle}</Text>
          <ScrollView style={styles.list}>
            {OPEN_SOURCE_LICENSES.map((entry) => (
              <View key={entry.name} style={styles.row}>
                <Text style={styles.name}>{entry.name}</Text>
                <Text style={styles.license}>{entry.license}</Text>
              </View>
            ))}
          </ScrollView>
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [styles.close, pressed ? styles.pressed : null]}
          >
            <Text style={styles.closeLabel}>{strings.common.close}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: radii.tabBar,
    borderTopRightRadius: radii.tabBar,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: "72%",
  },
  title: {
    ...type.section,
    color: colors.text,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
  },
  list: {
    flexGrow: 0,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  name: {
    ...type.body,
    color: colors.text,
  },
  license: {
    ...type.meta,
    color: colors.textMuted,
  },
  close: {
    borderRadius: radii.row,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.elevatedStrong,
  },
  pressed: {
    opacity: 0.85,
  },
  closeLabel: {
    ...type.cardTitle,
    color: colors.text,
  },
});
