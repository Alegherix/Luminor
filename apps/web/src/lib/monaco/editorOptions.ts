import type * as MonacoTypes from "monaco-editor/editor/editor.api";

import { readMonacoEditorFont } from "./theme";

export function buildMonacoEditorOptions(): MonacoTypes.editor.IStandaloneEditorConstructionOptions {
  const { fontFamily, fontSize } = readMonacoEditorFont();
  return {
    fontFamily,
    fontSize,
    lineHeight: Math.round(fontSize * 1.6),
    automaticLayout: true,
    wordWrap: "off",
    scrollBeyondLastLine: false,
    fixedOverflowWidgets: true,
    minimap: { enabled: true, renderCharacters: false, maxColumn: 80 },
    renderLineHighlight: "line",
    smoothScrolling: true,
    scrollbar: { useShadows: false, verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
    padding: { top: 8, bottom: 8 },
    overviewRulerBorder: false,
    guides: { indentation: true },
    tabSize: 2,
    contextmenu: false,
  };
}
