import type { ConnectionStatus } from "../../api";

export type SectionPhase = "disconnected" | "loading" | "empty" | "ready";

export function sectionPhase(
  status: ConnectionStatus,
  hydrated: boolean,
  isEmpty: boolean,
): SectionPhase {
  if (!hydrated && (status === "closed" || status === "incompatible")) {
    return "disconnected";
  }
  if (!hydrated) return "loading";
  if (isEmpty) return "empty";
  return "ready";
}
