import type { ModelSelection, ProviderKind, ProviderModelDescriptor } from "@luminor/contracts";
import { formatModelDisplayName, humanizeModelSlug } from "@luminor/shared/model";

const PROVIDER_LABELS: Record<ProviderKind, string> = {
  codex: "Codex",
  claudeAgent: "Claude",
  cursor: "Cursor",
  antigravity: "Antigravity",
  grok: "Grok",
  droid: "Droid",
  kilo: "Kilo",
  opencode: "OpenCode",
  pi: "Pi",
};

export function providerLabel(provider: ProviderKind): string {
  return PROVIDER_LABELS[provider];
}

export function formatContextWindow(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/k$/i.test(trimmed) || /m$/i.test(trimmed)) return trimmed.toLowerCase();
  const numeric = Number(trimmed.replace(/[_,\s]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return trimmed;
  if (numeric >= 1_000_000) {
    const millions = numeric / 1_000_000;
    return Number.isInteger(millions) ? `${millions}m` : `${millions.toFixed(1)}m`;
  }
  if (numeric >= 1_000) {
    const thousands = numeric / 1_000;
    return Number.isInteger(thousands) ? `${thousands}k` : `${thousands.toFixed(0)}k`;
  }
  return String(numeric);
}

function selectionContextWindow(selection: ModelSelection): string | null {
  const options = selection.options as { contextWindow?: string } | undefined;
  return formatContextWindow(options?.contextWindow);
}

export function formatModelSelectionLabel(
  selection: ModelSelection,
  catalogModel?: ProviderModelDescriptor,
): string {
  const name =
    catalogModel?.name ??
    formatModelDisplayName(selection.model) ??
    humanizeModelSlug(selection.model);
  const context =
    formatContextWindow(catalogModel?.defaultContextWindow) ?? selectionContextWindow(selection);
  return context ? `${name} (${context})` : name;
}

export function modelMatchesSelection(
  model: ProviderModelDescriptor,
  selection: ModelSelection,
): boolean {
  return model.slug === selection.model || model.resolvedModel === selection.model;
}
