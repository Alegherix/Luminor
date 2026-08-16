import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { colors } from "../../theme/tokens";
import { EmptyState } from "./EmptyState";
import { ScreenHeader } from "./ScreenHeader";

export function PlaceholderScreen({
  title,
  emptyTitle,
  emptyBody,
  showBrand = false,
  showBack = false,
  showBell = false,
  onBack,
}: {
  readonly title: string;
  readonly emptyTitle: string;
  readonly emptyBody: string;
  readonly showBrand?: boolean;
  readonly showBack?: boolean;
  readonly showBell?: boolean;
  readonly onBack?: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader
        title={title}
        showBrand={showBrand}
        showBack={showBack}
        showBell={showBell}
        {...(onBack ? { onBack } : {})}
      />
      <EmptyState title={emptyTitle} body={emptyBody} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
