import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useConnection } from "../../api/hooks";
import { getRuntime } from "../../api/runtime";
import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";

function statusLabel(status: ReturnType<typeof useConnection>["status"]): string {
  switch (status) {
    case "open":
      return strings.connection.connected;
    case "connecting":
      return strings.connection.connecting;
    case "incompatible":
      return strings.connection.incompatible;
    default:
      return strings.connection.disconnected;
  }
}

function dotColor(status: ReturnType<typeof useConnection>["status"]): string {
  switch (status) {
    case "open":
      return colors.success;
    case "connecting":
      return colors.warning;
    case "incompatible":
      return colors.accent;
    default:
      return colors.danger;
  }
}

export function ConnectionPill() {
  const connection = useConnection();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.pill}>
        <View style={[styles.dot, { backgroundColor: dotColor(connection.status) }]} />
        <Text style={styles.label}>{statusLabel(connection.status)}</Text>
        <Text style={styles.chevron}>▾</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{strings.connection.sheetTitle}</Text>
            <InfoRow label={strings.connection.server} value={connection.serverUrl || "—"} />
            <InfoRow
              label={strings.connection.instance}
              value={connection.serverInfo?.serverInstanceId ?? "—"}
            />
            <InfoRow
              label={strings.connection.build}
              value={connection.serverInfo?.serverBuild ?? "—"}
            />
            <InfoRow
              label={strings.connection.protocol}
              value={
                connection.serverInfo
                  ? `${connection.serverInfo.protocolEpoch}.${connection.serverInfo.negotiatedRevision}`
                  : "—"
              }
            />
            {connection.lastError ? (
              <InfoRow label={strings.connection.lastError} value={connection.lastError} />
            ) : null}
            <View style={styles.actions}>
              <SheetButton
                label={strings.connection.reconnect}
                onPress={() => {
                  connection.reconnect();
                  setOpen(false);
                }}
              />
              <SheetButton label={strings.connection.disconnect} onPress={connection.disconnect} />
              <SheetButton
                label={strings.connection.forgetPairing}
                tone="danger"
                onPress={() => {
                  void getRuntime().forgetPairing();
                  setOpen(false);
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function InfoRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <View style={styles.infoRow}>
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
      style={[styles.button, tone === "danger" ? styles.buttonDanger : styles.buttonDefault]}
    >
      <Text style={[styles.buttonLabel, tone === "danger" ? styles.buttonDangerLabel : null]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  label: {
    ...type.chip,
    color: colors.text,
  },
  chevron: {
    ...type.chip,
    color: colors.textMuted,
  },
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
  sheetTitle: {
    ...type.section,
    color: colors.text,
  },
  infoRow: {
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
  buttonLabel: {
    ...type.cardTitle,
    color: colors.text,
  },
  buttonDangerLabel: {
    color: colors.danger,
  },
});
