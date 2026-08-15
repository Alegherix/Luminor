// FILE: useThreadNotesAutosave.ts
// Purpose: Own the notepad debounce/save/reconcile lifecycle for one thread instance.
// Layer: Environment panel hook
// Exports: useThreadNotesAutosave

import { useCallback, useEffect, useRef, useState, type ChangeEventHandler } from "react";
import type { ThreadId } from "@luminor/contracts";

import { useDebouncedAutosave } from "../../../hooks/useDebouncedAutosave";

interface UseThreadNotesAutosaveInput {
  readonly threadId: ThreadId;
  readonly notes: string;
  readonly onChange: (threadId: ThreadId, notes: string) => Promise<void>;
  readonly debounceMs?: number;
}

interface UseThreadNotesAutosaveResult {
  readonly value: string;
  readonly onChange: ChangeEventHandler<HTMLTextAreaElement>;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}

interface PendingLocalEcho {
  readonly value: string;
  readonly staleServerValue: string;
}

// Serializes note writes and reconciles server echoes without clobbering active typing.
export function useThreadNotesAutosave({
  threadId,
  notes,
  onChange,
  debounceMs: debounceMsProp,
}: UseThreadNotesAutosaveInput): UseThreadNotesAutosaveResult {
  const [value, setValue] = useState(notes);
  const [focused, setFocused] = useState(false);
  const lastObservedServerNotesRef = useRef(notes);
  const pendingLocalEchoRef = useRef<PendingLocalEcho | null>(null);
  const valueRef = useRef(value);
  const threadIdRef = useRef(threadId);
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
    threadIdRef.current = threadId;
  }, [onChange, threadId]);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const { schedule, flush, reset, isIdle } = useDebouncedAutosave({
    initialValue: notes,
    ...(debounceMsProp === undefined ? {} : { debounceMs: debounceMsProp }),
    save: (next) => onChangeRef.current(threadIdRef.current, next),
    onSaved: (next) => {
      pendingLocalEchoRef.current = {
        value: next,
        staleServerValue: lastObservedServerNotesRef.current,
      };
    },
  });

  useEffect(() => {
    lastObservedServerNotesRef.current = notes;
    const pendingLocalEcho = pendingLocalEchoRef.current;
    if (pendingLocalEcho !== null && notes === pendingLocalEcho.value) {
      pendingLocalEchoRef.current = null;
    }
    const waitingForLocalEcho =
      pendingLocalEchoRef.current !== null &&
      valueRef.current === pendingLocalEchoRef.current.value &&
      notes === pendingLocalEchoRef.current.staleServerValue;
    if (!focused && isIdle() && notes !== value && !waitingForLocalEcho) {
      pendingLocalEchoRef.current = null;
      valueRef.current = notes;
      reset(notes);
      setValue(notes);
    }
  }, [focused, isIdle, notes, reset, value]);

  const handleChange = useCallback<ChangeEventHandler<HTMLTextAreaElement>>(
    (event) => {
      const nextValue = event.target.value;
      // Keep the ref ahead of React state so immediate unmount still flushes the last keystroke.
      valueRef.current = nextValue;
      setValue(nextValue);
      schedule(nextValue);
    },
    [schedule],
  );

  const handleFocus = useCallback(() => {
    setFocused(true);
  }, []);

  const handleBlur = useCallback(() => {
    setFocused(false);
    void flush().catch(() => undefined);
  }, [flush]);

  return {
    value,
    onChange: handleChange,
    onFocus: handleFocus,
    onBlur: handleBlur,
  };
}
