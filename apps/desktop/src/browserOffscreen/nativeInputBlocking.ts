export const OFFSCREEN_NATIVE_INPUT_BLOCKED_CHANNEL = "luminor:offscreen-native-input-blocked";

export const OFFSCREEN_NATIVE_INPUT_TYPES = [
  "color",
  "date",
  "datetime-local",
  "file",
  "month",
  "time",
  "week",
] as const;

export type OffscreenNativeInputType = (typeof OFFSCREEN_NATIVE_INPUT_TYPES)[number];

export type OffscreenNativeInputBlockedReport =
  | { readonly kind: "file-chooser"; readonly inputType: "file" }
  | {
      readonly kind: "native-widget";
      readonly inputType: Exclude<OffscreenNativeInputType, "file">;
    };

const nativeInputTypes = new Set<string>(OFFSCREEN_NATIVE_INPUT_TYPES);

export function reportBlockedNativeInput(
  inputType: string,
  report: (input: OffscreenNativeInputBlockedReport) => void,
): boolean {
  if (!nativeInputTypes.has(inputType)) return false;
  try {
    report(
      inputType === "file"
        ? { kind: "file-chooser", inputType }
        : {
            kind: "native-widget",
            inputType: inputType as Exclude<OffscreenNativeInputType, "file">,
          },
    );
  } catch {
    return true;
  }
  return true;
}

export function isOffscreenNativeInputBlockedReport(
  value: unknown,
): value is OffscreenNativeInputBlockedReport {
  if (!value || typeof value !== "object") return false;
  const report = value as { readonly kind?: unknown; readonly inputType?: unknown };
  if (typeof report.inputType !== "string" || !nativeInputTypes.has(report.inputType)) return false;
  return report.inputType === "file"
    ? report.kind === "file-chooser"
    : report.kind === "native-widget";
}
