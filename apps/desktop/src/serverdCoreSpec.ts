export const SERVERD_CORE_ENV_PASSTHROUGH = [
  "LUMINOR_HOME",
  "LUMINOR_HOST",
  "LUMINOR_MODE",
  "ELECTRON_RUN_AS_NODE",
  "LUMINOR_SERVER_ENTRY",
] as const;

export function composeServerdCoreSpec(input: {
  readonly program: string;
  readonly args: readonly string[];
}): string {
  return JSON.stringify({
    program: input.program,
    args: [...input.args],
    envPassthrough: [...SERVERD_CORE_ENV_PASSTHROUGH],
  });
}
