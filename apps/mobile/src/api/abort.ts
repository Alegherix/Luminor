export function createTimeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, ms);
  controller.signal.addEventListener(
    "abort",
    () => {
      clearTimeout(timeoutId);
    },
    { once: true },
  );
  return controller.signal;
}

export function combineAbortSignals(signals: readonly AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  const abort = () => {
    controller.abort();
  };
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort();
      return controller.signal;
    }
    signal.addEventListener("abort", abort, { once: true });
  }
  return controller.signal;
}

export function abortReason(signal: AbortSignal): unknown {
  return "reason" in signal ? signal.reason : new Error("Aborted.");
}
