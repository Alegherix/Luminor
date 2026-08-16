import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";

export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  readonly visible: boolean;
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.backdrop} onPress={onCancel}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancel,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.cancelLabel}>{strings.settingsUi.cancel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.button,
                styles.confirm,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.confirmLabel}>{confirmLabel}</Text>
            </Pressable>
          </View>
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
  },
  title: {
    ...type.section,
    color: colors.text,
  },
  body: {
    ...type.body,
    color: colors.textMuted,
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    borderRadius: radii.row,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  cancel: {
    backgroundColor: colors.elevatedStrong,
  },
  confirm: {
    backgroundColor: colors.dangerMuted,
  },
  pressed: {
    opacity: 0.85,
  },
  cancelLabel: {
    ...type.cardTitle,
    color: colors.text,
  },
  confirmLabel: {
    ...type.cardTitle,
    color: colors.danger,
  },
});
