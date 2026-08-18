import * as Path from "node:path";

export interface InboundNewChatArgv {
  readonly promptFile: string;
  readonly title?: string;
  readonly folderName?: string;
  readonly submit: boolean;
}

export type ParseInboundArgvResult =
  | { readonly kind: "none" }
  | { readonly kind: "inbound"; readonly command: InboundNewChatArgv }
  | { readonly kind: "error"; readonly message: string };

const INBOUND_VALUE_FLAGS = new Set(["--prompt-file", "--title", "--folder"]);
const IGNORED_SWITCH_PREFIXES = [
  "--type",
  "--luminor-dev-root",
  "--inspect",
  "--inspect-brk",
  "--inspect-port",
  "--remote-debugging-port",
  "--user-data-dir",
  "--no-sandbox",
  "--disable-",
  "--enable-",
  "--ozone-",
  "--allow-",
  "--force-",
  "--gpu",
  "--js-flags",
  "--lang",
  "--log",
  "--v=",
  "--vmodule",
  "--app",
];

function isIgnoredSwitch(flag: string): boolean {
  return IGNORED_SWITCH_PREFIXES.some((prefix) => {
    if (prefix.endsWith("-") || prefix.endsWith("=")) {
      return flag.startsWith(prefix);
    }
    return flag === prefix || flag.startsWith(`${prefix}=`) || flag.startsWith(`${prefix}-`);
  });
}

function splitFlag(arg: string): { readonly flag: string; readonly inlineValue?: string } {
  const equals = arg.indexOf("=");
  if (equals === -1) {
    return { flag: arg };
  }
  return { flag: arg.slice(0, equals), inlineValue: arg.slice(equals + 1) };
}

export function parseInboundArgv(argv: readonly string[]): ParseInboundArgvResult {
  if (!argv.includes("--new-chat")) {
    return { kind: "none" };
  }

  let promptFile: string | undefined;
  let title: string | undefined;
  let folderName: string | undefined;
  let submit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith("-") || arg === "--new-chat") {
      continue;
    }

    const { flag, inlineValue } = splitFlag(arg);
    if (flag === "--submit") {
      submit = true;
      continue;
    }

    if (INBOUND_VALUE_FLAGS.has(flag)) {
      const value = inlineValue ?? argv[index + 1];
      if (inlineValue === undefined) {
        if (value === undefined || value.startsWith("-")) {
          return { kind: "error", message: `${flag} requires a value` };
        }
        index += 1;
      }
      if (flag === "--prompt-file") {
        promptFile = value;
      } else if (flag === "--title") {
        title = value;
      } else if (flag === "--folder") {
        folderName = value;
      }
      continue;
    }

    if (isIgnoredSwitch(flag) || isIgnoredSwitch(arg)) {
      continue;
    }

    return { kind: "error", message: `Unknown inbound flag: ${flag}` };
  }

  if (promptFile === undefined || promptFile.length === 0) {
    return { kind: "error", message: "--prompt-file is required" };
  }
  if (!Path.isAbsolute(promptFile)) {
    return { kind: "error", message: "--prompt-file must be an absolute path" };
  }

  return {
    kind: "inbound",
    command: {
      promptFile,
      ...(title === undefined ? {} : { title }),
      ...(folderName === undefined ? {} : { folderName }),
      submit,
    },
  };
}
