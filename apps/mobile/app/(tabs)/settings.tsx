import { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useConnection } from "../../src/api/hooks";
import { getRuntime } from "../../src/api/runtime";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import { SectionHeader } from "../../src/components/shared/SectionHeader";
import { strings } from "../../src/strings";
import { colors, radii, spacing, type } from "../../src/theme/tokens";
import { APP_VERSION } from "../../src/version";

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const connection = useConnection();
  const [serverUrl, setServerUrl] = useState(connection.serverUrl);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState<"url" | "pair" | "health" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (kind: "url" | "pair" | "health", work: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    setMessage(null);
    try {
      await work();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScreenHeader title={strings.settings.title} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <SectionHeader title={strings.settings.serverSection} />
        <Text style={styles.label}>{strings.settings.serverUrl}</Text>
        <TextInput
          value={serverUrl}
          onChangeText={setServerUrl}
          placeholder={strings.settings.serverUrlPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
        />
        <ActionButton
          label={strings.settings.saveUrl}
          loading={busy === "url"}
          onPress={() =>
            run("url", async () => {
              await getRuntime().setServerUrl(serverUrl);
              setMessage(strings.settings.urlSaved);
            })
          }
        />

        <SectionHeader title={strings.settings.pairingSection} />
        <Text style={styles.label}>{strings.settings.pairingCredential}</Text>
        <TextInput
          value={credential}
          onChangeText={setCredential}
          placeholder={strings.settings.pairingPlaceholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          style={styles.input}
        />
        <ActionButton
          label={busy === "pair" ? strings.settings.pairing : strings.settings.pair}
          loading={busy === "pair"}
          onPress={() =>
            run("pair", async () => {
              await getRuntime().pair(credential);
              setCredential("");
              setMessage(strings.settings.pairedOk);
            })
          }
        />

        <SectionHeader title={strings.settings.connectionSection} />
        <View style={styles.card}>
          <Info label={strings.connection.server} value={connection.serverUrl || "—"} />
          <Info
            label={strings.settings.state}
            value={`${connection.status}${connection.paired ? ` · ${strings.connection.paired}` : ` · ${strings.connection.notPaired}`}`}
          />
          <Info
            label={strings.connection.build}
            value={connection.serverInfo?.serverBuild ?? "—"}
          />
          <Info
            label={strings.connection.instance}
            value={connection.serverInfo?.serverInstanceId ?? "—"}
          />
          {connection.compatibility ? (
            <Info label={strings.settings.compatibility} value={connection.compatibility.action} />
          ) : null}
          {connection.lastError ? (
            <Info label={strings.connection.lastError} value={connection.lastError} />
          ) : null}
        </View>
        <ActionButton
          label={busy === "health" ? strings.settings.testing : strings.settings.testConnection}
          loading={busy === "health"}
          onPress={() =>
            run("health", async () => {
              const health = await getRuntime().testHealth();
              setMessage(
                `${strings.settings.healthOk} (${health.status}${health.startupReady === false ? ", starting" : ""})`,
              );
            })
          }
        />
        <ActionButton label={strings.connection.reconnect} onPress={() => connection.reconnect()} />

        <Text style={styles.note}>{strings.settings.themeNote}</Text>
        <Text style={styles.version}>
          {strings.settings.version} {APP_VERSION}
        </Text>
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </View>
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

function ActionButton({
  label,
  onPress,
  loading = false,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly loading?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={styles.button}>
      {loading ? (
        <ActivityIndicator color={colors.background} />
      ) : (
        <Text style={styles.buttonLabel}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  label: {
    ...type.meta,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
  input: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.row,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...type.body,
  },
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.elevated,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.md,
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
  button: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.accent,
    borderRadius: radii.row,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  buttonLabel: {
    ...type.cardTitle,
    color: colors.background,
  },
  note: {
    ...type.meta,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
  version: {
    ...type.meta,
    color: colors.textMuted,
    paddingHorizontal: spacing.lg,
  },
  message: {
    ...type.meta,
    color: colors.success,
    paddingHorizontal: spacing.lg,
  },
  error: {
    ...type.meta,
    color: colors.danger,
    paddingHorizontal: spacing.lg,
  },
});
