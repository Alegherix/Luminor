import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppRuntimeProvider } from "../src/providers/AppRuntimeProvider";
import { colors } from "../src/theme/tokens";

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AppRuntimeProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: "slide_from_right",
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workspace/[id]" />
          <Stack.Screen name="thread/[id]" />
        </Stack>
      </AppRuntimeProvider>
    </SafeAreaProvider>
  );
}
