import { StyleSheet, Text, View } from "react-native";

import { colors, radii } from "../../theme/tokens";

export type IconTileProps = {
  readonly label: string;
  readonly backgroundColor?: string;
  readonly color?: string;
  readonly size?: number;
};

export function IconTile({
  label,
  backgroundColor = colors.purpleMuted,
  color = colors.purple,
  size = 36,
}: IconTileProps) {
  const glyph = label.trim().slice(0, 1).toUpperCase() || "L";
  return (
    <View
      style={[
        styles.tile,
        {
          width: size,
          height: size,
          borderRadius: Math.max(8, size / 3),
          backgroundColor,
        },
      ]}
    >
      <Text style={[styles.glyph, { color, fontSize: size * 0.42 }]}>{glyph}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.tile,
  },
  glyph: {
    fontWeight: "700",
  },
});
