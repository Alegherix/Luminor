import { type ReactNode, useEffect } from "react";

import { getRuntime } from "../api/runtime";

export function AppRuntimeProvider({ children }: { readonly children: ReactNode }) {
  useEffect(() => {
    void getRuntime().start();
  }, []);
  return children;
}
