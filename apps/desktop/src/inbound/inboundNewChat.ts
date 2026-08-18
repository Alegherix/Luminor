import { PROVIDER_SEND_TURN_MAX_INPUT_CHARS } from "@luminor/contracts";

import type { InboundNewChatArgv } from "./parseInboundArgv";

export interface InboundNewChatRuntimeDeps {
  readonly readFile: (path: string) => Promise<string>;
  readonly unlink: (path: string) => Promise<void>;
  readonly fetchImpl: typeof fetch;
  readonly waitUntilReady: () => Promise<void>;
  readonly getBackendHttpUrl: () => string;
  readonly getBackendAuthToken: () => string;
  readonly navigateToThread: (threadId: string) => void;
  readonly log: (message: string, error?: unknown) => void;
}

export interface InboundNewChatRuntime {
  enqueue(command: InboundNewChatArgv): Promise<void>;
}

const DEFAULT_TITLE_MAX_CHARS = 80;

function defaultInboundTitleFromPrompt(prompt: string): string {
  for (const line of prompt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0) {
      continue;
    }
    return trimmed.slice(0, DEFAULT_TITLE_MAX_CHARS);
  }
  return "";
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function createInboundNewChatRuntime(
  deps: InboundNewChatRuntimeDeps,
): InboundNewChatRuntime {
  let tail: Promise<void> = Promise.resolve();

  const run = async (command: InboundNewChatArgv): Promise<void> => {
    let prompt: string;
    try {
      prompt = await deps.readFile(command.promptFile);
    } catch (error) {
      deps.log(
        `[inbound] failed to read prompt file ${command.promptFile}: ${formatErrorMessage(error)}`,
        error,
      );
      return;
    }

    if (prompt.trim().length === 0) {
      deps.log(`[inbound] prompt file is empty: ${command.promptFile}`);
      return;
    }
    if (prompt.length > PROVIDER_SEND_TURN_MAX_INPUT_CHARS) {
      deps.log(
        `[inbound] prompt exceeds PROVIDER_SEND_TURN_MAX_INPUT_CHARS (${prompt.length}): ${command.promptFile}`,
      );
      return;
    }

    try {
      await deps.unlink(command.promptFile);
    } catch (error) {
      deps.log(
        `[inbound] failed to delete prompt file ${command.promptFile}: ${formatErrorMessage(error)}`,
        error,
      );
    }

    await deps.waitUntilReady();

    const title = command.title ?? defaultInboundTitleFromPrompt(prompt);
    const body: {
      title?: string;
      prompt: string;
      folderName?: string;
      submit: boolean;
    } = {
      prompt,
      submit: command.submit,
    };
    if (title.length > 0) {
      body.title = title;
    }
    if (command.folderName !== undefined) {
      body.folderName = command.folderName;
    }

    const url = `${deps.getBackendHttpUrl().replace(/\/$/, "")}/internal/inbound/new-chat`;
    let response: Response;
    try {
      response = await deps.fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${deps.getBackendAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
    } catch (error) {
      deps.log(`[inbound] POST ${url} failed: ${formatErrorMessage(error)}`, error);
      return;
    }

    if (!response.ok) {
      deps.log(`[inbound] POST ${url} returned ${response.status}`);
      return;
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      deps.log(`[inbound] POST ${url} returned invalid JSON: ${formatErrorMessage(error)}`, error);
      return;
    }

    const threadId =
      payload && typeof payload === "object" && "threadId" in payload
        ? (payload as { threadId?: unknown }).threadId
        : undefined;
    if (typeof threadId !== "string" || threadId.trim().length === 0) {
      deps.log(`[inbound] POST ${url} response missing threadId`);
      return;
    }

    deps.navigateToThread(threadId);
  };

  return {
    enqueue(command) {
      const next = tail.then(
        () => run(command),
        () => run(command),
      );
      tail = next.then(
        () => undefined,
        () => undefined,
      );
      return next;
    },
  };
}
