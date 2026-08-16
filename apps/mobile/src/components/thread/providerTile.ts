import type { ProviderKind } from "@luminor/contracts";

import { colors } from "../../theme/tokens";

export function providerTileColors(provider: ProviderKind): {
  readonly backgroundColor: string;
  readonly color: string;
} {
  switch (provider) {
    case "grok":
    case "opencode":
      return { backgroundColor: colors.purpleMuted, color: colors.purple };
    case "claudeAgent":
    case "kilo":
      return { backgroundColor: colors.accentMuted, color: colors.accent };
    case "codex":
    case "droid":
      return { backgroundColor: colors.tealMuted, color: colors.teal };
    case "cursor":
      return { backgroundColor: colors.successMuted, color: colors.success };
    case "antigravity":
    case "pi":
      return { backgroundColor: colors.warningMuted, color: colors.warning };
  }
}
