export const PREVIEW_URL_PORT_PLACEHOLDER = "{port}";

export interface PreviewUrlResolutionInput {
  /** URL template configured on the project's preview script, if any. */
  readonly urlTemplate?: string | null | undefined;
  /** Port assigned to the preview process, when one was allocated. */
  readonly port?: number | null | undefined;
  /** URL observed in the preview process output, when one was detected. */
  readonly detectedUrl?: string | null | undefined;
}

const normalizeUrl = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

export function previewUrlTemplateRequiresPort(urlTemplate: string | null | undefined): boolean {
  return typeof urlTemplate === "string" && urlTemplate.includes(PREVIEW_URL_PORT_PLACEHOLDER);
}

/**
 * Single resolution point for the URL a preview pane loads.
 *
 * A template without `{port}` is used as-is. A template with `{port}` resolves
 * only once a port is known. Without a template the URL comes from whatever was
 * detected in the process output.
 */
export function resolvePreviewUrl(input: PreviewUrlResolutionInput): string | null {
  const template = normalizeUrl(input.urlTemplate);
  if (!template) {
    return normalizeUrl(input.detectedUrl);
  }
  if (previewUrlTemplateRequiresPort(template)) {
    const port = input.port;
    if (typeof port !== "number" || !Number.isInteger(port) || port <= 0) {
      return normalizeUrl(input.detectedUrl);
    }
    return template.replaceAll(PREVIEW_URL_PORT_PLACEHOLDER, String(port));
  }
  return template;
}
