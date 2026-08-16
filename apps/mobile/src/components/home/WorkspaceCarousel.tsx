import { useMemo, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

import { colors, radii, spacing } from "../../theme/tokens";
import type { WorkspaceSummary } from "./shellSelectors";
import { WorkspaceCard } from "./WorkspaceCard";

export function WorkspaceCarousel({
  workspaces,
  showTerminals,
  onPressWorkspace,
}: {
  readonly workspaces: readonly WorkspaceSummary[];
  readonly showTerminals: boolean;
  readonly onPressWorkspace: (id: string) => void;
}) {
  const { width: windowWidth } = useWindowDimensions();
  const cardWidth = Math.round(windowWidth * 0.44);
  const cardHeight = Math.round(cardWidth * 1.15);
  const gap = spacing.md;
  const snapInterval = cardWidth + gap;
  const [page, setPage] = useState(0);

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const offset = event.nativeEvent.contentOffset.x;
    const next = Math.max(0, Math.min(workspaces.length - 1, Math.round(offset / snapInterval)));
    setPage(next);
  };

  const dots = useMemo(
    () => workspaces.map((workspace, index) => ({ id: workspace.id, active: index === page })),
    [page, workspaces],
  );

  return (
    <View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snapInterval}
        snapToAlignment="start"
        contentContainerStyle={[styles.scroller, { paddingHorizontal: spacing.lg }]}
        onMomentumScrollEnd={onScrollEnd}
      >
        {workspaces.map((workspace, index) => (
          <View key={workspace.id} style={{ width: cardWidth, marginRight: gap }}>
            <WorkspaceCard
              workspace={workspace}
              selected={index === page}
              showTerminals={showTerminals}
              width={cardWidth}
              height={cardHeight}
              toneIndex={index}
              onPress={() => onPressWorkspace(workspace.id)}
            />
          </View>
        ))}
      </ScrollView>
      {dots.length > 1 ? (
        <View style={styles.dots}>
          {dots.map((dot) => (
            <View key={dot.id} style={[styles.dot, dot.active ? styles.dotActive : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  scroller: {
    paddingBottom: spacing.sm,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
    backgroundColor: colors.elevatedStrong,
  },
  dotActive: {
    backgroundColor: colors.accent,
    width: 14,
  },
});
