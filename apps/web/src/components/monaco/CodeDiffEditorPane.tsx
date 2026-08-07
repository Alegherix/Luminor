import type * as MonacoTypes from "monaco-editor/editor/editor.api";
import { useEffect, useRef } from "react";

import { buildMonacoEditorOptions } from "~/lib/monaco/editorOptions";
import { loadMonaco } from "~/lib/monaco/loader";
import { defineSynaraMonacoTheme, type MonacoThemeVariant } from "~/lib/monaco/theme";
import { cn } from "~/lib/utils";

export interface CodeDiffEditorPaneProps {
  original: string;
  originalVersion: number;
  modified: string;
  modifiedVersion: number;
  language: string;
  resolvedTheme: MonacoThemeVariant;
  renderSideBySide: boolean;
  readOnly?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function CodeDiffEditorPane(props: CodeDiffEditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const diffEditorRef = useRef<MonacoTypes.editor.IStandaloneDiffEditor | null>(null);
  const originalModelRef = useRef<MonacoTypes.editor.ITextModel | null>(null);
  const modifiedModelRef = useRef<MonacoTypes.editor.ITextModel | null>(null);
  const appliedOriginalVersionRef = useRef<number | null>(null);
  const appliedModifiedVersionRef = useRef<number | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onSaveRef = useRef(props.onSave);
  onChangeRef.current = props.onChange;
  onSaveRef.current = props.onSave;
  const originalRef = useRef(props.original);
  originalRef.current = props.original;
  const modifiedRef = useRef(props.modified);
  modifiedRef.current = props.modified;
  const languageRef = useRef(props.language);
  languageRef.current = props.language;
  const themeRef = useRef(props.resolvedTheme);
  themeRef.current = props.resolvedTheme;
  const readOnlyRef = useRef(props.readOnly ?? false);
  readOnlyRef.current = props.readOnly ?? false;
  const renderSideBySideRef = useRef(props.renderSideBySide);
  renderSideBySideRef.current = props.renderSideBySide;
  const originalVersionRef = useRef(props.originalVersion);
  originalVersionRef.current = props.originalVersion;
  const modifiedVersionRef = useRef(props.modifiedVersion);
  modifiedVersionRef.current = props.modifiedVersion;

  useEffect(() => {
    let disposed = false;
    let diffEditor: MonacoTypes.editor.IStandaloneDiffEditor | null = null;
    let originalModel: MonacoTypes.editor.ITextModel | null = null;
    let modifiedModel: MonacoTypes.editor.ITextModel | null = null;

    void loadMonaco().then((monaco) => {
      const container = containerRef.current;
      if (disposed || !container) {
        return;
      }
      const themeName = defineSynaraMonacoTheme(monaco, themeRef.current);
      originalModel = monaco.editor.createModel(originalRef.current, languageRef.current);
      modifiedModel = monaco.editor.createModel(modifiedRef.current, languageRef.current);
      diffEditor = monaco.editor.createDiffEditor(container, {
        ...buildMonacoEditorOptions(),
        theme: themeName,
        originalEditable: false,
        readOnly: readOnlyRef.current,
        renderSideBySide: renderSideBySideRef.current,
        renderOverviewRuler: true,
        ignoreTrimWhitespace: false,
      });
      diffEditor.setModel({ original: originalModel, modified: modifiedModel });
      appliedOriginalVersionRef.current = originalVersionRef.current;
      appliedModifiedVersionRef.current = modifiedVersionRef.current;
      diffEditorRef.current = diffEditor;
      originalModelRef.current = originalModel;
      modifiedModelRef.current = modifiedModel;
      modifiedModel.onDidChangeContent(() => {
        onChangeRef.current(modifiedModel?.getValue() ?? "");
      });
      diffEditor.getModifiedEditor().addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
    });

    return () => {
      disposed = true;
      diffEditorRef.current = null;
      originalModelRef.current = null;
      modifiedModelRef.current = null;
      appliedOriginalVersionRef.current = null;
      appliedModifiedVersionRef.current = null;
      diffEditor?.dispose();
      originalModel?.dispose();
      modifiedModel?.dispose();
    };
  }, []);

  useEffect(() => {
    const model = originalModelRef.current;
    if (!model || appliedOriginalVersionRef.current === props.originalVersion) {
      return;
    }
    appliedOriginalVersionRef.current = props.originalVersion;
    if (model.getValue() !== props.original) {
      model.setValue(props.original);
    }
  }, [props.original, props.originalVersion]);

  useEffect(() => {
    const model = modifiedModelRef.current;
    if (!model || appliedModifiedVersionRef.current === props.modifiedVersion) {
      return;
    }
    appliedModifiedVersionRef.current = props.modifiedVersion;
    if (model.getValue() !== props.modified) {
      model.setValue(props.modified);
    }
  }, [props.modified, props.modifiedVersion]);

  useEffect(() => {
    const originalModel = originalModelRef.current;
    const modifiedModel = modifiedModelRef.current;
    if (!originalModel || !modifiedModel) {
      return;
    }
    void loadMonaco().then((monaco) => {
      if (originalModelRef.current === originalModel) {
        monaco.editor.setModelLanguage(originalModel, props.language);
      }
      if (modifiedModelRef.current === modifiedModel) {
        monaco.editor.setModelLanguage(modifiedModel, props.language);
      }
    });
  }, [props.language]);

  useEffect(() => {
    diffEditorRef.current?.updateOptions({
      readOnly: props.readOnly ?? false,
      renderSideBySide: props.renderSideBySide,
    });
  }, [props.readOnly, props.renderSideBySide]);

  useEffect(() => {
    if (!diffEditorRef.current) {
      return;
    }
    void loadMonaco().then((monaco) => {
      if (diffEditorRef.current) {
        monaco.editor.setTheme(defineSynaraMonacoTheme(monaco, props.resolvedTheme));
      }
    });
  }, [props.resolvedTheme]);

  return <div ref={containerRef} className={cn("min-h-0 min-w-0 flex-1", props.className)} />;
}
