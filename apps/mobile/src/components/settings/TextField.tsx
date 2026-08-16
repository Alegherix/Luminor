import { StyleSheet, Text, TextInput, View } from "react-native";

import { colors, radii, spacing, type } from "../../theme/tokens";

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  kind = "url",
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChangeText: (value: string) => void;
  readonly placeholder: string;
  readonly kind?: "url" | "secret";
  readonly hint?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType={kind === "url" ? "url" : "default"}
        secureTextEntry={kind === "secret"}
        style={styles.input}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  label: {
    ...type.meta,
    color: colors.textMuted,
  },
  input: {
    backgroundColor: colors.elevatedStrong,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radii.row,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    ...type.body,
  },
  hint: {
    ...type.meta,
    color: colors.textMuted,
  },
});
