export const colors = {
  background: "#0A0A0B",
  elevated: "#151517",
  elevatedStrong: "#1C1C1F",
  border: "rgba(255,255,255,0.06)",
  accent: "#F97316",
  accentMuted: "rgba(249,115,22,0.16)",
  text: "#F5F5F5",
  textMuted: "#9CA3AF",
  success: "#34D399",
  successMuted: "rgba(52,211,153,0.16)",
  danger: "#F87171",
  dangerMuted: "rgba(248,113,113,0.16)",
  warning: "#FBBF24",
  warningMuted: "rgba(251,191,36,0.16)",
  purple: "#A78BFA",
  purpleMuted: "rgba(167,139,250,0.16)",
  teal: "#2DD4BF",
  tealMuted: "rgba(45,212,191,0.16)",
  tabInactive: "#6B7280",
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 28,
} as const;

export const radii = {
  row: 12,
  card: 16,
  tile: 12,
  pill: 999,
  tabBar: 20,
} as const;

export const type = {
  screenTitle: { fontSize: 22, fontWeight: "600" as const, letterSpacing: -0.3 },
  section: { fontSize: 18, fontWeight: "600" as const },
  cardTitle: { fontSize: 16, fontWeight: "500" as const },
  body: { fontSize: 15, fontWeight: "400" as const },
  meta: { fontSize: 13, fontWeight: "400" as const },
  chip: { fontSize: 12, fontWeight: "500" as const },
  tab: { fontSize: 11, fontWeight: "600" as const },
} as const;
