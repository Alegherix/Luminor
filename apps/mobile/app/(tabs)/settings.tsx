import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getRuntime, useConnection } from "../../src/api";
import { ActionRow } from "../../src/components/settings/ActionRow";
import { ConfirmSheet } from "../../src/components/settings/ConfirmSheet";
import { ConnectionSheet } from "../../src/components/settings/ConnectionSheet";
import {
  connectionStatusLabel,
  pairingStatusLabel,
  protocolLabel,
} from "../../src/components/settings/connectionCopy";
import {
  formatHealthFailure,
  formatHealthSuccess,
  type HealthDisplay,
} from "../../src/components/settings/formatHealth";
import { GroupedSection, SettingsDivider } from "../../src/components/settings/GroupedSection";
import { HealthResultCard } from "../../src/components/settings/HealthResultCard";
import { InfoRow } from "../../src/components/settings/InfoRow";
import { LicensesSheet } from "../../src/components/settings/LicensesSheet";
import { TextField } from "../../src/components/settings/TextField";
import { ScreenHeader } from "../../src/components/shared/ScreenHeader";
import { strings } from "../../src/strings";
import { colors, spacing, type } from "../../src/theme/tokens";
import { APP_VERSION } from "../../src/version";

type BusyKind = "url" | "pair" | "health" | "forget" | null;

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const connection = useConnection();
  const [serverUrl, setServerUrl] = useState(connection.serverUrl);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState<BusyKind>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthDisplay | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [licensesOpen, setLicensesOpen] = useState(false);
  const [forgetOpen, setForgetOpen] = useState(false);

  useEffect(() => {
    setServerUrl(connection.serverUrl);
  }, [connection.serverUrl]);

  const run = async (kind: Exclude<BusyKind, null>, work: () => Promise<void>) => {
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
        <GroupedSection title={strings.settings.serverSection}>
          <TextField
            label={strings.settings.serverUrl}
            value={serverUrl}
            onChangeText={setServerUrl}
            placeholder={strings.settings.serverUrlPlaceholder}
          />
          <SettingsDivider />
          <ActionRow
            label={strings.settings.saveUrl}
            tone="accent"
            loading={busy === "url"}
            onPress={() =>
              void run("url", async () => {
                await getRuntime().setServerUrl(serverUrl);
                setMessage(strings.settings.urlSaved);
              })
            }
          />
          <SettingsDivider />
          <InfoRow
            label={strings.settingsUi.pairingStatus}
            value={pairingStatusLabel(connection.paired)}
            tone={connection.paired ? "success" : "default"}
          />
          <SettingsDivider />
          <TextField
            label={strings.settings.pairingCredential}
            value={credential}
            onChangeText={setCredential}
            placeholder={strings.settings.pairingPlaceholder}
            kind="secret"
            hint={strings.settingsUi.pairHint}
          />
          <SettingsDivider />
          <ActionRow
            label={busy === "pair" ? strings.settings.pairing : strings.settings.pair}
            tone="accent"
            loading={busy === "pair"}
            onPress={() =>
              void run("pair", async () => {
                await getRuntime().pair(credential);
                setCredential("");
                setMessage(strings.settings.pairedOk);
              })
            }
          />
          <SettingsDivider />
          <ActionRow
            label={busy === "health" ? strings.settings.testing : strings.settings.testConnection}
            loading={busy === "health"}
            onPress={() =>
              void run("health", async () => {
                try {
                  const snapshot = await getRuntime().testHealth();
                  setHealth(formatHealthSuccess(snapshot));
                } catch (caught) {
                  setHealth(formatHealthFailure(caught));
                }
              })
            }
          />
          {health ? <HealthResultCard result={health} /> : null}
        </GroupedSection>

        <GroupedSection title={strings.settings.connectionSection}>
          <InfoRow label={strings.settings.state} value={connectionStatusLabel(connection.status)} />
          <SettingsDivider />
          <InfoRow label={strings.connection.server} value={connection.serverUrl || "—"} />
          <SettingsDivider />
          <InfoRow
            label={strings.connection.build}
            value={connection.serverInfo?.serverBuild ?? "—"}
          />
          <SettingsDivider />
          <InfoRow
            label={strings.connection.instance}
            value={connection.serverInfo?.serverInstanceId ?? "—"}
          />
          <SettingsDivider />
          <InfoRow label={strings.connection.protocol} value={protocolLabel(connection.serverInfo)} />
          {connection.compatibility ? (
            <>
              <SettingsDivider />
              <InfoRow
                label={strings.settings.compatibility}
                value={connection.compatibility.action}
              />
            </>
          ) : null}
          {connection.lastError ? (
            <>
              <SettingsDivider />
              <InfoRow
                label={strings.connection.lastError}
                value={connection.lastError}
                tone="danger"
              />
            </>
          ) : null}
          <SettingsDivider />
          <ActionRow
            label={strings.settingsUi.openConnectionSheet}
            trailing={strings.settingsUi.chevron}
            onPress={() => setSheetOpen(true)}
          />
          <SettingsDivider />
          <ActionRow label={strings.connection.reconnect} onPress={() => connection.reconnect()} />
          <SettingsDivider />
          <ActionRow label={strings.connection.disconnect} onPress={() => connection.disconnect()} />
          <SettingsDivider />
          <ActionRow
            label={strings.connection.forgetPairing}
            tone="danger"
            loading={busy === "forget"}
            onPress={() => setForgetOpen(true)}
          />
        </GroupedSection>

        <GroupedSection title={strings.settingsUi.aboutSection}>
          <InfoRow label={strings.settings.version} value={APP_VERSION} />
          <SettingsDivider />
          <ActionRow
            label={strings.settingsUi.licenses}
            trailing={strings.settingsUi.chevron}
            onPress={() => setLicensesOpen(true)}
          />
          <SettingsDivider />
          <InfoRow label={strings.settingsUi.theme} value={strings.settings.themeNote} />
        </GroupedSection>

        {message ? <Text style={styles.message}>{message}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>

      <ConnectionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        onReconnect={() => connection.reconnect()}
        onDisconnect={() => connection.disconnect()}
        onForget={() => setForgetOpen(true)}
      />
      <LicensesSheet visible={licensesOpen} onClose={() => setLicensesOpen(false)} />
      <ConfirmSheet
        visible={forgetOpen}
        title={strings.settingsUi.forgetConfirmTitle}
        body={strings.settingsUi.forgetConfirmBody}
        confirmLabel={strings.settingsUi.confirmForget}
        onCancel={() => setForgetOpen(false)}
        onConfirm={() => {
          setForgetOpen(false);
          void run("forget", async () => {
            await getRuntime().forgetPairing();
            setHealth(null);
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingBottom: spacing.xxl,
    gap: spacing.xl,
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
