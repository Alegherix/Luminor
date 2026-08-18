import { describe, expect, it } from "vitest";

import { parseInboundArgv } from "./parseInboundArgv";

const electronArgv = [
  "/usr/lib/electron/electron",
  "--luminor-dev-root=/home/user/Luminor",
  "/home/user/Luminor/apps/desktop/dist-electron/main.js",
];

describe("parseInboundArgv", () => {
  it("treats argv without --new-chat as not inbound", () => {
    expect(parseInboundArgv([...electronArgv, "--prompt-file", "/tmp/prompt.md"])).toEqual({
      kind: "none",
    });
    expect(parseInboundArgv(electronArgv)).toEqual({ kind: "none" });
    expect(parseInboundArgv([])).toEqual({ kind: "none" });
  });

  it("parses a required absolute --prompt-file and optional inbound flags", () => {
    expect(
      parseInboundArgv([
        ...electronArgv,
        "--type=renderer",
        "--new-chat",
        "--prompt-file",
        "/tmp/luminor-inbound-XXXX.md",
        "--title",
        "Process crashed: node",
        "--folder",
        "Crashes",
        "--submit",
      ]),
    ).toEqual({
      kind: "inbound",
      command: {
        promptFile: "/tmp/luminor-inbound-XXXX.md",
        title: "Process crashed: node",
        folderName: "Crashes",
        submit: true,
      },
    });
  });

  it("accepts --flag=value forms and defaults submit to false", () => {
    expect(
      parseInboundArgv([
        "--new-chat",
        "--prompt-file=/tmp/prompt.md",
        "--title=Hello",
        "--folder=Inbox",
      ]),
    ).toEqual({
      kind: "inbound",
      command: {
        promptFile: "/tmp/prompt.md",
        title: "Hello",
        folderName: "Inbox",
        submit: false,
      },
    });
  });

  it("ignores Electron and Chromium switches around inbound flags", () => {
    expect(
      parseInboundArgv([
        ...electronArgv,
        "--type=gpu-process",
        "--inspect=9229",
        "--new-chat",
        "--prompt-file",
        "/abs/prompt.md",
      ]),
    ).toEqual({
      kind: "inbound",
      command: {
        promptFile: "/abs/prompt.md",
        submit: false,
      },
    });
  });

  it("rejects a relative --prompt-file", () => {
    const result = parseInboundArgv(["--new-chat", "--prompt-file", "tmp/prompt.md"]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/absolute/i);
    }
  });

  it("rejects --new-chat without --prompt-file", () => {
    const result = parseInboundArgv(["--new-chat", "--title", "x"]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/prompt-file/i);
    }
  });

  it("rejects unknown inbound flags", () => {
    const result = parseInboundArgv([
      "--new-chat",
      "--prompt-file",
      "/tmp/prompt.md",
      "--project",
      "foo",
    ]);
    expect(result.kind).toBe("error");
    if (result.kind === "error") {
      expect(result.message).toMatch(/unknown|--project/i);
    }
  });
});
