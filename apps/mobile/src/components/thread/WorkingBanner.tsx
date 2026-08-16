import { useEffect, useRef } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";

import { strings } from "../../strings";
import { colors, spacing, type } from "../../theme/tokens";
import { formatMinutesShort, formatTimeAgo } from "./timeAgo";

export function WorkingBanner({
  startedAt,
  nowMs,
}: {
  readonly startedAt: string;
  readonly nowMs: number;
}) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return (
    <View style={styles.banner}>
      <View style={styles.left}>
        <Animated.View style={[styles.dot, { opacity: pulse }]} />
        <Text style={styles.working}>
          {strings.thread.workingFor} {formatMinutesShort(startedAt, nowMs)}
        </Text>
      </View>
      <Text style={styles.started}>
        {strings.thread.started} {formatTimeAgo(startedAt, nowMs)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minWidth: 0,
    flex: 1,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.success,
  },
  working: {
    ...type.meta,
    color: colors.text,
  },
  started: {
    ...type.meta,
    color: colors.textMuted,
  },
});
