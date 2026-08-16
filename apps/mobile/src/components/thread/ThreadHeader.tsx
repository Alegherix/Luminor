import { Ionicons } from "@expo/vector-icons";
import type { ProviderKind } from "@luminor/contracts";
import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import type { ThreadStatusKind } from "../../state/threadStatus";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { ConnectionPill } from "../shared/ConnectionPill";
import { IconTile } from "../shared/IconTile";
import { StatusChip } from "../shared/StatusChip";
import { providerGlyph } from "./modelLabel";
import { providerTileColors } from "./providerTile";

export function ThreadHeader({
  title,
  breadcrumb,
  provider,
  status,
  showInterrupt,
  interrupting,
  onBack,
  onInterrupt,
}: {
  readonly title: string;
  readonly breadcrumb: string | null;
  readonly provider: ProviderKind | null;
  readonly status: ThreadStatusKind;
  readonly showInterrupt: boolean;
  readonly interrupting: boolean;
  readonly onBack: () => void;
  readonly onInterrupt: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const tile = provider ? providerTileColors(provider) : null;
  return (
    <View style={styles.header}>
      <Pressable onPress={onBack} style={styles.back} accessibilityRole="button">
        <Text style={styles.backGlyph}>‹</Text>
      </Pressable>
      {provider && tile ? (
        <IconTile
          label={providerGlyph(provider)}
          backgroundColor={tile.backgroundColor}
          color={tile.color}
          size={32}
        />
      ) : null}
      <View style={styles.titles}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {breadcrumb ? (
          <Text style={styles.breadcrumb} numberOfLines={1}>
            {breadcrumb}
          </Text>
        ) : null}
      </View>
      <StatusChip status={status} />
      <Pressable
        onPress={() => setMenuOpen(true)}
        style={styles.overflow}
        accessibilityRole="button"
        accessibilityLabel={strings.thread.more}
      >
        <Ionicons name="ellipsis-horizontal" size={16} color={colors.text} />
      </Pressable>
      <ConnectionPill />
      <Modal
        visible={menuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setMenuOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{strings.thread.more}</Text>
            {showInterrupt ? (
              <Pressable
                onPress={() => {
                  setMenuOpen(false);
                  onInterrupt();
                }}
                style={styles.sheetAction}
                disabled={interrupting}
              >
                <Text style={styles.sheetDanger}>
                  {interrupting ? strings.thread.stopping : strings.thread.interrupt}
                </Text>
              </Pressable>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: radii.tile,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  backGlyph: {
    color: colors.text,
    fontSize: 24,
    marginTop: -2,
  },
  titles: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  title: {
    ...type.cardTitle,
    color: colors.text,
  },
  breadcrumb: {
    ...type.meta,
    color: colors.textMuted,
  },
  overflow: {
    width: 32,
    height: 32,
    borderRadius: radii.tile,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
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
  sheetAction: {
    borderRadius: radii.row,
    paddingVertical: spacing.md,
    alignItems: "center",
    backgroundColor: colors.dangerMuted,
  },
  sheetDanger: {
    ...type.cardTitle,
    color: colors.danger,
  },
});
