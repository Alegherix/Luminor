import type { OrchestrationProjectShell, OrchestrationSpaceShell } from "@luminor/contracts";
import { describe, expect, it } from "vitest";

import { threadBreadcrumb } from "./breadcrumb";

describe("threadBreadcrumb", () => {
  it("joins space and project when both exist", () => {
    const spaces = [{ id: "s1", name: "Personal" }] as OrchestrationSpaceShell[];
    const projects = [
      { id: "p1", title: "Luminor", spaceId: "s1" },
    ] as OrchestrationProjectShell[];
    expect(threadBreadcrumb({ projectId: "p1" as never }, projects, spaces)).toBe(
      "Personal • Luminor",
    );
  });

  it("falls back to the project title", () => {
    const projects = [{ id: "p1", title: "Luminor", spaceId: null }] as OrchestrationProjectShell[];
    expect(threadBreadcrumb({ projectId: "p1" as never }, projects, [])).toBe("Luminor");
  });

  it("returns null without a project", () => {
    expect(threadBreadcrumb({ projectId: "missing" as never }, [], [])).toBeNull();
  });
});
