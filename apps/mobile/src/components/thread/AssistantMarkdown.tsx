import { memo, useMemo } from "react";
import { StyleSheet, View } from "react-native";
import { useMarkdown } from "react-native-marked";

import { colors, radii, type } from "../../theme/tokens";

const MARKDOWN_THEME = {
  colors: {
    text: colors.text,
    code: "#111113",
    link: colors.accent,
    border: colors.border,
    background: colors.background,
  },
} as const;

const MARKDOWN_STYLES = {
  text: { ...type.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  paragraph: { paddingVertical: 4 },
  li: { ...type.body, color: colors.text, fontSize: 15, lineHeight: 22 },
  codespan: {
    fontFamily: "monospace",
    backgroundColor: colors.elevatedStrong,
    color: colors.text,
    fontSize: 13,
    borderRadius: 4,
  },
  code: {
    backgroundColor: "#111113",
    borderRadius: radii.row,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
  },
} as const;

export const AssistantMarkdown = memo(function AssistantMarkdown({
  value,
}: {
  readonly value: string;
}) {
  const options = useMemo(
    () => ({ colorScheme: "dark" as const, theme: MARKDOWN_THEME, styles: MARKDOWN_STYLES }),
    [],
  );
  const elements = useMarkdown(value, options);
  return <View style={styles.wrap}>{elements}</View>;
});

const styles = StyleSheet.create({
  wrap: {
    gap: 0,
  },
});
