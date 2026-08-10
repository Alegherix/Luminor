import { describe, expect, it } from "vitest";
import { lastTerminalOutputLine, stripTerminalControlSequences } from "./previewOutput";

const ESC = String.fromCharCode(0x1b);
const BELL = String.fromCharCode(0x07);

describe("stripTerminalControlSequences", () => {
  it("removes CSI colour sequences", () => {
    expect(stripTerminalControlSequences(`${ESC}[31mError${ESC}[0m`)).toBe("Error");
  });

  it("removes OSC title sequences terminated by BEL or ST", () => {
    expect(stripTerminalControlSequences(`${ESC}]0;title${BELL}ready`)).toBe("ready");
    expect(stripTerminalControlSequences(`${ESC}]0;title${ESC}\\ready`)).toBe("ready");
  });

  it("keeps newlines, carriage returns and tabs", () => {
    expect(stripTerminalControlSequences("a\tb\r\nc")).toBe("a\tb\r\nc");
  });

  it("drops other non-printable bytes", () => {
    expect(stripTerminalControlSequences(`a${String.fromCharCode(0x08)}b`)).toBe("ab");
  });
});

describe("lastTerminalOutputLine", () => {
  it("returns the last printable line", () => {
    expect(lastTerminalOutputLine("first\nsecond\n")).toBe("second");
  });

  it("ignores blank and control-only trailing lines", () => {
    expect(lastTerminalOutputLine(`ready\n${ESC}[2K\r   \n`)).toBe("ready");
  });

  it("splits on bare carriage returns from progress repaints", () => {
    expect(lastTerminalOutputLine("10%\r50%\r100%")).toBe("100%");
  });

  it("returns null for output without printable text", () => {
    expect(lastTerminalOutputLine(`${ESC}[2J${ESC}[H`)).toBeNull();
    expect(lastTerminalOutputLine("   \n\n")).toBeNull();
  });
});
