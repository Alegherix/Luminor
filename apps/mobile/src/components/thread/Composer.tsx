import { Ionicons } from "@expo/vector-icons";
import type {
  ModelSelection,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
} from "@luminor/contracts";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";

import { api, buildTurnStartCommand } from "../../api";
import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { ModelPickerChip } from "./ModelPickerChip";

export function Composer({
  threadId,
  modelSelection,
  runtimeMode,
  interactionMode,
  running,
  connected,
  interrupting,
  onInterrupt,
}: {
  readonly threadId: ThreadId;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly running: boolean;
  readonly connected: boolean;
  readonly interrupting: boolean;
  readonly onInterrupt: () => void;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && connected && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      await api.dispatchCommand(
        buildTurnStartCommand({
          threadId,
          text: trimmed,
          ...(runtimeMode ? { runtimeMode } : {}),
          ...(interactionMode ? { interactionMode } : {}),
          modelSelection,
        }),
      );
      setText("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.toolbar}>
        <ModelPickerChip
          selection={modelSelection}
          onSelect={(next) => api.setModelSelection(threadId, next)}
        />
      </View>
      <View style={styles.inputRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={strings.thread.sendPlaceholder}
          placeholderTextColor={colors.textMuted}
          multiline
          style={styles.input}
          editable={connected}
        />
        {running ? (
          <Pressable
            onPress={onInterrupt}
            disabled={interrupting}
            style={[styles.iconButton, styles.stop]}
            accessibilityRole="button"
            accessibilityLabel={strings.thread.interrupt}
          >
            <Ionicons name="stop" size={16} color={colors.danger} />
          </Pressable>
        ) : null}
        <Pressable
          onPress={() => void send()}
          disabled={!canSend}
          style={[styles.iconButton, styles.send, !canSend && styles.sendDisabled]}
          accessibilityRole="button"
          accessibilityLabel={strings.thread.send}
        >
          <Ionicons
            name="arrow-up"
            size={18}
            color={canSend ? colors.background : colors.textMuted}
          />
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    backgroundColor: colors.elevated,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    ...type.body,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: radii.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  send: {
    backgroundColor: colors.accent,
  },
  sendDisabled: {
    backgroundColor: colors.elevatedStrong,
  },
  stop: {
    backgroundColor: colors.dangerMuted,
    borderWidth: 1,
    borderColor: colors.border,
  },
  error: {
    ...type.meta,
    color: colors.danger,
  },
});
