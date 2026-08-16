import { StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection } from "../../src/api";
import { SessionsEmpty } from "../../src/components/sessions/SessionsEmpty";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import { strings } from "../../src/strings";
import { colors } from "../../src/theme/tokens";

export default function SessionsScreen() {
  const insets = useSafeAreaInsets();
  const connection = useConnection();
  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={strings.screens.sessions} />
      <SessionsEmpty status={connection.status} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
