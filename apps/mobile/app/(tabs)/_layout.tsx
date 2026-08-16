import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StyleSheet, Text, View } from "react-native";

import { useShell } from "../../src/api/hooks";
import { strings } from "../../src/strings";
import { colors, radii, type } from "../../src/theme/tokens";

type TabIconName = "home" | "list" | "search" | "terminal" | "settings";

function TabIcon({
  name,
  focused,
  badge,
}: {
  readonly name: TabIconName;
  readonly focused: boolean;
  readonly badge?: boolean;
}) {
  const iconName =
    name === "home"
      ? focused
        ? "home"
        : "home-outline"
      : name === "list"
        ? focused
          ? "list"
          : "list-outline"
        : name === "search"
          ? focused
            ? "search"
            : "search-outline"
          : name === "terminal"
            ? focused
              ? "terminal"
              : "terminal-outline"
            : focused
              ? "settings"
              : "settings-outline";
  return (
    <View style={styles.iconWrap}>
      {focused ? <View style={styles.activeBar} /> : <View style={styles.activeBarSpacer} />}
      <Ionicons name={iconName} size={20} color={focused ? colors.accent : colors.tabInactive} />
      {badge ? <View style={styles.badge} /> : null}
    </View>
  );
}

export default function TabsLayout() {
  const shell = useShell();
  const threadsNeedAttention = shell.threads.some((thread) => thread.needsAttention);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.bar,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: styles.label,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: strings.tabs.home,
          tabBarIcon: ({ focused }) => <TabIcon name="home" focused={focused} />,
          tabBarLabel: ({ focused, children }) => (
            <Text style={[styles.label, focused ? styles.labelActive : null]}>{children}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="threads"
        options={{
          title: strings.tabs.threads,
          tabBarIcon: ({ focused }) => (
            <TabIcon name="list" focused={focused} badge={threadsNeedAttention} />
          ),
          tabBarLabel: ({ focused, children }) => (
            <Text style={[styles.label, focused ? styles.labelActive : null]}>{children}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: strings.tabs.search,
          tabBarIcon: ({ focused }) => <TabIcon name="search" focused={focused} />,
          tabBarLabel: ({ focused, children }) => (
            <Text style={[styles.label, focused ? styles.labelActive : null]}>{children}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="sessions"
        options={{
          title: strings.tabs.sessions,
          tabBarIcon: ({ focused }) => <TabIcon name="terminal" focused={focused} />,
          tabBarLabel: ({ focused, children }) => (
            <Text style={[styles.label, focused ? styles.labelActive : null]}>{children}</Text>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: strings.tabs.settings,
          tabBarIcon: ({ focused }) => <TabIcon name="settings" focused={focused} />,
          tabBarLabel: ({ focused, children }) => (
            <Text style={[styles.label, focused ? styles.labelActive : null]}>{children}</Text>
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    borderTopLeftRadius: radii.tabBar,
    borderTopRightRadius: radii.tabBar,
    height: 72,
    paddingTop: 6,
  },
  label: {
    ...type.tab,
    color: colors.tabInactive,
  },
  labelActive: {
    color: colors.accent,
  },
  iconWrap: {
    alignItems: "center",
    justifyContent: "flex-start",
    width: 28,
    height: 28,
  },
  activeBar: {
    width: 18,
    height: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.accent,
    marginBottom: 3,
  },
  activeBarSpacer: {
    width: 18,
    height: 3,
    marginBottom: 3,
  },
  badge: {
    position: "absolute",
    top: 4,
    right: -2,
    width: 7,
    height: 7,
    borderRadius: 99,
    backgroundColor: colors.accent,
  },
});
