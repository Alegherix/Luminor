export const DESKTOP_ALLOW_INSECURE_REMOTE_ENV = {
  LUMINOR_ALLOW_INSECURE_REMOTE: "1",
} as const;

export function withDesktopRemoteAccessEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return {
    ...env,
    ...DESKTOP_ALLOW_INSECURE_REMOTE_ENV,
  };
}
