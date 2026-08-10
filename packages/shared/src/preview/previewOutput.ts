const ESCAPE = 0x1b;
const BELL = 0x07;
const TAB = 0x09;
const LINE_FEED = 0x0a;
const CARRIAGE_RETURN = 0x0d;
const DELETE = 0x7f;
const CSI_INTRODUCER = 0x5b;
const OSC_INTRODUCER = 0x5d;
const BACKSLASH = 0x5c;
const CSI_FINAL_BYTE_START = 0x40;
const CSI_FINAL_BYTE_END = 0x7e;
const FIRST_PRINTABLE = 0x20;

const isPrintable = (code: number): boolean =>
  code === TAB ||
  code === LINE_FEED ||
  code === CARRIAGE_RETURN ||
  (code >= FIRST_PRINTABLE && code !== DELETE);

// Index of the last byte belonging to the escape sequence that starts at `start`.
const escapeSequenceEnd = (value: string, start: number): number => {
  const introducer = value.charCodeAt(start + 1);
  if (introducer === CSI_INTRODUCER) {
    for (let index = start + 2; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code >= CSI_FINAL_BYTE_START && code <= CSI_FINAL_BYTE_END) {
        return index;
      }
    }
    return value.length;
  }
  if (introducer === OSC_INTRODUCER) {
    for (let index = start + 2; index < value.length; index += 1) {
      const code = value.charCodeAt(index);
      if (code === BELL) {
        return index;
      }
      if (code === ESCAPE && value.charCodeAt(index + 1) === BACKSLASH) {
        return index + 1;
      }
    }
    return value.length;
  }
  return start + 1;
};

export function stripTerminalControlSequences(value: string): string {
  let stripped = "";
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code === ESCAPE) {
      index = escapeSequenceEnd(value, index);
      continue;
    }
    if (isPrintable(code)) {
      stripped += value[index];
    }
  }
  return stripped;
}

/**
 * Last human-meaningful line of a terminal output chunk, or null when the chunk
 * carries no printable text (cursor moves, spinner repaints, blank lines).
 */
export function lastTerminalOutputLine(chunk: string): string | null {
  const lines = stripTerminalControlSequences(chunk).split(/\r?\n|\r/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index]?.trim();
    if (line) {
      return line;
    }
  }
  return null;
}
