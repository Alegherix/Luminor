import { Ionicons } from "@expo/vector-icons";
import type { ModelSelection, ProviderModelDescriptor } from "@luminor/contracts";
import { useEffect, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text } from "react-native";

import { api } from "../../api";
import { strings } from "../../strings";
import { colors, radii, spacing, type } from "../../theme/tokens";
import { IconTile } from "../shared/IconTile";
import { formatModelSelectionLabel, modelMatchesSelection, providerGlyph } from "./modelLabel";
import { providerTileColors } from "./providerTile";

export function ModelPickerChip({
  selection,
  onSelect,
}: {
  readonly selection: ModelSelection;
  readonly onSelect: (next: ModelSelection) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<readonly ProviderModelDescriptor[]>([]);
  const [applying, setApplying] = useState<string | null>(null);
  const tile = providerTileColors(selection.provider);
  const current = models.find((model) => modelMatchesSelection(model, selection));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void api
      .listModels({ provider: selection.provider })
      .then((result) => {
        if (!cancelled) setModels(result.models);
      })
      .catch((caught: unknown) => {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : strings.thread.modelsUnavailable);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, selection.provider]);

  return (
    <>
      <Pressable onPress={() => setOpen(true)} style={styles.chip} accessibilityRole="button">
        <IconTile
          label={providerGlyph(selection.provider)}
          backgroundColor={tile.backgroundColor}
          color={tile.color}
          size={20}
        />
        <Text style={styles.chipLabel} numberOfLines={1}>
          {formatModelSelectionLabel(selection, current)}
        </Text>
        <Ionicons name="chevron-down" size={14} color={colors.textMuted} />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.sheet} onPress={() => undefined}>
            <Text style={styles.sheetTitle}>{strings.thread.pickModel}</Text>
            {loading ? <ActivityIndicator color={colors.accent} /> : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
            {!loading && !error && models.length === 0 ? (
              <Text style={styles.empty}>{strings.thread.noModels}</Text>
            ) : null}
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {models.map((model) => {
                const selected = modelMatchesSelection(model, selection);
                return (
                  <Pressable
                    key={model.slug}
                    disabled={applying !== null}
                    onPress={() => {
                      setApplying(model.slug);
                      void onSelect({ ...selection, model: model.slug })
                        .then(() => setOpen(false))
                        .catch((caught: unknown) => {
                          setError(
                            caught instanceof Error
                              ? caught.message
                              : strings.thread.modelsUnavailable,
                          );
                        })
                        .finally(() => setApplying(null));
                    }}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <Text style={styles.optionLabel} numberOfLines={1}>
                      {formatModelSelectionLabel(selection, model)}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={16} color={colors.accent} />
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.elevatedStrong,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    maxWidth: "78%",
  },
  chipLabel: {
    ...type.chip,
    color: colors.text,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.elevated,
    borderTopLeftRadius: radii.tabBar,
    borderTopRightRadius: radii.tabBar,
    padding: spacing.xl,
    gap: spacing.md,
    maxHeight: "70%",
  },
  sheetTitle: {
    ...type.section,
    color: colors.text,
  },
  list: {
    maxHeight: 360,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderRadius: radii.row,
  },
  optionSelected: {
    backgroundColor: colors.accentMuted,
  },
  optionLabel: {
    ...type.body,
    color: colors.text,
    flex: 1,
  },
  error: {
    ...type.meta,
    color: colors.danger,
  },
  empty: {
    ...type.meta,
    color: colors.textMuted,
  },
});
