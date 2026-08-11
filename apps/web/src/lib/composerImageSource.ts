// FILE: composerImageSource.ts
// Purpose: Describes provenance shown on composer image attachments.
// Layer: Web composer domain

export interface ComposerLegacyCaptureSource {
  kind: "appsnap";
  captureId: string;
  capturedAt: string;
  appName: string | null;
  bundleIdentifier?: string | null;
  appIconDataUrl?: string | null;
  windowTitle: string | null;
}

export type ComposerImageSource = ComposerLegacyCaptureSource;

export type PersistedComposerLegacyCaptureSource = Omit<
  ComposerLegacyCaptureSource,
  "appIconDataUrl"
>;

function normalizeAppIconDataUrl(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 256_000) return null;
  return /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value) ? value : null;
}

export function normalizeComposerImageSource(value: unknown): ComposerImageSource | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = value as Record<string, unknown>;
  if (
    (candidate.kind !== "appsnap" && candidate.kind !== "appshot") ||
    typeof candidate.captureId !== "string" ||
    candidate.captureId.length === 0 ||
    typeof candidate.capturedAt !== "string"
  ) {
    return undefined;
  }
  return {
    kind: "appsnap",
    captureId: candidate.captureId,
    capturedAt: candidate.capturedAt,
    appName: typeof candidate.appName === "string" ? candidate.appName : null,
    bundleIdentifier:
      typeof candidate.bundleIdentifier === "string" ? candidate.bundleIdentifier : null,
    appIconDataUrl: normalizeAppIconDataUrl(candidate.appIconDataUrl),
    windowTitle: typeof candidate.windowTitle === "string" ? candidate.windowTitle : null,
  };
}

export function toPersistedComposerImageSource(
  value: unknown,
): PersistedComposerLegacyCaptureSource | undefined {
  const source = normalizeComposerImageSource(value);
  if (!source) return undefined;
  const { appIconDataUrl: _appIconDataUrl, ...persistedSource } = source;
  return persistedSource;
}
