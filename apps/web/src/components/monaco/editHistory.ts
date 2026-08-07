import type * as MonacoTypes from "monaco-editor/editor/editor.api";

export interface MonacoEditHistoryControls {
  undo: () => void;
  redo: () => void;
  revertTo: (value: string) => void;
}

export interface MonacoEditHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

export const INITIAL_MONACO_EDIT_HISTORY_STATE: MonacoEditHistoryState = {
  canUndo: false,
  canRedo: false,
};

export function createMonacoEditHistoryControls(
  editor: MonacoTypes.editor.IStandaloneCodeEditor,
  model: MonacoTypes.editor.ITextModel,
): MonacoEditHistoryControls {
  return {
    undo: () => {
      editor.focus();
      editor.trigger("edit-history-controls", "undo", null);
    },
    redo: () => {
      editor.focus();
      editor.trigger("edit-history-controls", "redo", null);
    },
    revertTo: (value) => {
      if (model.isDisposed() || model.getValue() === value) {
        return;
      }
      editor.pushUndoStop();
      editor.executeEdits("edit-history-controls", [
        { range: model.getFullModelRange(), text: value },
      ]);
      editor.pushUndoStop();
    },
  };
}

export function readMonacoEditHistoryState(
  model: MonacoTypes.editor.ITextModel,
): MonacoEditHistoryState {
  if (model.isDisposed()) {
    return INITIAL_MONACO_EDIT_HISTORY_STATE;
  }
  return { canUndo: model.canUndo(), canRedo: model.canRedo() };
}
