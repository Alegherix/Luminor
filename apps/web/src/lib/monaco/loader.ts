import type { MonacoApi } from "./runtime";

let monacoPromise: Promise<MonacoApi> | null = null;

export function loadMonaco(): Promise<MonacoApi> {
  monacoPromise ??= import("./runtime").then((module) => module.configureMonacoEnvironment());
  return monacoPromise;
}

export type { MonacoApi };
