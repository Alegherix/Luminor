import type { WebContents } from "electron";

import type { BrowserAutomationVisibleRuntime } from "../browserManager";
import {
  drainOnAbort,
  ensureCdpAttached,
  evaluateInContext,
  getCdpSessionCoordinator,
  sendCdpCommand,
  throwIfAborted,
} from "./cdpRuntime";

export const MAX_DIALOGS_PER_COMMAND = 20;
const MAX_DIALOG_TEXT_BYTES = 4_096;
const DIALOG_CLEANUP_TIMEOUT_MS = 1_000;

export interface BrowserHandledDialog {
  readonly kind: "alert" | "confirm" | "prompt" | "beforeunload";
  readonly message: string;
  readonly defaultPrompt?: string;
  readonly action: "accepted" | "dismissed";
  readonly openedAt: string;
}

export interface BrowserOpenJavaScriptDialog {
  readonly kind: BrowserHandledDialog["kind"];
  readonly message: string;
  readonly defaultPrompt: string | null;
  readonly openedAt: string;
}

interface DialogPolicy {
  readonly accept: boolean;
  readonly action: BrowserHandledDialog["action"];
}

const DIALOG_POLICY: Record<BrowserHandledDialog["kind"], DialogPolicy> = {
  alert: { accept: true, action: "accepted" },
  confirm: { accept: false, action: "dismissed" },
  prompt: { accept: false, action: "dismissed" },
  beforeunload: { accept: false, action: "dismissed" },
};

interface DialogCapture {
  readonly dialogs: BrowserHandledDialog[];
  readonly pending: Set<Promise<unknown>>;
}

interface MonitoredDialog {
  readonly id: number;
  readonly dialog: BrowserOpenJavaScriptDialog;
  published: boolean;
}

interface DialogMonitor {
  readonly captures: Set<DialogCapture>;
  readonly listeners: Set<(dialog: BrowserOpenJavaScriptDialog | null) => void>;
  openDialog: MonitoredDialog | null;
  nextDialogId: number;
  dispose: () => void;
}

const dialogMonitors = new WeakMap<WebContents, Promise<DialogMonitor>>();

const isNoDialogOpenError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /no (?:javascript )?dialog (?:is )?(?:showing|open)/i.test(message);
};

const truncateUtf8 = (value: unknown): string => {
  const raw = typeof value === "string" ? value : String(value ?? "");
  if (Buffer.byteLength(raw, "utf8") <= MAX_DIALOG_TEXT_BYTES) return raw;
  let lower = 0;
  let upper = raw.length;
  while (lower < upper) {
    const middle = Math.ceil((lower + upper) / 2);
    if (Buffer.byteLength(raw.slice(0, middle), "utf8") <= MAX_DIALOG_TEXT_BYTES) lower = middle;
    else upper = middle - 1;
  }
  return raw.slice(0, lower);
};

const normalizeDialogKind = (value: unknown): BrowserHandledDialog["kind"] =>
  value === "confirm" || value === "prompt" || value === "beforeunload" ? value : "alert";

const normalizeOpenDialog = (opening: Record<string, unknown>): BrowserOpenJavaScriptDialog => {
  const kind = normalizeDialogKind(opening.type ?? opening.kind);
  const defaultPrompt = opening.defaultPrompt ?? opening.defaultValue;
  return {
    kind,
    message: truncateUtf8(opening.message),
    defaultPrompt: defaultPrompt === undefined ? null : truncateUtf8(defaultPrompt),
    openedAt:
      typeof opening.openedAt === "string" && Number.isFinite(Date.parse(opening.openedAt))
        ? new Date(opening.openedAt).toISOString()
        : new Date().toISOString(),
  };
};

const normalizeDialog = (opening: Record<string, unknown>): BrowserHandledDialog => {
  const dialog = normalizeOpenDialog(opening);
  return {
    kind: dialog.kind,
    message: dialog.message,
    ...(dialog.defaultPrompt === null ? {} : { defaultPrompt: dialog.defaultPrompt }),
    action: DIALOG_POLICY[dialog.kind].action,
    openedAt: dialog.openedAt,
  };
};

const publishOpenDialog = (monitor: DialogMonitor, openDialog: MonitoredDialog): void => {
  monitor.openDialog = openDialog;
  openDialog.published = true;
  for (const listener of monitor.listeners) listener(openDialog.dialog);
};

const clearOpenDialog = (monitor: DialogMonitor, dialogId?: number): boolean => {
  const openDialog = monitor.openDialog;
  if (!openDialog || (dialogId !== undefined && openDialog.id !== dialogId)) return false;
  monitor.openDialog = null;
  if (openDialog.published) {
    for (const listener of monitor.listeners) listener(null);
  }
  return true;
};

const DIALOG_SHIM_INSTALL = String.raw`(() => {
  const key = "__luminorBrowserAutomationDialogStateV1";
  const state = window[key] || { dialogs: [], installed: false };
  window[key] = state;
  if (state.installed) {
    // A previous best-effort cleanup may have lost its execution context.
    // Discard unclaimed prompts instead of attributing them to this command.
    if (Array.isArray(state.dialogs)) state.dialogs.splice(0, state.dialogs.length);
    else state.dialogs = [];
    return true;
  }
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  const record = (kind, message, defaultPrompt, action) => {
    if (state.dialogs.length >= 20) return;
    state.dialogs.push({
      kind,
      message: String(message ?? "").slice(0, 4096),
      ...(defaultPrompt === undefined
        ? {}
        : { defaultPrompt: String(defaultPrompt ?? "").slice(0, 4096) }),
      action,
      openedAt: new Date().toISOString(),
    });
  };
  const alertShim = (message = "") => {
    record("alert", message, undefined, "accepted");
  };
  const confirmShim = (message = "") => {
    record("confirm", message, undefined, "dismissed");
    return false;
  };
  const promptShim = (message = "", defaultPrompt = "") => {
    record("prompt", message, defaultPrompt, "dismissed");
    return null;
  };
  Object.defineProperty(state, "originalAlert", { configurable: true, value: originalAlert });
  Object.defineProperty(state, "originalConfirm", { configurable: true, value: originalConfirm });
  Object.defineProperty(state, "originalPrompt", { configurable: true, value: originalPrompt });
  Object.defineProperty(state, "alertShim", { configurable: true, value: alertShim });
  Object.defineProperty(state, "confirmShim", { configurable: true, value: confirmShim });
  Object.defineProperty(state, "promptShim", { configurable: true, value: promptShim });
  window.alert = alertShim;
  window.confirm = confirmShim;
  window.prompt = promptShim;
  state.installed = true;
  return true;
})()`;

const DIALOG_SHIM_DRAIN = String.raw`(() => {
  const state = window.__luminorBrowserAutomationDialogStateV1;
  if (!state || !Array.isArray(state.dialogs)) return [];
  return state.dialogs.splice(0, 20);
})()`;

const DIALOG_SHIM_RESTORE = String.raw`(() => {
  const key = "__luminorBrowserAutomationDialogStateV1";
  const state = window[key];
  if (!state) return true;
  if (state.installed && window.alert === state.alertShim && typeof state.originalAlert === "function") {
    window.alert = state.originalAlert;
  }
  if (state.installed && window.confirm === state.confirmShim && typeof state.originalConfirm === "function") {
    window.confirm = state.originalConfirm;
  }
  if (state.installed && window.prompt === state.promptShim && typeof state.originalPrompt === "function") {
    window.prompt = state.originalPrompt;
  }
  delete window[key];
  return true;
})()`;

const ensureDialogMonitor = async (
  runtime: BrowserAutomationVisibleRuntime,
  signal?: AbortSignal,
): Promise<DialogMonitor> => {
  throwIfAborted(signal);
  const webContents = runtime.webContents;
  const existing = dialogMonitors.get(webContents);
  if (existing) return drainOnAbort(existing, signal);

  const monitorPromise = (async (): Promise<DialogMonitor> => {
    ensureCdpAttached(webContents);
    const monitor: DialogMonitor = {
      captures: new Set(),
      listeners: new Set(),
      openDialog: null,
      nextDialogId: 1,
      dispose: () => undefined,
    };
    const coordinator = getCdpSessionCoordinator(webContents);
    const onMessage = (method: string, params: Record<string, unknown>) => {
      if (method === "Page.javascriptDialogClosed") {
        clearOpenDialog(monitor);
        return;
      }
      if (method !== "Page.javascriptDialogOpening") return;
      const openDialog: MonitoredDialog = {
        id: monitor.nextDialogId++,
        dialog: normalizeOpenDialog(params),
        published: false,
      };
      monitor.openDialog = openDialog;
      if (monitor.captures.size === 0) {
        publishOpenDialog(monitor, openDialog);
        return;
      }
      const dialog = normalizeDialog(params);
      const policy = DIALOG_POLICY[dialog.kind];
      // This path deliberately bypasses sendCdpCommand: it must be able to
      // unblock a renderer whose normal CDP work is waiting behind the modal.
      // Attach rejection handling directly to Electron's promise. Wrapping the
      // call in a detached microtask leaves a narrow unhandled-rejection race
      // when Chromium auto-closes the dialog before the queued command runs.
      const handling = coordinator
        .sendCommand("Page.handleJavaScriptDialog", {
          accept: policy.accept,
        })
        .then(
          () => {
            clearOpenDialog(monitor, openDialog.id);
            return true;
          },
          (error: unknown) => {
            if (isNoDialogOpenError(error)) {
              clearOpenDialog(monitor, openDialog.id);
              return true;
            }
            if (monitor.openDialog?.id === openDialog.id) publishOpenDialog(monitor, openDialog);
            return false;
          },
        );
      for (const capture of monitor.captures) {
        const captureHandling = handling.then((answered) => {
          if (answered && capture.dialogs.length < MAX_DIALOGS_PER_COMMAND) {
            capture.dialogs.push(dialog);
          }
        });
        capture.pending.add(captureHandling);
        void captureHandling.then(() => capture.pending.delete(captureHandling));
      }
    };
    const tracksDestruction =
      typeof webContents.once === "function" && typeof webContents.removeListener === "function";
    const unsubscribeMessages = coordinator.subscribeMessages(onMessage);
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      // Electron emits `destroyed` after the debugger wrapper itself has become
      // unusable. Calling removeListener through that wrapper then throws
      // "Object has been destroyed" during application shutdown. The native
      // object is already releasing every listener in that path, so explicit
      // listener cleanup is only necessary while WebContents is still alive.
      if (!webContents.isDestroyed()) {
        unsubscribeMessages();
        if (tracksDestruction) webContents.removeListener("destroyed", dispose);
      }
      monitor.captures.clear();
      clearOpenDialog(monitor);
      monitor.listeners.clear();
      dialogMonitors.delete(webContents);
    };
    monitor.dispose = dispose;
    if (tracksDestruction) webContents.once("destroyed", dispose);
    try {
      await sendCdpCommand(runtime, "Page.enable", {}, signal);
      throwIfAborted(signal);
      return monitor;
    } catch (error) {
      dispose();
      throw error;
    }
  })();
  dialogMonitors.set(webContents, monitorPromise);
  try {
    return await monitorPromise;
  } catch (error) {
    dialogMonitors.delete(webContents);
    throw error;
  }
};

export const observeJavaScriptDialogs = async (
  runtime: BrowserAutomationVisibleRuntime,
  listener: (dialog: BrowserOpenJavaScriptDialog | null) => void,
): Promise<() => void> => {
  const monitor = await ensureDialogMonitor(runtime);
  monitor.listeners.add(listener);
  listener(monitor.openDialog?.dialog ?? null);
  return () => monitor.listeners.delete(listener);
};

export const initializeJavaScriptDialogHandling = async (
  runtime: BrowserAutomationVisibleRuntime,
): Promise<void> => {
  await ensureDialogMonitor(runtime);
};

export const resolveJavaScriptDialog = async (
  runtime: BrowserAutomationVisibleRuntime,
  input: { readonly accept: boolean; readonly promptText?: string },
): Promise<boolean> => {
  const monitor = await ensureDialogMonitor(runtime);
  const openDialog = monitor.openDialog;
  if (!openDialog) return false;
  const coordinator = getCdpSessionCoordinator(runtime.webContents);
  try {
    await coordinator.sendCommand("Page.handleJavaScriptDialog", {
      accept: input.accept,
      ...(input.promptText === undefined ? {} : { promptText: truncateUtf8(input.promptText) }),
    });
  } catch (error) {
    if (!isNoDialogOpenError(error)) throw error;
  }
  clearOpenDialog(monitor, openDialog.id);
  return true;
};

const dismissOpenDialogForAgentTurn = async (
  runtime: BrowserAutomationVisibleRuntime,
  monitor: DialogMonitor,
  signal?: AbortSignal,
): Promise<void> => {
  const coordinator = getCdpSessionCoordinator(runtime.webContents);
  const openDialog = monitor.openDialog;
  await drainOnAbort(
    coordinator
      .sendCommand("Page.handleJavaScriptDialog", { accept: false })
      .catch((error: unknown) => {
        if (isNoDialogOpenError(error)) return;
        throw error;
      }),
    signal,
  );
  if (openDialog) clearOpenDialog(monitor, openDialog.id);
};

const installDialogShim = async (
  runtime: BrowserAutomationVisibleRuntime,
  signal?: AbortSignal,
): Promise<void> => {
  await evaluateInContext(runtime, DIALOG_SHIM_INSTALL, { signal });
};

const evaluateDialogCleanup = async <Result>(
  runtime: BrowserAutomationVisibleRuntime,
  expression: string,
): Promise<Result | undefined> => {
  try {
    const response = await evaluateInContext<Result>(runtime, expression, {
      // CDP enforces this deadline inside Chromium. Awaiting that same command
      // keeps cleanup non-cancellable and leaves no detached promise behind.
      timeoutMs: DIALOG_CLEANUP_TIMEOUT_MS,
    });
    return response.value;
  } catch {
    // Navigation, teardown, or the cleanup deadline already discarded the
    // instrumented Window. Cleanup must never replace the command's result.
    return undefined;
  }
};

const drainDialogShim = async (
  runtime: BrowserAutomationVisibleRuntime,
): Promise<BrowserHandledDialog[]> => {
  const dialogs = await evaluateDialogCleanup<unknown[]>(runtime, DIALOG_SHIM_DRAIN);
  if (!Array.isArray(dialogs)) return [];
  return dialogs
    .slice(0, MAX_DIALOGS_PER_COMMAND)
    .map((value) =>
      normalizeDialog(value && typeof value === "object" ? (value as Record<string, unknown>) : {}),
    );
};

const restoreDialogShim = async (runtime: BrowserAutomationVisibleRuntime): Promise<void> => {
  await evaluateDialogCleanup(runtime, DIALOG_SHIM_RESTORE);
};

export const withDialogHandling = async <T>(
  runtime: BrowserAutomationVisibleRuntime,
  operation: () => Promise<T>,
  signal?: AbortSignal,
): Promise<{ readonly value: T; readonly dialogs: readonly BrowserHandledDialog[] }> => {
  throwIfAborted(signal);
  const monitor = await ensureDialogMonitor(runtime, signal);
  throwIfAborted(signal);
  const capture: DialogCapture = { dialogs: [], pending: new Set() };
  monitor.captures.add(capture);
  let dialogShimInstalled = false;
  let documentReplaced = false;
  let shimDialogs: BrowserHandledDialog[] = [];
  let unsubscribeDocumentLifecycle: () => void = () => undefined;
  const onDocumentLifecycle = (method: string, rawParams: Record<string, unknown>) => {
    if (method === "Runtime.executionContextsCleared") {
      documentReplaced = true;
      return;
    }
    if (method !== "Page.frameNavigated" || !rawParams || typeof rawParams !== "object") return;
    const frame = (rawParams as { readonly frame?: { readonly parentId?: string } }).frame;
    if (frame && !frame.parentId) documentReplaced = true;
  };
  try {
    try {
      await dismissOpenDialogForAgentTurn(runtime, monitor, signal);
    } catch (error) {
      if (monitor.listeners.size === 0) monitor.dispose();
      throw error;
    }
    throwIfAborted(signal);
    await installDialogShim(runtime, signal);
    dialogShimInstalled = true;
    unsubscribeDocumentLifecycle = getCdpSessionCoordinator(runtime.webContents).subscribeMessages(
      onDocumentLifecycle,
    );
    const value = await operation();
    throwIfAborted(signal);
    return { value, dialogs: capture.dialogs };
  } finally {
    // The operation (including Runtime.terminateExecution on abort) has drained
    // before this block runs. Ignore the caller's cancelled signal for the
    // bounded restore so main-world dialog APIs never remain overridden after
    // the per-tab lock is released.
    unsubscribeDocumentLifecycle();
    const mayIssueCleanupCommands = !documentReplaced;
    if (dialogShimInstalled && mayIssueCleanupCommands && !signal?.aborted) {
      shimDialogs = await drainDialogShim(runtime);
      for (const dialog of shimDialogs) {
        if (capture.dialogs.length >= MAX_DIALOGS_PER_COMMAND) break;
        capture.dialogs.push(dialog);
      }
    }
    await Promise.allSettled([...capture.pending]);
    monitor.captures.delete(capture);
    if (dialogShimInstalled && mayIssueCleanupCommands) await restoreDialogShim(runtime);
  }
};
