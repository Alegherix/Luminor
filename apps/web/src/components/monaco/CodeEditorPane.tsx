import type * as MonacoTypes from "monaco-editor/editor/editor.api";
import { useEffect, useRef } from "react";

import { buildMonacoEditorOptions } from "~/lib/monaco/editorOptions";
import { loadMonaco } from "~/lib/monaco/loader";
import { defineSynaraMonacoTheme, type MonacoThemeVariant } from "~/lib/monaco/theme";
import { cn } from "~/lib/utils";

export interface CodeEditorPaneProps {
  value: string;
  valueVersion: number;
  language: string;
  resolvedTheme: MonacoThemeVariant;
  readOnly?: boolean;
  className?: string;
  onChange: (value: string) => void;
  onSave: () => void;
}

export function CodeEditorPane(props: CodeEditorPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoTypes.editor.IStandaloneCodeEditor | null>(null);
  const appliedVersionRef = useRef<number | null>(null);
  const onChangeRef = useRef(props.onChange);
  const onSaveRef = useRef(props.onSave);
  onChangeRef.current = props.onChange;
  onSaveRef.current = props.onSave;
  const valueRef = useRef(props.value);
  valueRef.current = props.value;
  const languageRef = useRef(props.language);
  languageRef.current = props.language;
  const themeRef = useRef(props.resolvedTheme);
  themeRef.current = props.resolvedTheme;
  const readOnlyRef = useRef(props.readOnly ?? false);
  readOnlyRef.current = props.readOnly ?? false;
  const versionRef = useRef(props.valueVersion);
  versionRef.current = props.valueVersion;

  useEffect(() => {
    let disposed = false;
    let editor: MonacoTypes.editor.IStandaloneCodeEditor | null = null;
    let model: MonacoTypes.editor.ITextModel | null = null;

    void loadMonaco().then((monaco) => {
      const container = containerRef.current;
      if (disposed || !container) {
        return;
      }
      const themeName = defineSynaraMonacoTheme(monaco, themeRef.current);
      model = monaco.editor.createModel(valueRef.current, languageRef.current);
      editor = monaco.editor.create(container, {
        ...buildMonacoEditorOptions(),
        model,
        theme: themeName,
        readOnly: readOnlyRef.current,
      });
      appliedVersionRef.current = versionRef.current;
      editorRef.current = editor;
      model.onDidChangeContent(() => {
        onChangeRef.current(model?.getValue() ?? "");
      });
      editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        onSaveRef.current();
      });
    });

    return () => {
      disposed = true;
      editorRef.current = null;
      appliedVersionRef.current = null;
      editor?.dispose();
      model?.dispose();
    };
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) {
      return;
    }
    if (appliedVersionRef.current === props.valueVersion) {
      return;
    }
    appliedVersionRef.current = props.valueVersion;
    if (model.getValue() !== props.value) {
      editor.pushUndoStop();
      model.setValue(props.value);
    }
  }, [props.value, props.valueVersion]);

  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!model) {
      return;
    }
    void loadMonaco().then((monaco) => {
      if (editorRef.current?.getModel() === model) {
        monaco.editor.setModelLanguage(model, props.language);
      }
    });
  }, [props.language]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly: props.readOnly ?? false });
  }, [props.readOnly]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    void loadMonaco().then((monaco) => {
      if (editorRef.current) {
        monaco.editor.setTheme(defineSynaraMonacoTheme(monaco, props.resolvedTheme));
      }
    });
  }, [props.resolvedTheme]);

  return <div ref={containerRef} className={cn("min-h-0 min-w-0 flex-1", props.className)} />;
}
