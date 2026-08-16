import type { HealthSnapshot } from "../../api/health";
import { strings } from "../../strings";

export type HealthDisplay = {
  readonly ok: boolean;
  readonly title: string;
  readonly detail: string;
};

function readinessLabel(value: boolean | null, notReady: string): string {
  if (value === true) return strings.settingsUi.healthReady;
  if (value === false) return notReady;
  return strings.settingsUi.healthUnknown;
}

export function formatHealthSuccess(health: HealthSnapshot): HealthDisplay {
  const parts = [
    `${strings.settings.state} ${health.status}`,
    `${strings.settingsUi.startup} ${readinessLabel(health.startupReady, strings.settingsUi.healthStarting)}`,
    `${strings.settingsUi.pushBus} ${readinessLabel(health.pushBusReady, strings.settingsUi.healthNotReady)}`,
  ];
  if (health.projectionState) {
    parts.push(`${strings.settingsUi.projection} ${health.projectionState}`);
  }
  return {
    ok: health.startupReady !== false,
    title: strings.settings.healthOk,
    detail: parts.join(" · "),
  };
}

export function formatHealthFailure(error: unknown): HealthDisplay {
  return {
    ok: false,
    title: strings.settingsUi.healthFailed,
    detail: error instanceof Error ? error.message : String(error),
  };
}
