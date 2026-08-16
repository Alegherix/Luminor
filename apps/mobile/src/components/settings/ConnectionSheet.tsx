import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useConnection } from "../../api/hooks";
import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import {
  capabilitiesLabel,
  connectionStatusColor,
  connectionStatusLabel,
  pairingStatusLabel,
  protocolLabel,
} from "./connectionCopy";

export function ConnectionSheet({
  visible,
  onClose,
  onReconnect,
  onDisconnect,
  onForget,
}: {
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onReconnect: () => void;
  readonly onDisconnect: () => void;
  readonly onForget: () => void;
}) {
  const connection = useConnection();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => undefined}>
          <View style={styles.handle} />
          <Text style={styles.title}>{strings.connection.sheetTitle}</Text>
          <View style={styles.statusRow}>
            <View
              style={[styles.dot, { backgroundColor: connectionStatusColor(connection.status) }]}
            />
            <Text style={styles.status}>{connectionStatusLabel(connection.status)}</Text>
          </View>
          <Info label={strings.connection.server} value={connection.serverUrl || "—"} />
          <Info
            label={strings.settingsUi.pairingStatus}
            value={pairingStatusLabel(connection.paired)}
          />
          <Info
            label={strings.connection.instance}
            value={connection.serverInfo?.serverInstanceId ?? "—"}
          />
          <Info
            label={strings.connection.build}
            value={connection.serverInfo?.serverBuild ?? "—"}
          />
          <Info label={strings.connection.protocol} value={protocolLabel(connection.serverInfo)} />
          <Info
            label={strings.settingsUi.capabilities}
            value={capabilitiesLabel(connection.serverInfo?.capabilities)}
          />
          {connection.compatibility ? (
            <Info label={strings.settings.compatibility} value={connection.compatibility.action} />
          ) : null}
          {connection.lastError ? (
            <Info label={strings.connection.lastError} value={connection.lastError} />
          ) : null}
          <View style={styles.actions}>
            <SheetButton
              label={strings.connection.reconnect}
              onPress={() => {
                onReconnect();
                onClose();
              }}
            />
            <SheetButton
              label={strings.connection.disconnect}
              onPress={() => {
                onDisconnect();
                onClose();
              }}
            />
            <SheetButton
              label={strings.connection.forgetPairing}
              tone="danger"
              onPress={() => {
                onClose();
                onForget();
              }}
            />
            <SheetButton label={strings.common.close} onPress={onClose} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Info({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.info}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function SheetButton({
  label,
  onPress,
  tone = "default",
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly tone?: "default" | "danger";
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "danger" ? styles.buttonDanger : styles.buttonDefault,
        pressed ? styles.pressed : null,
      ]}
    >
      <Text style={[styles.buttonLabel, tone === "danger" ? styles.buttonDangerLabel : null]}>
        {label}
      </Text>
    </Pressable>
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
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.border,
    marginBottom: spacing.xs,
  },
  title: {
    ...type.section,
    color: colors.text,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  status: {
    ...type.cardTitle,
    color: colors.text,
  },
  info: {
    gap: 2,
  },
  infoLabel: {
    ...type.meta,
    color: colors.textMuted,
  },
  infoValue: {
    ...type.body,
    color: colors.text,
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
  buttonDefault: {
    backgroundColor: colors.elevatedStrong,
  },
  buttonDanger: {
    backgroundColor: colors.dangerMuted,
  },
  pressed: {
    opacity: 0.85,
  },
  buttonLabel: {
    ...type.cardTitle,
    color: colors.text,
  },
  buttonDangerLabel: {
    color: colors.danger,
  },
});
