import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import {
  deriveProviderUsageDisplayRows,
  selectPrimaryProviderUsageDisplayRow,
} from "~/lib/providerUsageDisplay";

import { ProviderUsageLimitRows } from "../ProviderUsageLimitRows";
import { Menu } from "../ui/menu";
import { UsageRosterPanel } from "./UsageRosterPanel";

afterEach(() => {
  vi.useRealTimers();
});

function claudeRows() {
  return deriveProviderUsageDisplayRows([
    {
      provider: "claudeAgent",
      updatedAt: "2026-06-09T12:00:00.000Z",
      limits: [
        {
          window: "5h",
          usedPercent: 17,
          resetsAt: "2026-06-09T12:51:00.000Z",
          windowDurationMins: 300,
        },
        {
          window: "Weekly",
          usedPercent: 14,
          resetsAt: "2026-06-15T03:00:00.000Z",
          windowDurationMins: 10_080,
        },
      ],
    },
  ]);
}

describe("UsageRosterPanel", () => {
  it("keeps reset copy on each window and drops it from the provider header", () => {
    vi.setSystemTime("2026-06-09T12:00:00.000Z");
    const rows = claudeRows();

    const markup = renderToStaticMarkup(
      <Menu>
        <UsageRosterPanel
          entries={[
            {
              provider: "claudeAgent",
              rows,
              tightestRow: selectPrimaryProviderUsageDisplayRow(rows),
              notice: undefined,
              state: { kind: "usage", detail: undefined },
            },
          ]}
          isFetching={false}
          onRefresh={() => undefined}
          onOpenUsageSettings={() => undefined}
        />
      </Menu>,
    );

    expect(markup).toContain("Claude");
    expect(markup.match(/Resets in/g)).toEqual(["Resets in", "Resets in"]);
    expect(markup).not.toContain("in reserve");
    expect(markup).not.toContain("Lasts until reset");
  });
});

describe("ProviderUsageLimitRows", () => {
  it("omits reserve and lasts-until-reset copy on the popover surface", () => {
    vi.setSystemTime("2026-06-09T12:00:00.000Z");
    const markup = renderToStaticMarkup(
      <ProviderUsageLimitRows rows={claudeRows()} surface="popover" />,
    );

    expect(markup).toContain("5h");
    expect(markup).toContain("83% left");
    expect(markup).toContain("Resets in");
    expect(markup).not.toContain("in reserve");
    expect(markup).not.toContain("Lasts until reset");
  });

  it("keeps reserve and eta copy on the settings surface", () => {
    vi.setSystemTime("2026-06-09T12:00:00.000Z");
    const markup = renderToStaticMarkup(
      <ProviderUsageLimitRows rows={claudeRows()} surface="settings" />,
    );

    expect(markup).toContain("in reserve");
    expect(markup).toContain("Lasts until reset");
  });
});
