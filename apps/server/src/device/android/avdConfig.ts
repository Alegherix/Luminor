import type { DeviceGeometry } from "@luminor/contracts";

export interface AvdProfile {
  readonly widthPx: number | null;
  readonly heightPx: number | null;
  readonly densityDpi: number | null;
  readonly apiLevel: number | null;
}

const ANDROID_BASELINE_DPI = 160;

export function parseAvdConfigIni(text: string): AvdProfile {
  const entries = new Map<string, string>();
  for (const line of text.split("\n")) {
    const separator = line.indexOf("=");
    if (separator > 0)
      entries.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  const int = (key: string): number | null => {
    const raw = entries.get(key);
    const value = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(value) && value > 0 ? value : null;
  };
  const sysdir = entries.get("image.sysdir.1") ?? "";
  const api = /android-(\d+)/u.exec(sysdir);
  return {
    widthPx: int("hw.lcd.width"),
    heightPx: int("hw.lcd.height"),
    densityDpi: int("hw.lcd.density"),
    apiLevel: api ? Number.parseInt(api[1] ?? "", 10) : null,
  };
}

export function androidGeometry(
  widthPx: number,
  heightPx: number,
  densityDpi: number,
): DeviceGeometry {
  const scale = densityDpi / ANDROID_BASELINE_DPI;
  return {
    pointWidth: Math.round(widthPx / scale),
    pointHeight: Math.round(heightPx / scale),
    scale,
  };
}

const TABLET_SMALLEST_WIDTH_DP = 600;

export function androidFamily(geometry: DeviceGeometry): "phone" | "tablet" {
  return Math.min(geometry.pointWidth, geometry.pointHeight) >= TABLET_SMALLEST_WIDTH_DP
    ? "tablet"
    : "phone";
}
