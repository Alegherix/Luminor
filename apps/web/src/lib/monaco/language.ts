import { getSyntaxLanguageForPath } from "~/lib/syntaxHighlighting";

export const MONACO_PLAIN_TEXT_LANGUAGE = "plaintext";

const MONACO_LANGUAGE_BY_SYNTAX_LANGUAGE: Readonly<Record<string, string>> = {
  c: "cpp",
  cpp: "cpp",
  csharp: "csharp",
  css: "css",
  dockerfile: "dockerfile",
  go: "go",
  graphql: "graphql",
  hcl: "hcl",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "javascript",
  json: "javascript",
  jsonc: "javascript",
  jsx: "javascript",
  kotlin: "kotlin",
  lua: "lua",
  markdown: "markdown",
  mdx: "markdown",
  php: "php",
  python: "python",
  ruby: "ruby",
  rust: "rust",
  scss: "scss",
  sql: "sql",
  svelte: "html",
  swift: "swift",
  tf: "hcl",
  toml: "ini",
  tsx: "typescript",
  typescript: "typescript",
  vue: "html",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "shell",
};

export function monacoLanguageForPath(filePath: string): string {
  const syntaxLanguage = getSyntaxLanguageForPath(filePath);
  return MONACO_LANGUAGE_BY_SYNTAX_LANGUAGE[syntaxLanguage] ?? MONACO_PLAIN_TEXT_LANGUAGE;
}
