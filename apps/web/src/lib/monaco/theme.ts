import { parseCssColorToHex } from "./cssColor";
import type { MonacoApi } from "./runtime";

export const SYNARA_MONACO_LIGHT_THEME = "synara-light";
export const SYNARA_MONACO_DARK_THEME = "synara-dark";

export type MonacoThemeVariant = "light" | "dark";

export function monacoThemeName(variant: MonacoThemeVariant): string {
  return variant === "dark" ? SYNARA_MONACO_DARK_THEME : SYNARA_MONACO_LIGHT_THEME;
}

const THEME_COLOR_EXPRESSIONS = {
  background: "var(--background)",
  foreground: "var(--foreground)",
  border: "var(--border)",
  mutedForeground: "var(--muted-foreground)",
  surface: "var(--color-background-surface)",
  lineHighlight: "color-mix(in srgb, var(--background) 96%, var(--foreground))",
  indentGuide: "color-mix(in srgb, var(--background) 88%, var(--foreground))",
  selection: "color-mix(in srgb, var(--background) 78%, var(--color-text-accent))",
  inactiveSelection: "color-mix(in srgb, var(--background) 88%, var(--color-text-accent))",
  addedLine: "color-mix(in srgb, var(--background) 92%, var(--success))",
  addedText: "color-mix(in srgb, var(--background) 80%, var(--success))",
  removedLine: "color-mix(in srgb, var(--background) 92%, var(--destructive))",
  removedText: "color-mix(in srgb, var(--background) 80%, var(--destructive))",
} as const;

type ThemeColorKey = keyof typeof THEME_COLOR_EXPRESSIONS;

const LIGHT_FALLBACK_COLORS: Readonly<Record<ThemeColorKey, string>> = {
  background: "#ffffff",
  foreground: "#1a1a1a",
  border: "#e4e4e7",
  mutedForeground: "#71717a",
  surface: "#fafafa",
  lineHighlight: "#f4f4f5",
  indentGuide: "#e4e4e7",
  selection: "#d6e4ff",
  inactiveSelection: "#eaf0fb",
  addedLine: "#eaf6ec",
  addedText: "#cdead4",
  removedLine: "#fbecec",
  removedText: "#f3cdcd",
};

const DARK_FALLBACK_COLORS: Readonly<Record<ThemeColorKey, string>> = {
  background: "#111113",
  foreground: "#ededed",
  border: "#2a2a2e",
  mutedForeground: "#8b8b93",
  surface: "#171719",
  lineHighlight: "#1b1b1e",
  indentGuide: "#2a2a2e",
  selection: "#1e3352",
  inactiveSelection: "#182437",
  addedLine: "#16241a",
  addedText: "#1f3d27",
  removedLine: "#2a1618",
  removedText: "#48191d",
};

const DEFAULT_EDITOR_FONT_FAMILY =
  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace";
const DEFAULT_EDITOR_FONT_SIZE = 12;

export interface MonacoEditorFont {
  fontFamily: string;
  fontSize: number;
}

export function readMonacoEditorFont(): MonacoEditorFont {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { fontFamily: DEFAULT_EDITOR_FONT_FAMILY, fontSize: DEFAULT_EDITOR_FONT_SIZE };
  }
  const rootStyle = window.getComputedStyle(document.documentElement);
  const fontFamily = rootStyle.getPropertyValue("--font-chat-code-family").trim();
  const fontSize = Number.parseFloat(
    rootStyle.getPropertyValue("--app-font-size-chat-code").trim(),
  );
  return {
    fontFamily: fontFamily.length > 0 ? fontFamily : DEFAULT_EDITOR_FONT_FAMILY,
    fontSize: Number.isFinite(fontSize) && fontSize > 0 ? fontSize : DEFAULT_EDITOR_FONT_SIZE,
  };
}

function readThemeColors(variant: MonacoThemeVariant): Record<ThemeColorKey, string> {
  const fallbacks = variant === "dark" ? DARK_FALLBACK_COLORS : LIGHT_FALLBACK_COLORS;
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { ...fallbacks };
  }

  const probe = document.createElement("div");
  probe.setAttribute("aria-hidden", "true");
  probe.style.position = "fixed";
  probe.style.top = "0";
  probe.style.left = "0";
  probe.style.width = "0";
  probe.style.height = "0";
  probe.style.pointerEvents = "none";
  document.body.append(probe);

  try {
    const computed = window.getComputedStyle(probe);
    const entries = Object.entries(THEME_COLOR_EXPRESSIONS) as ReadonlyArray<
      [ThemeColorKey, string]
    >;
    const resolved = { ...fallbacks };
    for (const [key, expression] of entries) {
      probe.style.color = expression;
      resolved[key] = parseCssColorToHex(computed.color) ?? fallbacks[key];
    }
    return resolved;
  } finally {
    probe.remove();
  }
}

export function defineSynaraMonacoTheme(monaco: MonacoApi, variant: MonacoThemeVariant): string {
  const colors = readThemeColors(variant);
  const name = monacoThemeName(variant);
  monaco.editor.defineTheme(name, {
    base: variant === "dark" ? "vs-dark" : "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": colors.background,
      "editor.foreground": colors.foreground,
      "editorGutter.background": colors.background,
      "editorLineNumber.foreground": colors.mutedForeground,
      "editorLineNumber.activeForeground": colors.foreground,
      "editor.lineHighlightBackground": colors.lineHighlight,
      "editor.lineHighlightBorder": colors.lineHighlight,
      "editor.selectionBackground": colors.selection,
      "editor.inactiveSelectionBackground": colors.inactiveSelection,
      "editorCursor.foreground": colors.foreground,
      "editorIndentGuide.background1": colors.indentGuide,
      "editorIndentGuide.activeBackground1": colors.border,
      "editorWhitespace.foreground": colors.indentGuide,
      "editorWidget.background": colors.surface,
      "editorWidget.border": colors.border,
      "editorOverviewRuler.border": colors.border,
      "minimap.background": colors.background,
      "diffEditor.border": colors.border,
      "diffEditor.insertedLineBackground": colors.addedLine,
      "diffEditor.removedLineBackground": colors.removedLine,
      "diffEditor.insertedTextBackground": colors.addedText,
      "diffEditor.removedTextBackground": colors.removedText,
      "diffEditorGutter.insertedLineBackground": colors.addedLine,
      "diffEditorGutter.removedLineBackground": colors.removedLine,
      "diffEditorOverview.insertedForeground": colors.addedText,
      "diffEditorOverview.removedForeground": colors.removedText,
    },
  });
  return name;
}
