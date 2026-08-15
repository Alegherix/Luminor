import { useEffect, useRef, useState } from "react";

export type DebouncedAutosaveStatus = "idle" | "saving" | "saved" | "error";

export type DebouncedAutosaveController<T> = {
  schedule(value: T): void;
  flush(): Promise<void>;
  reset(value: T): void;
  isIdle(): boolean;
  getStatus(): DebouncedAutosaveStatus;
  dispose(): Promise<void>;
};

type DebouncedAutosaveInput<T> = {
  readonly initialValue: T;
  readonly save: (value: T) => Promise<void>;
  readonly debounceMs?: number;
  readonly equals?: (left: T, right: T) => boolean;
  readonly onSaved?: (value: T) => void;
  readonly onStatusChange?: (status: DebouncedAutosaveStatus) => void;
};

const DEFAULT_AUTOSAVE_DEBOUNCE_MS = 500;

export function createDebouncedAutosave<T>(
  input: DebouncedAutosaveInput<T>,
): DebouncedAutosaveController<T> {
  const debounceMs = input.debounceMs ?? DEFAULT_AUTOSAVE_DEBOUNCE_MS;
  const equals = input.equals ?? Object.is;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let inFlightValue: T | null = null;
  let retryAfterInFlight = false;
  let disposed = false;
  let revision = 0;
  let pendingValue = input.initialValue;
  let lastCommittedValue = input.initialValue;
  let status: DebouncedAutosaveStatus = "idle";

  const updateStatus = (nextStatus: DebouncedAutosaveStatus) => {
    if (status === nextStatus) return;
    status = nextStatus;
    input.onStatusChange?.(nextStatus);
  };

  const clearTimer = () => {
    if (timer === null) return;
    globalThis.clearTimeout(timer);
    timer = null;
  };

  const controller: DebouncedAutosaveController<T> = {
    schedule(value) {
      pendingValue = value;
      clearTimer();
      if (inFlight !== null) {
        retryAfterInFlight = inFlightValue === null || !equals(value, inFlightValue);
        return;
      }
      if (equals(value, lastCommittedValue)) {
        updateStatus("saved");
        return;
      }
      updateStatus("saving");
      timer = globalThis.setTimeout(() => {
        timer = null;
        void controller.flush().catch(() => undefined);
      }, debounceMs);
    },

    flush() {
      clearTimer();
      if (inFlight !== null) {
        if (inFlightValue === null || !equals(pendingValue, inFlightValue)) {
          retryAfterInFlight = true;
        }
        return inFlight;
      }
      if (equals(pendingValue, lastCommittedValue)) {
        return Promise.resolve();
      }

      const value = pendingValue;
      const saveRevision = revision;
      updateStatus("saving");
      inFlightValue = value;
      const operation = Promise.resolve()
        .then(() => input.save(value))
        .then(() => {
          if (saveRevision !== revision) return;
          lastCommittedValue = value;
          input.onSaved?.(value);
          updateStatus("saved");
        })
        .catch((error: unknown) => {
          if (saveRevision === revision) {
            updateStatus("error");
          }
          throw error;
        })
        .finally(() => {
          if (inFlight !== operation) return;
          inFlight = null;
          inFlightValue = null;
          const shouldRetry = retryAfterInFlight && !equals(pendingValue, lastCommittedValue);
          retryAfterInFlight = false;
          if (!shouldRetry) return;
          if (disposed) {
            void controller.flush().catch(() => undefined);
            return;
          }
          timer = globalThis.setTimeout(() => {
            timer = null;
            void controller.flush().catch(() => undefined);
          }, debounceMs);
        });
      inFlight = operation;
      return operation;
    },

    reset(value) {
      revision += 1;
      clearTimer();
      pendingValue = value;
      lastCommittedValue = value;
      retryAfterInFlight = false;
      updateStatus("idle");
    },

    isIdle() {
      return timer === null && inFlight === null;
    },

    getStatus() {
      return status;
    },

    dispose() {
      disposed = true;
      return controller.flush();
    },
  };

  return controller;
}

export function useDebouncedAutosave<T>(input: DebouncedAutosaveInput<T>): {
  readonly schedule: (value: T) => void;
  readonly flush: () => Promise<void>;
  readonly reset: (value: T) => void;
  readonly isIdle: () => boolean;
  readonly status: DebouncedAutosaveStatus;
} {
  const saveRef = useRef(input.save);
  const onSavedRef = useRef(input.onSaved);
  const mountedRef = useRef(true);
  const [status, setStatus] = useState<DebouncedAutosaveStatus>("idle");
  saveRef.current = input.save;
  onSavedRef.current = input.onSaved;
  mountedRef.current = true;

  const controllerRef = useRef<DebouncedAutosaveController<T> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createDebouncedAutosave({
      initialValue: input.initialValue,
      ...(input.debounceMs === undefined ? {} : { debounceMs: input.debounceMs }),
      ...(input.equals === undefined ? {} : { equals: input.equals }),
      save: (value) => saveRef.current(value),
      onSaved: (value) => onSavedRef.current?.(value),
      onStatusChange: (nextStatus) => {
        if (mountedRef.current) setStatus(nextStatus);
      },
    });
  }
  const controller = controllerRef.current;

  useEffect(
    () => () => {
      mountedRef.current = false;
      void controller.dispose().catch(() => undefined);
    },
    [controller],
  );

  return {
    schedule: controller.schedule,
    flush: controller.flush,
    reset: controller.reset,
    isIdle: controller.isIdle,
    status,
  };
}
