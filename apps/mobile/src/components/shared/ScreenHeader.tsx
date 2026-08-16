import { Pressable, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { Badge } from "./Badge";
import { ConnectionPill } from "./ConnectionPill";

export type ScreenHeaderProps = {
  readonly title?: string;
  readonly subtitle?: string;
  readonly showBrand?: boolean;
  readonly showBack?: boolean;
  readonly showBell?: boolean;
  readonly hasNotifications?: boolean;
  readonly onBack?: () => void;
};

export function ScreenHeader({
  title,
  subtitle,
  showBrand = false,
  showBack = false,
  showBell = false,
  hasNotifications = false,
  onBack,
}: ScreenHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.left}>
        {showBack ? (
          <Pressable onPress={onBack} style={styles.back}>
            <Text style={styles.backGlyph}>‹</Text>
          </Pressable>
        ) : null}
        {showBrand ? (
          <View style={styles.brand}>
            <View style={styles.mark}>
              <Text style={styles.markGlyph}>L</Text>
            </View>
            <Text style={styles.wordmark}>{strings.appName}</Text>
          </View>
        ) : (
          <View style={styles.titles}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
            {subtitle ? (
              <Text style={styles.subtitle} numberOfLines={1}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        )}
      </View>
      <View style={styles.right}>
        {showBell ? (
          <View style={styles.bellWrap}>
            <View style={styles.bell}>
              <Text style={styles.bellGlyph}>⌁</Text>
            </View>
            {hasNotifications ? (
              <View style={styles.bellBadge}>
                <Badge dot />
              </View>
            ) : null}
          </View>
        ) : null}
        <ConnectionPill />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  left: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
  },
  right: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  mark: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: colors.accentMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  markGlyph: {
    color: colors.accent,
    fontWeight: "800",
  },
  wordmark: {
    ...type.screenTitle,
    color: colors.text,
  },
  titles: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    ...type.screenTitle,
    color: colors.text,
  },
  subtitle: {
    ...type.meta,
    color: colors.textMuted,
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
  bellWrap: {
    position: "relative",
  },
  bell: {
    width: 36,
    height: 36,
    borderRadius: radii.tile,
    backgroundColor: colors.elevated,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  bellGlyph: {
    color: colors.text,
    fontSize: 16,
  },
  bellBadge: {
    position: "absolute",
    top: 4,
    right: 4,
  },
});
