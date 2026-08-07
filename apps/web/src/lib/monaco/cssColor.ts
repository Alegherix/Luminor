function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function channelToHex(value: number): string {
  return clampChannel(value).toString(16).padStart(2, "0");
}

function parseNumericComponent(token: string, scale: number): number | null {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed === "none") {
    return 0;
  }
  if (trimmed.endsWith("%")) {
    const percentage = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(percentage) ? (percentage / 100) * scale : null;
  }
  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function splitComponents(body: string): { channels: string[]; alpha: string | null } {
  const [channelPart, alphaPart] = body.split("/");
  const channels = (channelPart ?? "")
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  const alphaFromSlash = alphaPart?.trim();
  if (alphaFromSlash !== undefined && alphaFromSlash.length > 0) {
    return { channels, alpha: alphaFromSlash };
  }
  if (channels.length > 3) {
    return { channels: channels.slice(0, 3), alpha: channels[3] ?? null };
  }
  return { channels, alpha: null };
}

function buildHex(red: number, green: number, blue: number, alpha: number | null): string {
  const base = `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`;
  if (alpha === null || alpha >= 1) {
    return base;
  }
  return `${base}${channelToHex(Math.max(0, alpha) * 255)}`;
}

function expandHexNotation(value: string): string | null {
  const digits = value.slice(1);
  if (!/^[0-9a-f]+$/i.test(digits)) {
    return null;
  }
  if (digits.length === 3 || digits.length === 4) {
    const expanded = [...digits].map((digit) => `${digit}${digit}`).join("");
    return `#${expanded.toLowerCase()}`;
  }
  if (digits.length === 6 || digits.length === 8) {
    return `#${digits.toLowerCase()}`;
  }
  return null;
}

export function parseCssColorToHex(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (trimmed.length === 0 || trimmed === "transparent") {
    return null;
  }
  if (trimmed.startsWith("#")) {
    return expandHexNotation(trimmed);
  }

  const rgbMatch = /^rgba?\(([^)]*)\)$/.exec(trimmed);
  if (rgbMatch?.[1] !== undefined) {
    const { channels, alpha } = splitComponents(rgbMatch[1]);
    if (channels.length < 3) {
      return null;
    }
    const red = parseNumericComponent(channels[0] ?? "", 255);
    const green = parseNumericComponent(channels[1] ?? "", 255);
    const blue = parseNumericComponent(channels[2] ?? "", 255);
    if (red === null || green === null || blue === null) {
      return null;
    }
    return buildHex(red, green, blue, alpha === null ? null : parseNumericComponent(alpha, 1));
  }

  const srgbMatch = /^color\(\s*srgb\s+([^)]*)\)$/.exec(trimmed);
  if (srgbMatch?.[1] !== undefined) {
    const { channels, alpha } = splitComponents(srgbMatch[1]);
    if (channels.length < 3) {
      return null;
    }
    const red = parseNumericComponent(channels[0] ?? "", 1);
    const green = parseNumericComponent(channels[1] ?? "", 1);
    const blue = parseNumericComponent(channels[2] ?? "", 1);
    if (red === null || green === null || blue === null) {
      return null;
    }
    return buildHex(
      red * 255,
      green * 255,
      blue * 255,
      alpha === null ? null : parseNumericComponent(alpha, 1),
    );
  }

  return null;
}
